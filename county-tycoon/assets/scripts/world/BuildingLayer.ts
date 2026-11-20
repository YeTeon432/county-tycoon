import { _decorator, Component, Graphics, Layers, Node, UITransform, UIOpacity, Color, tween, Vec2, Vec3 } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { ArtLibrary } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { Facing, PlacedBuilding, TownModel } from '../core/TownModel';
import type { Decal, DecalLayer, Preview3D, Site3D } from './World3D';

const { ccclass } = _decorator;

/** 覆盖范围要画的东西：道路格 + 住宅占地 */
export interface ReachDraw {
    circle?: { col: number; row: number; radius: number };
    roads: [number, number][];
    homes: { col: number; row: number; width: number; height: number }[];
}

/**
 * 建筑层（等距，D014；T540h 起只剩「看不见的那一半」）。
 *
 * 楼、山树、工地、塔吊、放置预览、贴地色块都由 World3D 画成 3D（D033）。这里每栋楼留一个**看不见的 2D 节点**：
 *   - 原点 = 投影外框底边中点，锚点 (0.5, 0)，大小 = 3D 包围盒（占地 × 模型高度）投到屏幕上的外框；
 *   - 点楼按包围盒投影的六边形判定（T540h，取代 T424 的画面蒙版：转到任何角度都对）；
 *   - 楼顶气泡、小旗、施工进度条、完工尘土挂在它下面，按它的高度摆。
 * 3D 相机和 2D 坐标严格对齐（World3D.syncCamera），所以这些 2D 东西和 3D 楼在屏幕上对得上。
 */
@ccclass('BuildingLayer')
export class BuildingLayer extends Component {
    private _iso: IsoMath | null = null;
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;

    private _objRoot: Node | null = null;
    private _reach: ReachDraw | null = null;
    /** uid -> 节点。重画时只增删有变化的 */
    private readonly _nodes = new Map<number, Node>();
    /** 节点 -> 建筑前后排序键 */
    private readonly _depth = new Map<Node, number>();
    /** uid -> 楼（算包围盒要占地和 id） */
    private readonly _placed = new Map<number, PlacedBuilding>();
    /** uid -> 点楼时缓存的投影凸包（节点本地坐标，[x0, y0, x1, y1, ...] 逆时针） */
    private readonly _hull = new Map<number, number[]>();
    /** uid -> 上次算包围盒时的 id + 位置（翻盖换了 id 要重算） */
    private readonly _key = new Map<number, string>();

    /** 模型高度（格）；World3D.heightOf。没加载到返回 0 */
    heightOf: ((id: string) => number) | null = null;
    /** 3D 工地（T540e） */
    site3D: ((uid: number, site: Site3D | null) => void) | null = null;
    sites3DReady: (() => boolean) | null = null;
    /** 3D 放置预览（T540e） */
    preview3D: ((p: Preview3D | null) => void) | null = null;
    /** 贴地色块画到 3D 地面上（占地菱形、环境图层、覆盖范围；T540e / T547） */
    decal3D: ((layer: DecalLayer, list: readonly Decal[]) => void) | null = null;

    private readonly _cGhostOk = new Color(35, 209, 118, 130);
    private readonly _cGhostBad = new Color(240, 74, 69, 150);
    private readonly _cGhostEdgeOk = new Color(148, 255, 191, 255);
    private readonly _cGhostEdgeBad = new Color(241, 63, 58, 255);

    static create(iso: IsoMath, model: TownModel, art: ArtLibrary): Node {
        const node = new Node('BuildingLayer');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        node.addComponent(BuildingLayer).setup(iso, model, art);
        return node;
    }

    get art(): ArtLibrary | null {
        return this._art;
    }

    /** 测试探针用：按前后顺序排好的建筑节点 */
    get objectRoot(): Node | null {
        return this._objRoot;
    }

    setup(iso: IsoMath, model: TownModel, art: ArtLibrary): void {
        this._iso = iso;
        this._model = model;
        this._art = art;
        this._objRoot = BuildingLayer.makeChild(this.node, 'Objects');
        this.redraw();
    }

