import { _decorator, Component, Layers, Node, Sprite, SpriteFrame, UITransform, Vec2, Vec3, tween } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { TownModel } from '../core/TownModel';
import { BuildingLayer } from './BuildingLayer';

const { ccclass } = _decorator;

/**
 * 让城镇动起来（T210 / T219，D017）：行人、电动车、汽车沿道路走，店铺冒金币。
 *
 * - 行人 / 电动车走所有道路；汽车只走城市道路（PRD：土路不走汽车）。
 * - 走法：从一格中心走到相邻一格中心，到了再随机挑下一格（偏好直走，不掉头，死路才掉头）。
 *   横向偏移一个"车道"值：行人走人行道，车靠一侧，对向车自然分两边。
 * - 节点挂进 BuildingLayer 的 Objects，和建筑共用前后排序（gx+gy），被楼挡住时会真的被挡住。
 * - 图只画了两个朝向，另外两个左右翻转（docs/art/gen/life.py 顶部有约定）。
 * - 数量按道路格数自动调整，道路增删后多余的会消失、缺的会补上。
 * - 纯表现层：不读不写任何经营数值。金币只是视觉提示，真正的收入结算是 M2 的事。
 */
type Kind = 'ped' | 'scoot' | 'car';

interface Agent {
    kind: Kind;
    node: Node;
    sprite: Sprite;
    skin: number;
    col: number; row: number;   // 出发格
    tc: number; tr: number;     // 目标格
    t: number;                  // 0..1
    speed: number;              // 格 / 秒
    side: number;               // 行人走哪侧人行道：±1
    anim: number;
    /** 这个小人是哪位居民（T311）；汽车和没有居民数据时为 null */
    residentId: number | null;
}

/** 行人抽样需要的居民信息（只读，来自模拟层） */
export interface WalkerInfo {
    id: number;
    gender: 'M' | 'F';
    age: number;
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PED_SKINS = 6;
const SCOOT_SKINS = 3;
const CAR_SKINS = 3;

@ccclass('LifeLayer')
export class LifeLayer extends Component {
    private _iso: IsoMath | null = null;
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;
    private _layer: BuildingLayer | null = null;

    private readonly _agents: Agent[] = [];
    private _roads: [number, number][] = [];
    private _cityRoads: [number, number][] = [];
    private _dirty = true;
    private _balanceTimer = 0;
    private _coinTimer = 0;
    private readonly _p = { x: 0, y: 0 };
    /** 居民名单来源（T311）。不设就退回随机小人（老行为） */
    private _residents: (() => readonly WalkerInfo[]) | null = null;
    private _residentCache: WalkerInfo[] = [];

    /** 接上模拟层：街上的行人、电动车骑手从真实居民里抽 */
    setResidentSource(fn: () => readonly WalkerInfo[]): void {
        this._residents = fn;
        this._dirty = true;
    }

    /**
     * 地图本地坐标点中了哪位居民（点行人看是谁）。
     * 小人只有 8×13，判定框四周各放宽 4 像素；重叠时取画在最前面的那个。
     */
    pickResidentAt(x: number, y: number): number | null {
        let best: Agent | null = null, bestY = Infinity;
        for (const a of this._agents) {
            if (a.residentId === null) continue;
            const ui = a.node.getComponent(UITransform)!;
            const p = a.node.position, w = ui.contentSize.width, h = ui.contentSize.height;
            if (x < p.x - w / 2 - 4 || x > p.x + w / 2 + 4 || y < p.y - 4 || y > p.y + h + 4) continue;
            if (p.y < bestY) { best = a; bestY = p.y; }     // 越靠下越在前面
        }
        return best ? best.residentId : null;
    }

    static create(iso: IsoMath, model: TownModel, art: ArtLibrary, layer: BuildingLayer): Node {
        const node = new Node('LifeLayer');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const c = node.addComponent(LifeLayer);
        c._iso = iso; c._model = model; c._art = art; c._layer = layer;
        return node;
    }

    get agentCount(): number {
        return this._agents.length;
    }

    /** 建筑或道路变了 */
    onTownChanged(): void {
        this._dirty = true;
        this._balanceTimer = 0;
    }

    protected update(dt: number): void {
        const art = this._art;
        if (!art || !art.loaded || !this._layer) return;
        dt = Math.min(dt, 0.1);

        this._balanceTimer -= dt;
        if (this._dirty || this._balanceTimer <= 0) {
            this.balance();
            this._balanceTimer = 1;
        }
        for (let i = 0; i < this._agents.length; i++) this.step(this._agents[i], dt);
        this._layer.sortAll();

        this._coinTimer -= dt;
        if (this._coinTimer <= 0) {
            this._coinTimer = 0.5 + Math.random() * 0.6;
            this.spawnCoin();
        }
    }

    // ---------------- 道路查询 ----------------
    private roadKind(col: number, row: number): string | null {
        const b = this._model!.getAt(col, row);
        return b && b.def.flat ? (b.def.road ?? 'city') : null;
    }

    private canWalk(a: Agent, col: number, row: number): boolean {
        const k = this.roadKind(col, row);
        return a.kind === 'car' ? k === 'city' : k !== null;
    }

