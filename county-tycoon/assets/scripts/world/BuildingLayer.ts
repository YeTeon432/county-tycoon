import { _decorator, Component, Graphics, Layers, Node, UITransform, UIOpacity, Color, Sprite, SpriteFrame, Tween, tween, Vec2, Vec3 } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { ArtLibrary } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { Facing, PlacedBuilding, TownModel } from '../core/TownModel';
import { hexToColor, shade } from '../core/ColorUtil';

const { ccclass } = _decorator;

/**
 * 建筑层（等距，D014）。
 *
 * 每栋建筑一个子节点，节点原点 = 占地菱形的最下顶点：
 *   - 有贴图：Sprite，锚点在图的底边中点
 *   - 没贴图：Graphics 画一个等距色块（屋顶 + 左墙 + 右墙），颜色取 buildings.json 的 color
 * 每次重画后按 iso.depth 排兄弟顺序，后面的建筑压住前面的。
 * 贴地的东西（马路，def.flat）不在这里画，交给 GridMap。
 *
 * 放置预览是单独一层 Graphics（Ghost 节点），永远压在最上面。
 */
@ccclass('BuildingLayer')
export class BuildingLayer extends Component {
    private _iso: IsoMath | null = null;
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;

    private _objRoot: Node | null = null;
    private _ghost: Graphics | null = null;
    private _envG: Graphics | null = null;
    /** 放置预览的半透明贴图（D022） */
    private _ghostSprite: Sprite | null = null;
    /** uid -> 节点。重画时只增删有变化的 */
    private readonly _nodes = new Map<number, Node>();
    /** uid -> 节点当前显示的是哪张图（null = 色块）。贴图晚到、朝向变化时据此重建 */
    private readonly _shown = new Map<number, SpriteFrame | null>();
    /** 节点 -> 前后排序键（建筑和会动的东西共用，见 sortAll） */
    private readonly _depth = new Map<Node, number>();
    /** 山、树林的精灵节点 */
    private readonly _terrainNodes: Node[] = [];
    /** 尺寸不对的图只警告一次 */
    private readonly _warned = new Set<string>();