    /** 建筑增删之后调一次 */
    redraw(): void {
        const model = this._model;
        if (!model || !this._objRoot) return;
        const alive = new Set<number>();
        for (const b of model.allBuildings()) {
            if (b.def.flat) continue;
            alive.add(b.uid);
            this.syncNode(b);
        }
        this._nodes.forEach((node, uid) => {
            if (alive.has(uid)) return;
            // destroy 要到帧末才生效，先摘下来，同一帧内再查子节点也是对的
            node.removeFromParent();
            node.destroy();
            this._depth.delete(node);
            this._nodes.delete(uid);
            this._placed.delete(uid);
            this._hull.delete(uid);
            this._key.delete(uid);
            this._site.delete(uid);
            this._barAt.delete(uid);
        });
        this.sortAll();
    }

    private syncNode(b: PlacedBuilding): void {
        let node = this._nodes.get(b.uid);
        const old = this._placed.get(b.uid);
        if (!node) {
            node = BuildingLayer.makeChild(this._objRoot!, `B${b.uid}_${b.def.id}`);
            node.getComponent(UITransform)!.setAnchorPoint(new Vec2(0.5, 0));
            this._nodes.set(b.uid, node);
        } else if (old === b && this._key.get(b.uid) === `${b.def.id}|${b.col},${b.row}`) {
            return;
        }
        this._key.set(b.uid, `${b.def.id}|${b.col},${b.row}`);
        this._placed.set(b.uid, b);
        this.applyShape(b.uid);
    }

    /** 3D 里 1 格高在屏幕上是几个 2D 单位（俯角 30°：hw·√2·cos30°） */
    private get vk(): number {
        return this._iso ? this._iso.hw * Math.sqrt(6) / 2 : 19.6;
    }

    /** 这种楼此刻看得见的高度（格）：施工中按工地，模型没加载到按占地估 */
    private height3D(uid: number): number {
        const b = this._placed.get(uid);
        if (!b) return 1;
        const site = this._site.get(uid);
        const id = site ? `build-${site.n}-${Math.max(0, site.stage)}` : b.def.id;
        const h = this.heightOf ? this.heightOf(id) : 0;
        return h > 0 ? h : 0.6 + 0.3 * Math.max(b.def.width, b.def.height);
    }

    /** 放置确认条用：模型高度在画面上投出多少 2D 单位。 */
    previewRoofHeight(id: string): number {
        const h = this.heightOf?.(id) ?? 0;
        return (h > 0 ? h : 1) * this.vk;
    }

    /**
     * 用投影外框定位楼顶标记。详细的点击多边形等到点楼时再算。
     */
    private applyShape(uid: number, live = false): void {
        const node = this._nodes.get(uid), b = this._placed.get(uid), iso = this._iso;
        if (!node || !b || !iso) return;
        const box = iso.footprintBounds(b.col, b.row, b.def.width, b.def.height);
        const h = box.top - box.bottom + this.height3D(uid) * this.vk;
        node.setPosition(box.x, box.bottom, 0);
        this._hull.delete(uid);
        if (!live) this._depth.set(node, -(box.top + box.bottom) / 2);
        const ui = node.getComponent(UITransform)!;
        ui.setContentSize(box.width, h);
        node.getChildByName('Alert')?.setPosition(0, h + 12, 0);
        node.getChildByName('Flag')?.setPosition(-box.width * 0.28, h - 4, 0);
    }

    private hitHull(uid: number, node: Node): number[] | undefined {
        const cached = this._hull.get(uid);
        if (cached) return cached;
        const b = this._placed.get(uid), iso = this._iso;
        if (!b || !iso) return;
        const { x, y } = node.position;
        const height = this.height3D(uid) * this.vk;
        const points: [number, number][] = [];
        for (const p of iso.footprint(b.col, b.row, b.def.width, b.def.height)) {
            points.push([p.x - x, p.y - y], [p.x - x, p.y - y + height]);
        }
        const hull = BuildingLayer.convexHull(points);
        this._hull.set(uid, hull);
        return hull;
    }