    private rescanRoads(): void {
        const m = this._model!;
        this._roads = []; this._cityRoads = [];
        for (let r = 0; r < m.height; r++) {
            for (let c = 0; c < m.width; c++) {
                const k = this.roadKind(c, r);
                if (!k) continue;
                this._roads.push([c, r]);
                if (k === 'city') this._cityRoads.push([c, r]);
            }
        }
    }

    // ---------------- 数量 ----------------
    private balance(): void {
        if (this._dirty) {
            this.rescanRoads();
            this._dirty = false;
            // 脚下或目标已经不是能走的路了：直接收掉
            for (let i = this._agents.length - 1; i >= 0; i--) {
                const a = this._agents[i];
                if (!this.canWalk(a, a.col, a.row) || !this.canWalk(a, a.tc, a.tr)) this.despawn(i);
            }
        }
        // 居民在不在：搬走了、去世了的人，街上对应的小人也要消失
        if (this._residents) {
            this._residentCache = this._residents().slice();
            const alive = new Set(this._residentCache.map((r) => r.id));
            for (let i = this._agents.length - 1; i >= 0; i--) {
                const id = this._agents[i].residentId;
                if (id !== null && !alive.has(id)) this.despawn(i);
            }
        }
        const pop = this._residents ? this._residentCache.length : Infinity;
        const adults = this._residents ? this._residentCache.filter((r) => r.age >= 18 && r.age < 60).length : Infinity;
        // 不会比真实人口多：5 个人的村子街上最多 5 个人
        const scoot = Math.min(14, Math.floor(this._roads.length / 8), Math.floor(adults / 3));
        const want: Record<Kind, number> = {
            ped: Math.min(40, Math.floor(this._roads.length / 3), pop - scoot),
            scoot,
            car: Math.min(12, Math.floor(this._cityRoads.length / 7)),
        };
        (['ped', 'scoot', 'car'] as Kind[]).forEach((k) => {
            let have = 0;
            for (const a of this._agents) if (a.kind === k) have++;
            for (; have < want[k]; have++) if (!this.spawn(k)) break;
            for (let i = this._agents.length - 1; i >= 0 && have > want[k]; i--) {
                if (this._agents[i].kind === k) { this.despawn(i); have--; }
            }
        });
    }

    private spawn(kind: Kind): boolean {
        const pool = kind === 'car' ? this._cityRoads : this._roads;
        if (pool.length === 0) return false;
        const [col, row] = pool[Math.floor(Math.random() * pool.length)];
        const skins = kind === 'ped' ? PED_SKINS : (kind === 'scoot' ? SCOOT_SKINS : CAR_SKINS);
        const node = new Node(`A_${kind}`);
        node.layer = Layers.Enum.UI_2D;
        const ui = node.addComponent(UITransform);
        ui.setAnchorPoint(new Vec2(0.5, 0));
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        let residentId: number | null = null;
        let skin = Math.floor(Math.random() * skins);
        if (this._residents && kind !== 'car') {
            const who = this.pickWalker(kind);
            if (!who) { node.destroy(); return false; }
            residentId = who.id;
            skin = LifeLayer.skinOf(who, kind);
        }
        const a: Agent = {
            kind, node, sprite, skin, residentId,
            col, row, tc: col, tr: row, t: 1,
            speed: kind === 'ped' ? 0.55 + Math.random() * 0.25 : (kind === 'scoot' ? 1.4 + Math.random() * 0.4 : 1.9 + Math.random() * 0.5),
            side: Math.random() < 0.5 ? 1 : -1,
            anim: Math.random(),
        };
        this.pickNext(a);
        this._layer!.addActor(node, 0);
        this._agents.push(a);
        this.place(a);
        return true;
    }