    private readonly _cMain = new Color();
    private readonly _cTmp = new Color();
    private readonly _cGhostOk = new Color(255, 255, 255, 80);
    private readonly _cGhostBad = new Color(224, 74, 74, 110);
    private readonly _cGhostEdgeOk = new Color(255, 255, 255, 230);
    private readonly _cGhostEdgeBad = new Color(224, 74, 74, 240);
    private readonly _cGhostTint = new Color(255, 120, 110, 255);

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
        // 环境图层（D026，DESIGN 22）：贴在地面上、压在楼下面
        this._envG = BuildingLayer.makeChild(this.node, 'EnvOverlay').addComponent(Graphics);
        this._objRoot = BuildingLayer.makeChild(this.node, 'Objects');
        this._ghost = BuildingLayer.makeChild(this.node, 'Ghost').addComponent(Graphics);
        const gs = BuildingLayer.makeChild(this.node, 'GhostSprite');
        gs.getComponent(UITransform)!.setAnchorPoint(new Vec2(0.5, 0));
        gs.addComponent(UIOpacity).opacity = 170;
        this._ghostSprite = gs.addComponent(Sprite);
        this._ghostSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._ghostSprite.trim = false;
        gs.active = false;
        this.redraw();
    }

    /** 建筑增删、贴图加载完之后调一次 */
    redraw(): void {
        const model = this._model;
        const root = this._objRoot;
        if (!model || !root) return;

        const list = model.allBuildings();
        const alive = new Set<number>();
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.def.flat) continue;
            alive.add(b.uid);
            this.syncNode(b);
        }

        this._nodes.forEach((node, uid) => {
            if (!alive.has(uid)) {
                // destroy 要到帧末才生效，先摘下来，同一帧内再查子节点也是对的
                node.removeFromParent();
                node.destroy();
                this._depth.delete(node);
                this._nodes.delete(uid);
                this._shown.delete(uid);
                this._site.delete(uid);
                this._barAt.delete(uid);
            }
        });

        this.sortByDepth(list);
    }

    /**
     * 地形上立起来的东西：山、树林（支线 C 画在建筑图集里的 terrain-*）。
     * 每格一个精灵，和建筑、行人共用前后排序，所以人和楼会被山挡住、也能挡住山。
     * 地形变了（以后砍树开荒）再调一次即可，已有的节点会清掉重建。
     */
    syncTerrainObjects(): void {
        const art = this._art, model = this._model, iso = this._iso, root = this._objRoot;
        if (!art || !model || !iso || !root) return;
        const t = model.terrain;
        for (const n of this._terrainNodes) { this._depth.delete(n); n.removeFromParent(); n.destroy(); }
        this._terrainNodes.length = 0;
        if (!t) return;
        const pick = (kind: string, c: number, r: number) => {
            const h = ((c * 73856093) ^ (r * 19349663)) >>> 0;
            if (kind === 'mountain') return art.get(`terrain-mountain-${h % 3}`);
            if (kind === 'forest') return art.get(`terrain-forest-${h % 4}`);
            if (kind === 'pond' && h % 3 === 0) return art.get('terrain-pond-lily');
            return null;
        };
        for (let r = 0; r < t.height; r++) {
            for (let c = 0; c < t.width; c++) {
                if (model.getAt(c, r)) continue;           // 已经盖了东西的格子不再立树
                const frame = pick(t.typeAt(c, r), c, r);
                if (!frame) continue;
                const node = BuildingLayer.makeChild(root, `T${c}_${r}`);
                const ui = node.getComponent(UITransform)!;
                ui.setAnchorPoint(new Vec2(0.5, 0));
                const sz = art.worldSize(frame);
                ui.setContentSize(sz.width, sz.height);
                const p = iso.footBottom(c, r, 1, 1);
                node.setPosition(p.x, p.y, 0);
                const s = node.addComponent(Sprite);
                s.sizeMode = Sprite.SizeMode.CUSTOM;
                s.trim = false;
                s.spriteFrame = frame;
                this._depth.set(node, iso.depth(c, r, 1, 1));
                this._terrainNodes.push(node);
            }
        }
        this.sortAll();
    }

    /** 塔吊动画时间（游戏秒，跟倍速走） */
    private _craneT = 0;

    /**
     * uid -> 工地占地。开工第一帧记一次，之后不再每帧遍历 allBuildings()
     * （工地多的时候那是 60 次/秒 × 工地数 的全图扫描）
     */
    private readonly _site = new Map<number, { n: number; w: number; h: number; stage: number }>();
    /** uid -> 进度条上次画的样子（进度量化到 0.5%），没变就不重画 Graphics */
    private readonly _barAt = new Map<number, { p: number; w: number; y: number }>();

    /** 每帧推塔吊动画（WorldView 调，dt 已乘倍速；暂停时传 0） */
    tickConstruction(dt: number): void {
        this._craneT += dt;
    }

    /**
     * 施工中的样子（D026，DESIGN 24）：楼本身先藏起来，换成工地图（围挡打地基 → 框架 + 脚手架 → 安全网封顶，
     * 按进度切三档）+ 塔吊（吊臂来回摆 4 帧）+ 头顶进度条。progress = null 表示完工：撤掉工地，楼「落成」弹一下。
     * 图在 docs/art/3d/construction.py。没有图（旧图集）时退回半透明 + 进度条。
     */
    setConstruction(uid: number, progress: number | null): void {
        const node = this._nodes.get(uid);
        const art = this._art;
        if (!node || !art) return;
        const sprite = node.getComponent(Sprite);
        const site = node.getChildByName('Site'), crane = node.getChildByName('Crane');
        let bar = node.getChildByName('BuildBar');
        if (progress === null) {
            const info = this._site.get(uid);
            this._site.delete(uid);
            this._barAt.delete(uid);
            if (!site && !crane && !bar) return;
            if (bar) bar.destroy();
            // 楼露出来：从「矮一截」弹到原样；工地淡出收尾，别一帧硬切（网拆掉、楼落定）
            if (sprite) sprite.enabled = true;
            const op = node.getComponent(UIOpacity);
            if (op) op.opacity = 255;
            for (const f of [site, crane]) {
                if (!f) continue;
                f.setSiblingIndex(node.children.length - 1);   // 压在楼上面淡出，不然楼先露出来又被网盖住
                let fop = f.getComponent(UIOpacity);
                if (!fop) fop = f.addComponent(UIOpacity);
                Tween.stopAllByTarget(fop);
                tween(fop).to(0.26, { opacity: 0 }, { easing: 'quadIn' }).call(() => f.destroy()).start();
            }
            this.playTopOut(node, info);
            return;
        }
        // 占地只在开工第一帧查一次：以前每帧 allBuildings()，工地一多就是 60 次/秒的全图扫描
        let info = this._site.get(uid);
        if (!info) {
            const b = this._model?.allBuildings().find((x) => x.uid === uid);
            const bw = b ? b.def.width : 1, bh = b ? b.def.height : 1;
            info = { n: Math.max(bw, bh) >= 2 ? 2 : 1, w: bw, h: bh, stage: -1 };
            this._site.set(uid, info);
        }
        const n = info.n;
        const stage = progress < 0.34 ? 0 : progress < 0.67 ? 1 : 2;
        const siteFrame = art.get(`build-${n}-${stage}`);
        const ui = node.getComponent(UITransform)!;
        let topY = ui.contentSize.height;
        /** 有工地图时的上下顺序（从下到上），进度条建好后再排 */
        let order: (Node | null)[] | null = null;
        if (siteFrame) {
            if (sprite) sprite.enabled = false;
            const s1 = this.overlay(node, 'Site', siteFrame, 0);
            // 吊臂 0→3→0 来回摆，每帧 0.35 游戏秒；各工地错开一点
            const k = Math.floor(this._craneT / 0.35 + uid) % 6;
            const cf = art.get(`crane-${n}-${k < 4 ? k : 6 - k}`);
            const s2 = cf ? this.overlay(node, 'Crane', cf, 1) : null;
            // 进度条贴着「看得见的工地」，不是贴目标楼的最终高度：学校那种高楼要盖到 100 多，
            // 工地才 53，按楼高放会飘在半空
            topY = s1.getComponent(UITransform)!.contentSize.height;
            // 地基阶段塔吊在前，楼长高后塔吊在楼后面（立在后角）。进度条始终垫在塔吊下面：
            // 1×1 塔吊压低后，封顶时吊臂正好在进度条那个高度，条在上面会把吊臂整个盖住；
            // 条和工地图不重叠（条在工地顶上方），所以垫在工地下面也不会被挡
            order = stage === 0 ? [s1, s2] : [s2, s1];
            if (info.stage !== stage) {
                if (info.stage >= 0) BuildingLayer.fadeIn(s1);   // 换阶段时淡入一下，别硬切
                info.stage = stage;
            }
        } else {
            let op = node.getComponent(UIOpacity);
            if (!op) op = node.addComponent(UIOpacity);
            op.opacity = 140;
        }
        // 进度条不跟着塔吊尖走：那样会飘到两三倍楼高，压在邻居楼的窗上，分不清是哪块工地的
        const hw = this._iso ? this._iso.hw : 16;
        const w = Math.min(34, Math.max(18, (info.w + info.h) * hw * 0.62)), h = 4;
        const y = topY + 4;
        const p = Math.round(progress * 200) / 200;     // 量化到 0.5%，值没变就不重画
        const last = this._barAt.get(uid);
        if (!bar) {
            bar = BuildingLayer.makeChild(node, 'BuildBar');
            bar.addComponent(Graphics);
        }
        if (order) {
            const seq = [bar, ...order];
            for (let i = 0; i < seq.length; i++) { const c = seq[i]; if (c && c.getSiblingIndex() !== i) c.setSiblingIndex(i); }
        } else {
            bar.setSiblingIndex(node.children.length - 1);
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

    /** 工地换阶段的淡入（0.18 秒），比硬切好认；不停连着换也不会打架 */
    private static fadeIn(node: Node): void {
        let op = node.getComponent(UIOpacity);
        if (!op) op = node.addComponent(UIOpacity);
        Tween.stopAllByTarget(op);
        op.opacity = 110;
        tween(op).to(0.18, { opacity: 255 }, { easing: 'quadOut' }).start();
    }

    /** 在楼节点里放一张和楼同锚点（底边中点）的图；已有就只换帧 */
    private overlay(node: Node, name: string, frame: SpriteFrame, index: number): Node {
        let c = node.getChildByName(name);
        if (!c) {
            c = BuildingLayer.makeChild(node, name);
            c.getComponent(UITransform)!.setAnchorPoint(new Vec2(0.5, 0));
            const sp = c.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            c.setSiblingIndex(index);
        }
        const sp = c.getComponent(Sprite)!;
        if (sp.spriteFrame !== frame) {
            sp.spriteFrame = frame;
            const sz = this._art!.worldSize(frame);
            c.getComponent(UITransform)!.setContentSize(sz.width, sz.height);
            // 楼节点是 anchor (0.5, 0)，子节点放在 (0, 0) 就是同一个底边中点
            c.setPosition(0, 0, 0);
        }
        return c;
    }

    /**
     * 完工：楼从矮一点弹到原样 + 脚下一圈尘土散开。
     * 尘土以「占地菱形中心」为圆心（节点原点是最下顶点，直接画会飘到楼前的地上），压在楼后面。
     */
    private playTopOut(node: Node, info?: { n: number; w: number; h: number; stage: number }): void {
        Tween.stopAllByTarget(node);
        node.setScale(1, 0.75, 1);
        tween(node)
            .to(0.18, { scale: new Vec3(1, 1.08, 1) }, { easing: 'quadOut' })
            .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .start();
        const iso = this._iso;
        const w = info ? info.w : 1, h = info ? info.h : 1;
        const cx = iso ? (h - w) * iso.hw / 2 : 0;
        const cy = iso ? (w + h) * iso.hh / 2 : 6;
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
        let b = node.getChildByName('Alert');
        if (b && b.name === 'Alert' && (b as any)._kind !== kind) { b.destroy(); b = null; }
        if (!kind) { if (b) b.destroy(); return; }
        if (b) return;
        if (kind === 'wish') { this.wishBubble(node); return; }
        b = BuildingLayer.makeChild(node, 'Alert');
        (b as any)._kind = kind;
        const ui = node.getComponent(UITransform)!;
        b.setPosition(0, ui.contentSize.height * (1 - ui.anchorY) + 12, 0);
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
    private wishBubble(node: Node): void {
        const b = BuildingLayer.makeChild(node, 'Alert');
        (b as any)._kind = 'wish';
        const ui = node.getComponent(UITransform)!;
        const y0 = ui.contentSize.height * (1 - ui.anchorY) + 12;
        b.setPosition(0, y0, 0);
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
        tween(b).repeatForever(tween(b).to(0.8, { position: new Vec3(0, y0 + 2, 0) }).to(0.8, { position: new Vec3(0, y0, 0) })).start();
        tween(b).repeatForever(tween(b).to(0.5, { scale: new Vec3(1.12, 1.12, 1) }).to(0.5, { scale: new Vec3(1, 1, 1) }).delay(0.6)).start();
    }

    /**
     * 环境图层：cells = [col, row, 值]，正绿负红，越大越浓。空数组 = 清掉。
     * 环境视图（看全县）和放工厂时的污染范围预览共用。
     */
    drawEnv(cells: [number, number, number][]): void {
        this._envCells = cells;
        const g = this._envG, iso = this._iso;
        if (!g || !iso) return;
        g.clear();
        const p = { x: 0, y: 0 };
        const pt = (c: number, r: number) => { iso.toLocal(c, r, p); return { x: p.x, y: p.y }; };
        for (const [c, r, v] of cells) {
            if (!v) continue;
            const a = Math.min(170, 50 + Math.abs(v) * 40);
            g.fillColor = v > 0 ? new Color(76, 200, 90, a) : new Color(232, 70, 60, a);
            const q = [pt(c, r), pt(c + 1, r), pt(c + 1, r + 1), pt(c, r + 1)];
            g.moveTo(q[0].x, q[0].y);
            for (let i = 1; i < 4; i++) g.lineTo(q[i].x, q[i].y);
            g.close();
            g.fill();
        }
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

    /** 上一次 drawEnv 的格子，转视角后重画用 */
    private _envCells: [number, number, number][] = [];

    /**
     * 视角转了（D031）：所有楼换成对应方向的图、挪到新位置、重算前后顺序；
     * 山 / 树林重建；环境图层重画。楼顶气泡、小旗、工地都是楼节点的子节点，跟着走，只按新图高度重摆。
     */
    relayout(): void {
        const model = this._model, iso = this._iso;
        if (!model || !iso) return;
        for (const b of model.allBuildings()) {
            const node = this._nodes.get(b.uid);
            if (!node) continue;
            const p = iso.footBottom(b.col, b.row, b.def.width, b.def.height);
            node.setPosition(p.x, p.y, 0);
            this._depth.set(node, iso.depth(b.col, b.row, b.def.width, b.def.height));
            const sprite = node.getComponent(Sprite);
            const frame = this.usableFrame(b.def, b.facing);
            if (!sprite || !frame || this._shown.get(b.uid) === frame) continue;
            sprite.spriteFrame = frame;
            const sz = this._art!.worldSize(frame);
            node.getComponent(UITransform)!.setContentSize(sz.width, sz.height);
            this._shown.set(b.uid, frame);
            // 气泡按新高度重建（心愿气泡的上下浮动是绝对坐标，挪不了，只能重来）
            const alert = node.getChildByName('Alert');
            if (alert) {
                const kind = (alert as any)._kind as 'leave' | 'wish';
                alert.removeFromParent();
                alert.destroy();
                this.setAlert(b.uid, kind);
            }
            const flag = node.getChildByName('Flag');
            if (flag) flag.setPosition(-sz.width * 0.28, sz.height - 4, 0);
        }
        this.syncTerrainObjects();
        this.drawEnv(this._envCells);
        this.sortAll();
    }

    /** 某栋建筑的节点（金币特效找位置用） */
    nodeOf(uid: number): Node | null {
        return this._nodes.get(uid) ?? null;
    }

    /**
     * 按画面点楼（坐标同行人：Objects 节点里的本地坐标）。
     * T424：按图的真实画面判定（atlas-hitmask.json），不再按整张图的矩形——矩形里约 40% 是透明的，
     * 前面的楼会用透明的部分把后面楼的点击抢走（县发展中心被四周高楼围着就怎么都点不到）。
     * 1. 先找「点的地方真有画面」的楼，重叠时取画在前面的（排序键大的）；楼顶气泡也算这栋。
     * 2. 一栋都没点中（点在楼缝里）且 slop > 0：找 slop 范围内画面离手指最近的那栋。
     * 施工中算工地图和塔吊；色块楼（没贴图）返回不了，交给按格子判定。
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

    /** 这栋楼此刻画出来的部分（楼本身 / 工地 / 塔吊 / 楼顶气泡）有没有盖住这一点 */
    private nodeHit(node: Node, x: number, y: number): boolean {
        const ui = node.getComponent(UITransform)!;
        const w = ui.contentSize.width, h = ui.contentSize.height;
        if (w <= 0 || h <= 0) return false;            // 色块楼没有尺寸，交给按格子判定
        const dx = x - node.position.x, dy = y - node.position.y;
        // 先用外框粗筛（气泡在楼顶上方，外框往上多留 28）
        if (dx < -w / 2 || dx > w / 2 || dy < 0 || dy > h + 28) return false;
        if (node.getChildByName('Alert') && Math.abs(dx) <= 16 && Math.abs(dy - h - 12) <= 16) return true;
        const sp = node.getComponent(Sprite);
        if (sp && sp.enabled && sp.spriteFrame && this.spriteHit(sp, w, h, dx, dy)) return true;
        for (const name of ['Site', 'Crane']) {
            const c = node.getChildByName(name);
            const cs = c && c.active ? c.getComponent(Sprite) : null;
            if (!cs || !cs.spriteFrame) continue;
            const cui = c!.getComponent(UITransform)!;
            if (this.spriteHit(cs, cui.contentSize.width, cui.contentSize.height, dx - c!.position.x, dy - c!.position.y)) return true;
        }
        return false;
    }

    /** 底边中点为原点的一张图：有蒙版按蒙版；没有（散图）退回「矩形去掉底下两个角」 */
    private spriteHit(sp: Sprite, w: number, h: number, dx: number, dy: number): boolean {
        if (dx < -w / 2 || dx >= w / 2 || dy < 0 || dy >= h) return false;
        const hit = this._art ? this._art.opaqueAt(sp.spriteFrame!, dx + w / 2, dy) : null;
        if (hit !== null) return hit;
        const iso = this._iso;
        const slope = iso ? iso.hh / iso.hw : 0.5;
        return dy >= Math.abs(dx) * slope - 2;
    }

    /**
     * 楼顶中点（Objects 本地坐标；T425 追踪箭头指这里）。施工中按看得见的工地高度。
     * 色块楼按占地估一个高度；没有这栋楼返回 null。
     */
    topOf(uid: number): { x: number; y: number } | null {
        const node = this._nodes.get(uid);
        if (!node || !node.isValid) return null;
        let h = node.getComponent(UITransform)!.contentSize.height;
        const sp = node.getComponent(Sprite);
        const site = node.getChildByName('Site');
        if (site && (!sp || !sp.enabled)) h = site.getComponent(UITransform)!.contentSize.height;
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

    /** 会动的东西（行人、车）挂进同一个父节点，才能和建筑互相遮挡 */
    addActor(node: Node, depth: number): void {
        this._objRoot!.addChild(node);
        this._depth.set(node, depth);
    }

    setActorDepth(node: Node, depth: number): void {
        this._depth.set(node, depth);
    }

    removeActor(node: Node): void {
        this._depth.delete(node);
        node.removeFromParent();
        node.destroy();
    }

    /** 按排序键重排所有子节点；只动顺序变了的，每帧调也不贵 */
    sortAll(): void {
        const root = this._objRoot;
        if (!root) return;
        const kids = root.children.slice();
        kids.sort((a, b) => (this._depth.get(a) ?? 0) - (this._depth.get(b) ?? 0));
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].getSiblingIndex() !== i) kids[i].setSiblingIndex(i);
        }
    }

    private sortByDepth(_list: PlacedBuilding[]): void {
        this.sortAll();
    }

    /**
     * 能用的贴图：要有图，且宽度符合 (w+h)·半宽·倍率。
     * 按朝向 + 视角取后缀（D031：'' / _r / _b / _br），缺了就用默认图。
     */
    private usableFrame(def: BuildingDef, facing: Facing | null) {
        const art = this._art;
        const iso = this._iso!;
        const suffix = iso.frameSuffix(facing);
        const frame = art ? ((suffix ? art.get(`${def.id}${suffix}`) : null) ?? art.get(def.id)) : null;
        if (!frame) return null;
        const want = (def.width + def.height) * iso.hw * art!.scale;
        const fw = frame.rect.width;
        if (fw !== want) {
            if (!this._warned.has(def.id)) {
                this._warned.add(def.id);
                console.warn(`[BuildingLayer] ${def.id}.png 宽 ${fw}，等距 ${def.width}×${def.height} 应为 ${want}，先用色块`);
            }
            return null;
        }
        return frame;
    }

    private syncNode(b: PlacedBuilding): void {
        const iso = this._iso!;
        // 朝向由 TownModel 定好并锁住，这里只读（null = 还没挨过路，先用默认图）
        const frame = this.usableFrame(b.def, b.facing);
        let node = this._nodes.get(b.uid);
        if (node && this._shown.get(b.uid) === frame) return;
        if (node) {
            node.removeFromParent();
            node.destroy();
        }

        if (node) this._depth.delete(node);
        node = BuildingLayer.makeChild(this._objRoot!, `B${b.uid}_${b.def.id}`);
        this._depth.set(node, iso.depth(b.col, b.row, b.def.width, b.def.height));
        const p = iso.footBottom(b.col, b.row, b.def.width, b.def.height);
        node.setPosition(p.x, p.y, 0);

        if (frame) {
            const ui = node.getComponent(UITransform)!;
            ui.setAnchorPoint(new Vec2(0.5, 0));
            const sz = this._art!.worldSize(frame);
            ui.setContentSize(sz.width, sz.height);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.trim = false;
            sprite.spriteFrame = frame;
        } else {
            this.drawBlock(node.addComponent(Graphics), b.def);
        }
        this._nodes.set(b.uid, node);
        this._shown.set(b.uid, frame);
    }

    /** 没贴图：等距色块。原点是占地最下顶点，墙高按占地大小给一个合理值 */
    private drawBlock(g: Graphics, def: BuildingDef): void {
        const iso = this._iso!;
        const w = def.width, h = def.height;
        const hw = iso.hw, hh = iso.hh;
        const H = 10 + 6 * Math.max(w, h);
        const B = { x: 0, y: 0 };
        const R = { x: h * hw, y: h * hh };
        const L = { x: -w * hw, y: w * hh };
        const T = { x: (h - w) * hw, y: (w + h) * hh };
        const quad = (pts: { x: number; y: number }[], c: Color) => {
            g.fillColor = c;
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.close();
            g.fill();
        };
        const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + H });

        hexToColor(def.color, this._cMain);
        quad([L, B, up(B), up(L)], shade(this._cMain, 0.85, this._cTmp));
        quad([B, R, up(R), up(B)], shade(this._cMain, 0.65, this._cTmp));
        quad([up(T), up(R), up(B), up(L)], this._cMain);
    }

    /** 放置预览：占地菱形，绿白可放 / 红色不可放 */
    showGhost(def: BuildingDef | null, col: number, row: number): void {
        if (this._ghostSprite) this._ghostSprite.node.active = false;
        if (!def) { if (this._ghost) this._ghost.clear(); return; }
        const model = this._model;
        if (!model) return;
        this.showGhostShape(def, col, row, model.canPlace(def, col, row));
    }

    private showGhostShape(def: BuildingDef, col: number, row: number, ok: boolean): void {
        const g = this._ghost;
        const iso = this._iso;
        if (!g || !iso) return;

        g.clear();
        const pts = iso.footprint(col, row, def.width, def.height);
        const path = () => {
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.close();
        };
        g.fillColor = ok ? this._cGhostOk : this._cGhostBad;
        path();
        g.fill();
        g.lineWidth = 1.5;
        g.strokeColor = ok ? this._cGhostEdgeOk : this._cGhostEdgeBad;
        path();
        g.stroke();
    }

    clearGhost(): void {
        if (this._ghost) this._ghost.clear();
        if (this._ghostSprite) this._ghostSprite.node.active = false;
    }

    /**
     * 放置预览（D022）：占地菱形 + 半透明的真实贴图（按给定朝向）。
     * ok=false 时贴图染红。没有贴图的建筑只画菱形。
     */
    showPreview(def: BuildingDef, col: number, row: number, facing: Facing | null, ok: boolean): void {
        this.showGhostShape(def, col, row, ok);
        const gs = this._ghostSprite, iso = this._iso;
        if (!gs || !iso) return;
        const frame = def.flat ? null : this.usableFrame(def, facing);
        if (!frame) { gs.node.active = false; return; }
        const sz = this._art!.worldSize(frame);
        gs.node.getComponent(UITransform)!.setContentSize(sz.width, sz.height);
        gs.spriteFrame = frame;
        gs.color = ok ? Color.WHITE : this._cGhostTint;
        const p = iso.footBottom(col, row, def.width, def.height);
        gs.node.setPosition(p.x, p.y, 0);
        gs.node.active = true;
    }

    private static makeChild(parent: Node, name: string): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        return node;
    }
}