    /** 凸包（Andrew 单调链），返回逆时针的 [x0, y0, x1, y1, ...] */
    private static convexHull(pts: [number, number][]): number[] {
        const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower: [number, number][] = [], upper: [number, number][] = [];
        for (const q of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
        for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
        const out: number[] = [];
        for (const q of lower.slice(0, -1).concat(upper.slice(0, -1))) out.push(q[0], q[1]);
        return out;
    }

    /** 塔吊动画时间（游戏秒，跟倍速走） */
    private _craneT = 0;
    /** uid -> 工地占地。开工第一帧记一次 */
    private readonly _site = new Map<number, { n: number; w: number; h: number; stage: number; col: number; row: number }>();
    /** uid -> 进度条上次画的样子（进度量化到 0.5%），没变就不重画 Graphics */
    private readonly _barAt = new Map<number, { p: number; w: number; y: number }>();

    /** 每帧推塔吊动画（WorldView 调，dt 已乘倍速；暂停时传 0） */
    tickConstruction(dt: number): void {
        this._craneT += dt;
    }

    /**
     * 施工中（D026，DESIGN 24）：工地三阶段 + 塔吊由 World3D 画（T540e），这里管头顶进度条。
     * progress = null 表示完工：撤掉工地，楼「落成」弹一下 + 脚下一圈尘土。
     */
    setConstruction(uid: number, progress: number | null): void {
        const node = this._nodes.get(uid);
        if (!node) return;
        let bar = node.getChildByName('BuildBar');
        if (progress === null) {
            const info = this._site.get(uid);
            if (!info && !bar) return;
            this._site.delete(uid);
            this._barAt.delete(uid);
            if (bar) bar.destroy();
            if (this.site3D) this.site3D(uid, null);
            this.applyShape(uid);
            this.playTopOut(node, info);
            return;
        }
        let info = this._site.get(uid);
        if (!info) {
            const b = this._placed.get(uid);
            const bw = b ? b.def.width : 1, bh = b ? b.def.height : 1;
            info = { n: Math.max(bw, bh) >= 2 ? 2 : 1, w: bw, h: bh, stage: -1, col: b ? b.col : 0, row: b ? b.row : 0 };
            this._site.set(uid, info);
        }
        const n = info.n;
        const stage = progress < 0.34 ? 0 : progress < 0.67 ? 1 : 2;
        if (info.stage !== stage) { info.stage = stage; this.applyShape(uid); }
        // 吊臂 0→3→0 来回摆，每帧 0.35 游戏秒；各工地错开一点
        const k = Math.floor(this._craneT / 0.35 + uid) % 6;
        if (this.site3D && (!this.sites3DReady || this.sites3DReady())) {
            this.site3D(uid, { col: info.col, row: info.row, w: info.w, h: info.h, n, stage, crane: k < 4 ? k : 6 - k });
        }
        // 进度条贴着工地顶（不跟塔吊尖走：那样会飘到两三倍楼高，压在邻居楼的窗上）
        const topY = node.getComponent(UITransform)!.contentSize.height;
        const hw = this._iso ? this._iso.hw : 16;
        const w = Math.min(34, Math.max(18, (info.w + info.h) * hw * 0.62)), h = 4;
        const y = topY + 4;
        const p = Math.round(progress * 200) / 200;     // 量化到 0.5%，值没变就不重画
        const last = this._barAt.get(uid);
        if (!bar) {
            bar = BuildingLayer.makeChild(node, 'BuildBar');
            bar.addComponent(Graphics);
        }
        if (!last || last.w !== w || last.y !== y) bar.setPosition(0, y, 0);
        if (!last || last.w !== w || last.y !== y || last.p !== p) {
            const g = bar.getComponent(Graphics)!;
            g.clear();
            g.fillColor = new Color(40, 44, 52, 230);
            g.roundRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 2);
            g.fill();
            g.fillColor = new Color(246, 201, 56, 255);
            g.roundRect(-w / 2, -h / 2, Math.max(1, w * p), h, 1.5);
            g.fill();
            this._barAt.set(uid, { p, w, y });
        }
    }