    /** 挑一位还没上街的居民。电动车只给成年人骑 */
    private pickWalker(kind: Kind): WalkerInfo | null {
        const shown = new Set<number>();
        for (const a of this._agents) if (a.residentId !== null) shown.add(a.residentId);
        const pool = this._residentCache.filter((r) => !shown.has(r.id) && (kind !== 'scoot' || (r.age >= 18 && r.age < 60)));
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    /** 外观跟着人走：老人银发、女性多穿浅色；同一个人每次出门都是同一身衣服 */
    private static skinOf(r: WalkerInfo, kind: Kind): number {
        if (kind === 'scoot') return r.id % SCOOT_SKINS;
        if (r.age >= 60) return 3;
        const female = [4, 0, 5], male = [1, 2, 5, 0];
        const set = r.gender === 'F' ? female : male;
        return set[r.id % set.length];
    }

    private despawn(i: number): void {
        this._layer!.removeActor(this._agents[i].node);
        this._agents.splice(i, 1);
    }

    // ---------------- 走路 ----------------
    /** 到了一格中心：挑下一格。直走 60%，否则在能走的里随机；死路掉头 */
    private pickNext(a: Agent): void {
        const dx = a.tc - a.col, dy = a.tr - a.row;
        a.col = a.tc; a.row = a.tr;
        const options: [number, number][] = [];
        let straight: [number, number] | null = null;
        for (const [ox, oy] of DIRS) {
            if (ox === -dx && oy === -dy && (dx || dy)) continue;   // 不掉头
            if (!this.canWalk(a, a.col + ox, a.row + oy)) continue;
            options.push([ox, oy]);
            if (ox === dx && oy === dy) straight = [ox, oy];
        }
        let d: [number, number] | null;
        if (straight && Math.random() < 0.6) d = straight;
        else if (options.length) d = options[Math.floor(Math.random() * options.length)];
        else d = (dx || dy) && this.canWalk(a, a.col - dx, a.row - dy) ? [-dx, -dy] : null;
        if (d) { a.tc = a.col + d[0]; a.tr = a.row + d[1]; }
        a.t = 0;
    }

    private step(a: Agent, dt: number): void {
        if (a.tc === a.col && a.tr === a.row) {
            // 孤零零一格路：原地站着，偶尔再试试
            if (Math.random() < dt) this.pickNext(a);
        } else {
            a.t += a.speed * dt;
            while (a.t >= 1) {
                const rest = a.t - 1;
                this.pickNext(a);
                a.t = rest;
                if (a.tc === a.col && a.tr === a.row) { a.t = 0; break; }
            }
        }
        a.anim += dt;
        this.place(a);
    }

    /** 车道偏移：行人走人行道，车靠一侧（垂直于行进方向，对向自动分两边） */
    private lane(a: Agent): number {
        if (a.kind === 'ped') return (this.roadKind(a.col, a.row) === 'city' ? 0.36 : 0.27) * a.side;
        return a.kind === 'scoot' ? 0.2 : 0.14;
    }

    private place(a: Agent): void {
        const iso = this._iso!, art = this._art!;
        const dx = a.tc - a.col, dy = a.tr - a.row;
        const off = this.lane(a);
        // 垂直方向 (-dy, dx)
        const gx = a.col + 0.5 + dx * a.t + (-dy) * off;
        const gy = a.row + 0.5 + dy * a.t + dx * off;
        iso.toLocal(gx, gy, this._p);
        a.node.setPosition(Math.round(this._p.x), Math.round(this._p.y), 0);
        this._layer!.setActorDepth(a.node, gx + gy);

        // 朝向：+gx 正面，+gy 正面翻转，-gx 背面，-gy 背面翻转（车：沿 gy 翻转）
        const flip = dy !== 0;
        const front = dx > 0 || dy > 0 || (dx === 0 && dy === 0);
        let name: string;
        if (a.kind === 'ped') {
            const f = Math.floor(a.anim * 4) % 2;
            name = `ped${a.skin}-${front ? 'front' : 'back'}${dx === 0 && dy === 0 ? 0 : f}`;
        } else if (a.kind === 'scoot') {
            name = `scoot${a.skin}-${front ? 'front' : 'back'}`;
        } else {
            name = `car${a.skin}`;
        }
        const frame = art.get(name);
        if (frame && a.sprite.spriteFrame !== frame) {
            a.sprite.spriteFrame = frame;
            const sz = art.worldSize(frame);
            a.node.getComponent(UITransform)!.setContentSize(sz.width, sz.height);
        }
        const sx = flip ? -1 : 1;
        if (a.node.scale.x !== sx) a.node.setScale(sx, 1, 1);
    }

    // ---------------- 金币 ----------------
    private spawnCoin(): void {
        const frame = this._art!.get('coin');
        if (!frame) return;
        const shops = this._model!.allBuildings().filter((b) => b.def.category === '店铺' && this.touchesRoad(b.col, b.row, b.def.width, b.def.height));
        if (shops.length === 0) return;
        const b = shops[Math.floor(Math.random() * shops.length)];
        const bn = this._layer!.nodeOf(b.uid);
        if (!bn) return;
        const h = bn.getComponent(UITransform)!.contentSize.height;
        const node = new Node('Coin');
        node.layer = Layers.Enum.UI_2D;
        const sz = this._art!.worldSize(frame);
        node.addComponent(UITransform).setContentSize(sz.width, sz.height);
        const s = node.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM;
        s.spriteFrame = frame as SpriteFrame;
        this.node.addChild(node);
        const p = bn.position;
        const y0 = Math.round(p.y + h * 0.85);
        node.setPosition(p.x, y0, 0);
        node.setScale(0.4, 0.4, 1);
        tween(node)
            .to(0.15, { scale: new Vec3(1.2, 1.2, 1) })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .to(0.9, { position: new Vec3(p.x, y0 + 16, 0) })
            .call(() => node.destroy())
            .start();
    }

    private touchesRoad(col: number, row: number, w: number, h: number): boolean {
        for (let c = col - 1; c <= col + w; c++) {
            for (let r = row - 1; r <= row + h; r++) {
                const inside = c >= col && c < col + w && r >= row && r < row + h;
                const diag = (c === col - 1 || c === col + w) && (r === row - 1 || r === row + h);
                if (!inside && !diag && this.roadKind(c, r)) return true;
            }
        }
        return false;
    }
}