    /**
     * 完工：楼从矮一点弹到原样（3D 楼由 World3D 弹）+ 脚下一圈尘土散开。
     * 尘土以占地中心为圆心。
     */
    private playTopOut(node: Node, info?: { n: number; w: number; h: number; col: number; row: number }): void {
        const iso = this._iso;
        const w = info ? info.w : 1, h = info ? info.h : 1;
        // 占地中心（按当前视角投影，转过视角也在楼脚下）
        const c = iso && info ? iso.toLocal(info.col + w / 2, info.row + h / 2) : null;
        const cx = c ? c.x - node.position.x : 0;
        const cy = c ? c.y - node.position.y : 6;
        const dust = BuildingLayer.makeChild(node, 'Dust');
        dust.setSiblingIndex(0);          // 压在楼下面，像从楼脚下散出来
        dust.setPosition(cx, cy, 0);
        const g = dust.addComponent(Graphics);
        const op = dust.addComponent(UIOpacity);
        const r0 = iso ? (w + h) * iso.hw * 0.55 : 20;
        const puff = { r: r0 * 0.5 };
        const draw = () => {
            g.clear();
            g.fillColor = new Color(236, 226, 205, 190);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                g.circle(Math.cos(a) * puff.r, Math.sin(a) * puff.r * 0.5, r0 * 0.16);
            }
            g.fill();
        };
        draw();
        tween(puff).to(0.6, { r: r0 * 1.15 }, { onUpdate: draw }).start();
        tween(op).to(0.6, { opacity: 0 }).call(() => dust.destroy()).start();
    }

    /**
     * 楼顶气泡（D026）：'leave' 红色「!」（有人想走）/ 'wish' 蓝色心愿气泡 / null 去掉。
     * 两种都有时只显示红的。
     */
    setAlert(uid: number, kind: 'leave' | 'wish' | null): void {
        const node = this._nodes.get(uid);
        if (!node) return;
        const old = node.getChildByName('Alert');
        if (old && (old as any)._kind === kind) return;
        if (old) { old.removeFromParent(); old.destroy(); }
        if (!kind) return;
        const b = BuildingLayer.makeChild(node, 'Alert');
        (b as any)._kind = kind;
        const ui = node.getComponent(UITransform)!;
        b.setPosition(0, ui.contentSize.height + 12, 0);
        if (kind === 'wish') { this.wishBubble(b); return; }
        const g = b.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 255);
        g.circle(0, 0, 7.5);
        g.fill();
        g.fillColor = new Color(232, 87, 74, 255);
        g.circle(0, 0, 6);
        g.moveTo(-2.5, -5); g.lineTo(2.5, -5); g.lineTo(0, -10); g.close();
        g.fill();
        g.fillColor = new Color(255, 255, 255, 255);
        g.rect(-1, -1, 2, 5);
        g.fill();
        g.circle(0, -3, 1.1);
        g.fill();
    }

    /**
     * 心愿气泡：蓝底对话框 + 白色五角星，上下浮 + 一呼一吸地放大缩小。
     * 不用「…」：行人闲聊气泡（LifeLayer）以前也是「…」，玩家会把两者看混。
     */
    private wishBubble(anchor: Node): void {
        const b = BuildingLayer.makeChild(anchor, 'Wish');
        const g = b.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 255);
        g.roundRect(-9.5, -6.5, 19, 13, 6);
        g.moveTo(-3, -6); g.lineTo(0, -11); g.lineTo(3, -6); g.close();
        g.fill();
        g.fillColor = new Color(58, 134, 214, 255);
        g.roundRect(-8, -5, 16, 10, 5);
        g.moveTo(-2, -4.5); g.lineTo(0, -9); g.lineTo(2, -4.5); g.close();
        g.fill();
        // 五角星：外半径 4.2、内半径 1.8，尖朝上
        g.fillColor = new Color(255, 214, 72, 255);
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? 4.2 : 1.8;
            const a = Math.PI / 2 + (i * Math.PI) / 5;
            const px = Math.cos(a) * r, py = Math.sin(a) * r + 0.2;
            if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.close();
        g.fill();
        tween(b).repeatForever(tween(b).to(0.8, { position: new Vec3(0, 2, 0) }).to(0.8, { position: new Vec3(0, 0, 0) })).start();
        tween(b).repeatForever(tween(b).to(0.5, { scale: new Vec3(1.12, 1.12, 1) }).to(0.5, { scale: new Vec3(1, 1, 1) }).delay(0.6)).start();
    }

    /**
     * 环境图层：cells = [col, row, 值]，正绿负红，越大越浓。空数组 = 清掉。贴在 3D 地面上（T547）。
     */
    drawEnv(cells: [number, number, number][]): void {
        if (!this.decal3D) return;
        const list: Decal[] = [];
        for (const [c, r, v] of cells) {
            if (!v) continue;
            const a = Math.min(170, 50 + Math.abs(v) * 40);
            list.push({ c, r, w: 1, h: 1, fill: v > 0 ? new Color(76, 200, 90, a) : new Color(232, 70, 60, a) });
        }
        this.decal3D('env', list);
    }

    /** 特色街道成员楼顶的小旗（D026）：color = null 去掉 */
    setStreetFlag(uid: number, color: Color | null): void {
        const node = this._nodes.get(uid);
        if (!node) return;
        let f = node.getChildByName('Flag');
        if (!color) { if (f) f.destroy(); return; }
        if (!f) {
            f = BuildingLayer.makeChild(node, 'Flag');
            f.addComponent(Graphics);
        }
        const ui = node.getComponent(UITransform)!;
        f.setPosition(-ui.contentSize.width * 0.28, ui.contentSize.height * (1 - ui.anchorY) - 4, 0);
        const g = f.getComponent(Graphics)!;
        g.clear();
        g.strokeColor = new Color(90, 90, 90, 255);
        g.lineWidth = 0.8;
        g.moveTo(0, 0); g.lineTo(0, 12);
        g.stroke();
        g.fillColor = color;
        g.moveTo(0, 12); g.lineTo(8, 9.5); g.lineTo(0, 7); g.close();
        g.fill();
    }

    /** 覆盖范围（T538）：蓝色 = 沿路走得到的路，黄框 = 范围内的住宅；null = 清掉。贴在 3D 地面上（T547） */
    drawReach(reach: ReachDraw | null): void {
        this._reach = reach;
        if (!this.decal3D) return;
        const list: Decal[] = [];
        if (reach) {
            const road = new Color(70, 150, 240, 110), fill = new Color(255, 205, 60, 120), edge = new Color(240, 160, 20, 230);
            if (reach.circle && this._model) {
                const { col, row, radius } = reach.circle;
                const map = this._model;
                const color = new Color(42, 144, 225, 96);
                const edges = (z: number): [number, number] => {
                    const half = Math.sqrt(Math.max(0, radius * radius - (z - row) ** 2));
                    return [Math.max(0, col - half), Math.min(map.width, col + half)];
                };
                // 用相邻的圆弦拼成贴地网格，圆落到地图外的部分裁在边界上。
                const end = Math.min(map.height, row + radius);
                for (let z = Math.max(0, row - radius); z < end; z += 0.25) {
                    const next = Math.min(end, z + 0.25);
                    const [left, right] = edges(z);
                    list.push({ c: left, r: z, w: right - left, h: next - z, fill: color, farEdge: edges(next) });
                }
            }
            for (const [c, r] of reach.roads) list.push({ c, r, w: 1, h: 1, fill: road });
            for (const h of reach.homes) list.push({ c: h.col, r: h.row, w: h.width, h: h.height, fill, stroke: edge });
        }
        this.decal3D('reach', list);
    }

    /**
     * 转动时更新楼顶标记的位置，停稳时更新标记和点击的前后顺序。
     */
    relayout(live: boolean): void {
        this._placed.forEach((_b, uid) => this.applyShape(uid, live));
        if (!live) this.sortAll();
    }

    /** 某栋建筑的节点（金币特效找位置用） */
    nodeOf(uid: number): Node | null {
        return this._nodes.get(uid) ?? null;
    }

    /**
     * 按画面点楼（坐标同行人：Objects 节点里的本地坐标）。按 3D 包围盒投到屏幕上的六边形判定（T540h）。
     * 1. 先找点中的楼，重叠时取画在前面的（排序键大的）；楼顶气泡也算这栋。
     * 2. 一栋都没点中（点在楼缝里）且 slop > 0：找 slop 范围内离手指最近的那栋。
     */
    pickBuildingAt(x: number, y: number, slop = 0): number | null {
        let best: number | null = null, bestDepth = -Infinity;
        this._nodes.forEach((node, uid) => {
            if (!node.isValid || !this.nodeHit(node, x, y)) return;
            const d = this._depth.get(node) ?? 0;
            if (d > bestDepth) { bestDepth = d; best = uid; }
        });
        if (best !== null || slop <= 0) return best;
        // 就近：以 1 个世界单位为步长扫一圈，取画面离手指最近的那栋，同样近取前面的
        let bestDist = Infinity;
        const r = Math.ceil(slop);
        this._nodes.forEach((node, uid) => {
            if (!node.isValid) return;
            const ui = node.getComponent(UITransform)!;
            const w = ui.contentSize.width, h = ui.contentSize.height;
            const dx = x - node.position.x, dy = y - node.position.y;
            if (w <= 0 || dx < -w / 2 - slop || dx > w / 2 + slop || dy < -slop || dy > h + 40 + slop) return;
            const d = this._depth.get(node) ?? 0;
            for (let oy = -r; oy <= r; oy++) {
                for (let ox = -r; ox <= r; ox++) {
                    const dist = ox * ox + oy * oy;
                    if (dist > slop * slop || dist > bestDist) continue;
                    if (dist === bestDist && d <= bestDepth) continue;
                    if (!this.nodeHit(node, x + ox, y + oy)) continue;
                    bestDist = dist; bestDepth = d; best = uid;
                }
            }
        });
        return best;
    }

    /** 这栋楼（或工地）的包围盒 / 楼顶气泡有没有盖住这一点 */
    private nodeHit(node: Node, x: number, y: number): boolean {
        const dx = x - node.position.x, dy = y - node.position.y;
        const { width, height } = node.getComponent(UITransform)!.contentSize;
        if (node.getChildByName('Alert') && Math.abs(dx) <= 16 && Math.abs(dy - height - 12) <= 16) return true;
        if (Math.abs(dx) > width / 2 || dy < 0 || dy > height) return false;
        const hull = this.hitHull(BuildingLayer.uidOf(node), node);
        if (!hull) return false;
        // 逆时针凸多边形：点在每条边的左边
        const n = hull.length;
        for (let i = 0; i < n; i += 2) {
            const ax = hull[i], ay = hull[i + 1], bx = hull[(i + 2) % n], by = hull[(i + 3) % n];
            if ((bx - ax) * (dy - ay) - (by - ay) * (dx - ax) < 0) return false;
        }
        return true;
    }

    private static uidOf(node: Node): number {
        const m = /^B(\d+)_/.exec(node.name);
        return m ? Number(m[1]) : -1;
    }

    /**
     * 楼顶中点（Objects 本地坐标；T425 追踪箭头指这里）。施工中按工地高度；没有这栋楼返回 null。
     */
    topOf(uid: number): { x: number; y: number } | null {
        const node = this._nodes.get(uid);
        if (!node || !node.isValid) return null;
        let h = node.getComponent(UITransform)!.contentSize.height;
        if (h <= 0) h = 30;
        return { x: node.position.x, y: node.position.y + h };
    }

    /** 点的位置是不是楼顶气泡（气泡中心在楼顶上方 12，留宽一点好点中） */
    hitAlert(uid: number, x: number, y: number): boolean {
        const node = this._nodes.get(uid);
        if (!node || !node.getChildByName('Alert')) return false;
        const h = node.getComponent(UITransform)!.contentSize.height;
        const dx = x - node.position.x, dy = y - node.position.y - h - 12;
        return Math.abs(dx) <= 16 && Math.abs(dy) <= 16;
    }

    /** 按排序键重排建筑的 2D 标记。 */
    private sortAll(): void {
        const root = this._objRoot;
        if (!root) return;
        const kids = root.children.slice();
        kids.sort((a, b) => (this._depth.get(a) ?? 0) - (this._depth.get(b) ?? 0));
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].getSiblingIndex() !== i) kids[i].setSiblingIndex(i);
        }
    }

    /** 鼠标移动时只画贴地占格，点选后再摆真模型。 */
    showGhost(def: BuildingDef, col: number, row: number, ok: boolean): void {
        if (this.preview3D) this.preview3D(null);
        this.showGhostShape(def, col, row, ok);
    }

    private showGhostShape(def: BuildingDef, col: number, row: number, ok: boolean): void {
        const model = this._model;
        if (!this.decal3D || !model) return;
        const cells: Decal[] = [];
        let hasConflict = false;
        const inset = 0.035;
        for (let r = row; r < row + def.height; r++) {
            for (let c = col; c < col + def.width; c++) {
                const blocked = !ok && (!model.inBounds(c, r) || !!model.getAt(c, r)
                    || model.terrain?.canBuildCell(def, c, r) === false);
                hasConflict ||= blocked;
                cells.push({
                    c: c + inset, r: r + inset, w: 1 - 2 * inset, h: 1 - 2 * inset,
                    fill: blocked ? this._cGhostBad : this._cGhostOk,
                    stroke: blocked ? this._cGhostEdgeBad : null,
                });
            }
        }
        // 预算、解锁和港口临河要求会拦住整块地，没有单独的冲突格。
        if (!ok && !hasConflict) {
            for (const cell of cells) cell.fill = this._cGhostBad;
        }
        const outset = 0.045;
        cells.push({ c: col - outset, r: row - outset, w: def.width + 2 * outset, h: def.height + 2 * outset, fill: null,
            stroke: ok ? this._cGhostEdgeOk : this._cGhostEdgeBad });
        this.decal3D('ghost', cells);
    }

    showDemolition(target: PlacedBuilding): void {
        // 描边略超出占地，让贴着地块边缘的楼体也能露出红线。
        const outset = 0.075;
        this.decal3D?.('ghost', [{
            c: target.col - outset, r: target.row - outset,
            w: target.def.width + 2 * outset, h: target.def.height + 2 * outset,
            fill: this._cGhostBad, stroke: this._cGhostEdgeBad,
        }]);
    }

    clearGhost(): void {
        if (this.preview3D) this.preview3D(null);
        if (this.decal3D) this.decal3D('ghost', []);
    }

    /** 放置预览（D022）：占地菱形 + 真模型（按给定朝向，放不下染红；T540e） */
    showPreview(def: BuildingDef, col: number, row: number, facing: Facing | null, ok: boolean): void {
        this.showGhostShape(def, col, row, ok);
        if (!this.preview3D) return;
        if (def.flat) { this.preview3D(null); return; }
        this.preview3D({ id: def.id, col, row, w: def.width, h: def.height, facing, ok });
    }

    /** 3D 模型加载完：按模型高度重算每栋楼的包围盒 */
    refresh3D(): void {
        this._placed.forEach((_b, uid) => this.applyShape(uid));
    }

    private static makeChild(parent: Node, name: string): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        return node;
    }
}
