import { _decorator, Color, Component, Graphics, JsonAsset, Label, Layers, Node, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, Vec2, Vec3, resources, tween } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { DayClock } from '../core/DayClock';
import { IsoMath } from '../core/IsoMath';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { BuildingLayer } from './BuildingLayer';
import type { Actor3D } from './World3D';
import { skinOf as lookOf } from '../core/Appearance';

const { ccclass } = _decorator;

/**
 * 让城镇动起来：街上的人和车（T210 / T219 / T404，D017 / D022 / D024）。
 *
 * D024 起街上的人不再随机乱逛，而是按「一天的作息」从一栋楼走到另一栋楼：
 *   - 一个游戏月 = 画面上的一天（DayClock：早上 6 点 → 晚上 10 点）。每天给每位居民排一张日程；
 *   - 上班族：早上从家去单位，进门就从街上消失，傍晚下班回家（有时先去店里逛逛）；
 *   - 学生：有学校就上学放学，没学校下午出去玩一会儿；
 *   - 老人：早上去早餐铺 / 广场 / 卫生院转转，下午再遛一圈；
 *   - 赋闲（有钱不上班）：上午出门逛店，逛两三家再回家；
 *   - 待业：上午去有岗位的地方问问，傍晚可能去店里；
 *   - 6 岁以下、没房子的人不上街。
 * 所以街上的人永远是「此刻真的在路上」的人。路线沿道路走最短路（BFS），到了门口淡出。
 * 到店里会冒一个金币（真正的营业额仍由模拟层按月结算，这里只是视觉提示）。
 *
 * - 速度 = 交通工具基础速度 × 道路倍率 × 个人差异（config/traffic.json）；路太长时会「赶路」走快一点
 *   （最多 trip.maxHurry 倍），不然步行 10 格要 17 秒，约占半个白天。
 * - 跟着游戏倍速走：暂停时人也停下，两倍速时人走得也快。
 * - 节点挂进 BuildingLayer 的 Objects，和建筑共用前后排序（gx+gy），被楼挡住时会真的被挡住。
 * - 图只画了两个朝向，另外两个左右翻转（docs/art/gen/life.py 顶部有约定）。
 * - 纯表现层：不读不写任何经营数值。
 */
type Kind = 'ped' | 'scoot' | 'moto' | 'car';
type VehicleKey = 'walk' | 'ebike' | 'moto' | 'car';
const KIND_OF: Record<VehicleKey, Kind> = { walk: 'ped', ebike: 'scoot', moto: 'moto', car: 'car' };
const VEHICLE_OF: Record<Kind, VehicleKey> = { ped: 'walk', scoot: 'ebike', moto: 'moto', car: 'car' };

/** config/traffic.json（D022 / D024，DESIGN 11.3、15）。加载不到就用这份 */
interface TrafficConfig {
    vehicles: Record<VehicleKey, { speed: number }>;
    roads: Record<string, Partial<Record<VehicleKey, number>>>;
    personalSpread: number;
    driveShare: number;
    /** 一天从几点演到几点 */
    day: { startHour: number; endHour: number };
    /** 赶路：一趟路希望多少秒（1 倍速）走完；最多快几倍 */
    trip: { targetSeconds: number; maxHurry: number; minDriveCells: number };
    /** 街上同时最多几个人（多了的直接「到了」，不画） */
    maxOnStreet: number;
}
const DEFAULT_TRAFFIC: TrafficConfig = {
    vehicles: { walk: { speed: 0.6 }, ebike: { speed: 1.3 }, moto: { speed: 1.7 }, car: { speed: 2.2 } },
    roads: {
        dirt: { walk: 1, ebike: 0.8, moto: 0.75, car: 0.45 },
        city: { walk: 1, ebike: 1, moto: 1, car: 1 },
    },
    personalSpread: 0.1,
    driveShare: 0.7,
    day: { startHour: 6, endHour: 22 },
    trip: { targetSeconds: 8, maxHurry: 2.5, minDriveCells: 4 },
    maxOnStreet: 60,
};
/**
 * 影子帧和它的着地点高度。settle 用**世界像素**（图底边往上），和贴图分辨率无关：
 * = actors.py 的 SETTLE ÷ 该帧倍率（8 倍图：行人 12 / 电动车 16 / 摩托 20 / 汽车 34）
 */
const SHADOW: Record<Kind, { frame: string; settle: number }> = {
    ped: { frame: 'shadow-s', settle: 1.5 },
    scoot: { frame: 'shadow-m', settle: 2 },
    moto: { frame: 'shadow-m', settle: 2.5 },
    car: { frame: 'shadow-l', settle: 4.25 },
};

interface Agent {
    kind: Kind;
    node: Node;
    sprite: Sprite;
    skin: number;
    /** 行人的外观名（D023，如 'woman1'）；有新图时按它取帧，没有就退回 ped<skin> */
    look: string | null;
    /** 路线：道路格下标（row * width + col），从出发门口到目的地门口 */
    path: number[];
    /** 正在走 path[i] → path[i+1] */
    i: number;
    col: number; row: number;   // 出发格
    tc: number; tr: number;     // 目标格
    t: number;                  // 0..1
    speed: number;              // 基础速度 × 个人差异 × 赶路倍率，格 / 秒（道路倍率每步再乘）
    side: number;               // 行人走哪侧人行道：±1
    anim: number;
    residentId: number;
    /** 要去的楼 */
    to: number;
    /** 3D 版（T540f）每帧交给 World3D 的画法；place() 里更新 */
    view: Actor3D;
}

/** 街上的人需要的居民信息（只读，来自模拟层；Resident 结构上就满足） */
export interface WalkerInfo {
    id: number;
    gender: 'M' | 'F';
    age: number;
    /** 交通工具（D022）；没有就当步行 */
    vehicle?: VehicleKey;
    homeId?: number | null;
    jobId?: number | null;
    /** 赋闲（D024） */
    idle?: boolean;
}

/** 日程里的一趟：几点出门、去哪栋楼 */
interface Trip { at: number; to: number }

/** 一位居民今天的状态 */
interface Person {
    id: number;
    /** 现在在哪栋楼里（null = 在路上或不知道） */
    loc: number | null;
    trips: Trip[];
    next: number;
    agent: Agent | null;
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const PED_SKINS = 6;
const SCOOT_SKINS = 3;
const MOTO_SKINS = 3;
const CAR_SKINS = 3;
/** 老人爱去的地方，排前面的优先 */
const ELDER_SPOTS = ['plaza', 'breakfast', 'clinic', 'teahouse', 'market', 'old-street'];
const FOOD = ['breakfast', 'bbq', 'hotpot', 'supermarket', 'milk-tea', 'noodle', 'restaurant', 'banquet', 'market', 'store'];
const SCHOOL_AGE = 6, WORK_AGE = 18, RETIRE_AGE = 60;

/** 同一个人同一天同一个用途，随机数固定（存档读回来日程不变） */
function rnd(id: number, day: number, k: number): number {
    let h = (Math.imul(id + 1, 2654435761) ^ Math.imul(day + 7, 40503) ^ Math.imul(k + 13, 2246822519)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

@ccclass('LifeLayer')
export class LifeLayer extends Component {
    /** 行人每走多少格换一帧腿（0.6 格/秒 ≈ 每秒换 4 次） */
    private static readonly STRIDE = 0.15;
    /** 淡入淡出秒数 */
    private static readonly FADE = 0.25;

    private _iso: IsoMath | null = null;
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;
    private _layer: BuildingLayer | null = null;

    private readonly _agents: Agent[] = [];
    private readonly _people = new Map<number, Person>();
    private _residents: (() => readonly WalkerInfo[]) | null = null;
    private _traffic: TrafficConfig = DEFAULT_TRAFFIC;

    /** 第几天（每次月进度从头开始就 +1），配合 id 定日程 */
    private _day = 0;
    private _lastProgress = -1;
    private _planTimer = 0;
    private _townDirty = true;

    /** 地点分类（盖 / 拆后重算） */
    private _byId = new Map<string, PlacedBuilding[]>();
    private _shops: PlacedBuilding[] = [];
    private _workplaces: PlacedBuilding[] = [];
    /** 路线缓存：`from>to` → 道路格序列；null = 不通 */
    private readonly _routes = new Map<string, number[] | null>();
    private readonly _p = { x: 0, y: 0 };

    /** 对话气泡冷却（residentId → 剩余秒） */
    private readonly _chatCooldown = new Map<number, number>();
    private _chatTimer = 0;

    protected start(): void {
        resources.load('config/traffic', JsonAsset, (err, json) => {
            if (err || !json || !json.json) { console.warn('[LifeLayer] traffic.json 加载失败，用默认值', err); return; }
            const t = json.json as Partial<TrafficConfig>;
            const d = DEFAULT_TRAFFIC;
            const num = (v: unknown, dv: number) => (typeof v === 'number' && isFinite(v) ? v : dv);
            this._traffic = {
                vehicles: { ...d.vehicles, ...(t.vehicles ?? {}) },
                roads: { ...d.roads, ...(t.roads ?? {}) },
                personalSpread: num(t.personalSpread, d.personalSpread),
                driveShare: num(t.driveShare, d.driveShare),
                day: { startHour: num(t.day?.startHour, d.day.startHour), endHour: num(t.day?.endHour, d.day.endHour) },
                trip: {
                    targetSeconds: Math.max(0.5, num(t.trip?.targetSeconds, d.trip.targetSeconds)),
                    maxHurry: Math.max(1, num(t.trip?.maxHurry, d.trip.maxHurry)),
                    minDriveCells: num(t.trip?.minDriveCells, d.trip.minDriveCells),
                },
                maxOnStreet: Math.max(0, num(t.maxOnStreet, d.maxOnStreet)),
            };
            DayClock.startHour = this._traffic.day.startHour;
            DayClock.endHour = this._traffic.day.endHour;
        });
    }

    /** 施工中的楼（不当去处）。WorldView 接上 */
    busy: (() => ReadonlySet<number>) | null = null;

    /** 某种建筑的客单价（T219 飘字）；返回 0 = 不飘 */
    priceOf: ((defId: string) => number) | null = null;

    /**
     * 人车由 World3D 画成 3D 里的纸片（T540f，能被楼挡住），这里的 2D 精灵只算位置、选帧，不显示。
     * 气泡、金币、飘字还是 2D，压在最上面。
     */
    private readonly _views: Actor3D[] = [];

    /** 3D 版每帧要画的人车（World3D.actorSource） */
    actors3D(): readonly Actor3D[] {
        const out = this._views;
        out.length = 0;
        for (const a of this._agents) {
            const op = a.node.getComponent(UIOpacity);
            a.view.alpha = op ? op.opacity / 255 : 1;
            out.push(a.view);
        }
        return out;
    }

    /** 正在被追踪的居民（T425）：出门不受「街上最多几人」限制，保证一直画得出来 */
    tracked: number | null = null;

    /**
     * 这位居民此刻在哪（T425 追踪）：
     *   - 在路上：walking = true，(x, y) = 头顶（Objects 本地坐标，和楼节点同一套），to = 要去的楼
     *   - 在楼里：walking = false，uid = 哪栋楼（坐标由调用方取楼顶）
     * 不认识这个人（还没排日程 / 已经搬走）返回 null。
     */
    whereIs(id: number): { walking: boolean; x: number; y: number; uid: number | null; to: number | null } | null {
        const p = this._people.get(id);
        if (!p) return null;
        const a = p.agent;
        if (a && a.node.isValid) {
            const body = a.node.getChildByName('Body');
            const h = body ? body.getComponent(UITransform)!.height : 12;
            return { walking: true, x: a.node.position.x, y: a.node.position.y + h, uid: null, to: a.to };
        }
        const uid = p.loc ?? this._info.get(id)?.homeId ?? null;
        return { walking: false, x: 0, y: 0, uid, to: null };
    }

    /** 接上模拟层：街上的人就是这些居民 */
    setResidentSource(fn: () => readonly WalkerInfo[]): void {
        this._residents = fn;
        this._planTimer = 0;
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
        this._townDirty = true;
    }

    /** 视角转了（D031）：所有人车按新视角重摆一次（暂停时也要对） */
    relayout(): void {
        for (const a of this._agents) this.place(a);
    }

    protected update(dt: number): void {
        const art = this._art;
        if (!art || !art.loaded || !this._layer || !this._model) return;
        dt = Math.min(dt, 0.1);

        if (this._townDirty) this.rescanTown();

        // 新的一天：月进度从头开始
        const progress = DayClock.progress();
        if (progress < this._lastProgress - 0.5 || this._lastProgress < 0) this.newDay(this._lastProgress >= 0);
        this._lastProgress = progress;

        this._planTimer -= dt;
        if (this._planTimer <= 0) {
            this._planTimer = 0.25;
            this.syncPeople();
        }

        // 到点的人出门
        const hour = DayClock.hour();
        this._people.forEach((p) => {
            while (!p.agent && p.next < p.trips.length && hour >= p.trips[p.next].at) this.depart(p);
        });

        const g = dt * DayClock.speed();
        if (g > 0) {
            for (let i = this._agents.length - 1; i >= 0; i--) this.step(this._agents[i], g, i);
            this._layer.sortAll();
        }

        // 对话气泡：每 0.4 秒检测一次两个行人是否靠近
        this._chatTimer -= dt;
        if (this._chatTimer <= 0) {
            this._chatTimer = 0.4;
            // 冷却倒计时
            this._chatCooldown.forEach((v, k) => {
                const nv = v - 0.4;
                if (nv <= 0) this._chatCooldown.delete(k);
                else this._chatCooldown.set(k, nv);
            });
            this.trySpawnChatBubble();
        }
    }

    // ---------------- 地点 ----------------
    private rescanTown(): void {
        this._townDirty = false;
        this._routes.clear();
        this._byId.clear();
        this._uids.clear();
        this._shops = [];
        this._workplaces = [];
        for (const b of this._model!.allBuildings()) {
            if (b.def.flat) continue;
            this._uids.set(b.uid, b);
            const list = this._byId.get(b.def.id);
            if (list) list.push(b); else this._byId.set(b.def.id, [b]);
            const cat = b.def.category;
            if (cat === '店铺') this._shops.push(b);
            if (cat === '店铺' || cat === '工业' || cat === '公共' || cat === '金融') this._workplaces.push(b);
        }
        // 路被拆了：脚下 / 前面的路不在了的人直接「到了」
        for (let i = this._agents.length - 1; i >= 0; i--) {
            const a = this._agents[i];
            const w = this._model!.width;
            if (a.path.slice(a.i).some((c) => !this.roadKind(c % w, Math.floor(c / w)))) this.arrive(i, false);
        }
        // 楼被拆了：人在那栋楼里就当回家了
        this._people.forEach((p) => {
            if (p.loc !== null && !this.buildingByUid(p.loc)) p.loc = null;
        });
    }

    private buildingByUid(uid: number): PlacedBuilding | null {
        return this._uids.get(uid) ?? null;
    }
    private readonly _uids = new Map<number, PlacedBuilding>();

    // ---------------- 日程 ----------------
    /** 新的一天：人都回到家，重新排日程；还在路上的直接到 */
    private newDay(advance: boolean): void {
        if (advance) this._day++;
        for (let i = this._agents.length - 1; i >= 0; i--) this.arrive(i, false);
        this._people.forEach((p) => { p.trips = []; p.next = 0; p.loc = null; });
        this._planTimer = 0;
        this._planned = false;
    }
    private _planned = false;

    /** 居民名单 → 每人一份日程；搬走 / 去世的人从街上消失 */
    private syncPeople(): void {
        if (!this._residents) return;
        const list = this._residents();
        const alive = new Set<number>();
        for (const r of list) {
            alive.add(r.id);
            let p = this._people.get(r.id);
            if (!p) {
                // 新来的人：今天剩下的时间按日程走（已经过了点的趟次跳过）
                p = { id: r.id, loc: null, trips: this.plan(r), next: 0, agent: null };
                const hour = DayClock.hour();
                while (p.next < p.trips.length - 1 && p.trips[p.next + 1].at <= hour) p.next++;
                if (this._planned && p.next > 0) p.loc = p.trips[p.next - 1].to;
                this._people.set(r.id, p);
            } else if (!this._planned) {
                p.trips = this.plan(r);
            }
            if (p.loc === null && !p.agent && p.next === 0) p.loc = r.homeId ?? null;
        }
        this._planned = true;
        this._people.forEach((p, id) => {
            if (alive.has(id)) return;
            if (p.agent) {
                const i = this._agents.indexOf(p.agent);
                if (i >= 0) this.arrive(i, false);
            }
            this._people.delete(id);
        });
        this._info = new Map(list.map((r) => [r.id, r]));
    }
    private _info = new Map<number, WalkerInfo>();

    /** 排一天的日程（D024，DESIGN 15） */
    private plan(r: WalkerInfo): Trip[] {
        const home = r.homeId ?? null;
        if (home === null || !this.buildingByUid(home)) return [];
        const d = this._day, id = r.id;
        const R = (k: number) => rnd(id, d, k);
        const trips: Trip[] = [];
        const go = (at: number, to: number | null) => { if (to !== null && at < DayClock.endHour - 0.5) trips.push({ at, to }); };
        let t: number;

        if (r.age < SCHOOL_AGE) return trips;
        if (r.age < WORK_AGE) {
            const school = this.nearest(home, this._byId.get('school') ?? []);
            if (school !== null) {
                go(6.8 + R(1) * 0.7, school);
                go(16 + R(2) * 1.2, home);
            } else if (R(3) < 0.5) {
                t = 14 + R(4) * 2;
                go(t, this.pickPlace(home, ['plaza', 'milk-tea', 'net-cafe'], R(5)));
                go(t + 1 + R(6), home);
            }
        } else if (r.age >= RETIRE_AGE) {
            if (R(1) < 0.7) {
                t = 7 + R(2) * 1.5;
                go(t, this.pickPlace(home, ELDER_SPOTS, R(3)));
                go(t + 1 + R(4), home);
            }
            if (R(5) < 0.4) {
                t = 15 + R(6) * 1.5;
                go(t, this.pickPlace(home, ['plaza', ...FOOD], R(7)));
                go(t + 1 + R(8) * 0.5, home);
            }
        } else if (r.jobId != null && this.buildingByUid(r.jobId)) {
            go(6.5 + R(1) * 1.5, r.jobId);
            t = 17 + R(2) * 1.5;
            if (R(3) < 0.35) {
                go(t, this.pickPlace(r.jobId, FOOD, R(4)));
                go(t + 0.7 + R(5) * 0.8, home);
            } else {
                go(t, home);
            }
        } else if (r.idle) {
            t = 9.5 + R(1) * 1.5;
            const a = this.pickPlace(home, [], R(2));
            go(t, a);
            t += 1.5 + R(3);
            go(t, a !== null ? this.pickPlace(a, [], R(4)) : null);
            go(t + 1 + R(5), home);
        } else {
            // 待业：上午去有岗位的地方问问
            t = 8.5 + R(1) * 1.5;
            const w = this._workplaces.length ? this._workplaces[Math.floor(R(2) * this._workplaces.length)].uid : null;
            go(t, w);
            go(t + 0.5 + R(3) * 0.5, home);
            if (R(4) < 0.4) {
                t = 18 + R(5);
                go(t, this.pickPlace(home, FOOD, R(6)));
                go(t + 0.8 + R(7) * 0.5, home);
            }
        }
        // 去的地方和上一站一样的趟次去掉（比如店就在单位隔壁也是同一栋）
        return trips.filter((tr, i) => tr.to !== (i > 0 ? trips[i - 1].to : home));
    }

    /**
     * 挑一个去处：先按偏好的建筑 id 找（排前面的优先），都没有就随便一家店。
     * 在离 from 最近的 3 个里随机，人不会总挤在同一家。
     */
    private pickPlace(from: number, prefer: string[], r: number): number | null {
        let cands: PlacedBuilding[] = [];
        for (const id of prefer) {
            const l = this._byId.get(id);
            if (l && l.length) { cands = l; break; }
        }
        if (!cands.length) cands = this._shops;
        const busy = this.busy ? this.busy() : null;
        if (busy && busy.size) cands = cands.filter((b) => !busy.has(b.uid));
        const near = this.nearestList(from, cands, 3);
        return near.length ? near[Math.floor(r * near.length)].uid : null;
    }

    private nearest(from: number, cands: PlacedBuilding[]): number | null {
        const l = this.nearestList(from, cands, 1);
        return l.length ? l[0].uid : null;
    }

    private nearestList(from: number, cands: PlacedBuilding[], n: number): PlacedBuilding[] {
        const a = this.buildingByUid(from);
        if (!a) return [];
        return cands
            .filter((b) => b.uid !== from)
            .map((b) => ({ b, d: Math.abs(b.col - a.col) + Math.abs(b.row - a.row) }))
            .sort((x, y) => x.d - y.d)
            .slice(0, n)
            .map((x) => x.b);
    }

    // ---------------- 出门 / 到达 ----------------
    private depart(p: Person): void {
        const trip = p.trips[p.next++];
        const info = this._info.get(p.id);
        const from = p.loc ?? info?.homeId ?? null;
        if (from === null || from === trip.to || !this.buildingByUid(trip.to)) return;
        const path = this.route(from, trip.to);
        // 不通路、或者街上人太多：直接「到了」，不画
        if (!path || !info || (this._agents.length >= this._traffic.maxOnStreet && p.id !== this.tracked)) { p.loc = trip.to; return; }
        p.loc = null;
        p.agent = this.spawn(info, path, trip.to);
    }

    /** 到了（或者被收掉）：淡出，记下人在哪栋楼；到店冒金币 */
    private arrive(i: number, coin: boolean): void {
        const a = this._agents[i];
        this._agents.splice(i, 1);
        const p = this._people.get(a.residentId);
        if (p && p.agent === a) { p.agent = null; p.loc = a.to; }
        const node = a.node;
        const op = node.getComponent(UIOpacity);
        if (op && coin) {
            Tween.stopAllByTarget(op);
            tween(op).to(LifeLayer.FADE, { opacity: 0 }).call(() => this._layer!.removeActor(node)).start();
        } else {
            this._layer!.removeActor(node);
        }
        if (coin) {
            const b = this.buildingByUid(a.to);
            if (b && b.def.category === '店铺') {
                this.spawnCoin(b.uid);
                const price = this.priceOf ? this.priceOf(b.def.id) : 0;
                if (price > 0) this.spawnFloat(b.uid, price);
            }
        }
    }

    // ---------------- 道路查询 ----------------
    private roadKind(col: number, row: number): string | null {
        const b = this._model!.getAt(col, row);
        return b && b.def.flat ? (b.def.road ?? 'city') : null;
    }

    /** 这一步的道路倍率：走过一半之前按出发格、之后按目标格 */
    private roadFactor(a: Agent): number {
        const k = (a.t < 0.5 ? this.roadKind(a.col, a.row) : this.roadKind(a.tc, a.tr)) ?? 'city';
        const f = this._traffic.roads[k]?.[VEHICLE_OF[a.kind]];
        return typeof f === 'number' && f > 0 ? f : 1;
    }

    /** 楼四周（上下左右相邻）的道路格 = 这栋楼的门口 */
    private doorCells(b: PlacedBuilding): number[] {
        const m = this._model!, w = m.width, out: number[] = [];
        for (let c = b.col; c < b.col + b.def.width; c++) {
            for (const r of [b.row - 1, b.row + b.def.height]) if (r >= 0 && r < m.height && this.roadKind(c, r)) out.push(r * w + c);
        }
        for (let r = b.row; r < b.row + b.def.height; r++) {
            for (const c of [b.col - 1, b.col + b.def.width]) if (c >= 0 && c < w && this.roadKind(c, r)) out.push(r * w + c);
        }
        return out;
    }

    /** 两栋楼之间沿道路的最短路（BFS）。门口相邻也算一条路 */
    private route(from: number, to: number): number[] | null {
        const key = `${from}>${to}`;
        if (this._routes.has(key)) return this._routes.get(key)!;
        const a = this.buildingByUid(from), b = this.buildingByUid(to);
        let result: number[] | null = null;
        if (a && b) {
            const m = this._model!, w = m.width, h = m.height;
            const goal = new Set(this.doorCells(b));
            const prev = new Int32Array(w * h).fill(-2);
            const queue: number[] = [];
            for (const c of this.doorCells(a)) { prev[c] = -1; queue.push(c); }
            let hit = -1;
            for (let qi = 0; qi < queue.length; qi++) {
                const c = queue[qi];
                if (goal.has(c)) { hit = c; break; }
                const col = c % w, row = Math.floor(c / w);
                for (const [dx, dy] of DIRS) {
                    const nc = col + dx, nr = row + dy;
                    if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
                    const n = nr * w + nc;
                    if (prev[n] !== -2 || !this.roadKind(nc, nr)) continue;
                    prev[n] = c;
                    queue.push(n);
                }
            }
            if (hit >= 0) {
                result = [];
                for (let c = hit; c !== -1; c = prev[c]) result.push(c);
                result.reverse();
            }
        }
        this._routes.set(key, result);
        return result;
    }

    // ---------------- 上街 ----------------
    private spawn(who: WalkerInfo, path: number[], to: number): Agent {
        const tr = this._traffic;
        const R = (k: number) => rnd(who.id, this._day, 100 + k + path.length);
        const v = who.vehicle ?? 'walk';
        // 有车的人路远才开车，近的走过去
        let kind: Kind = 'ped';
        if (v !== 'walk' && path.length >= tr.trip.minDriveCells && R(1) < tr.driveShare) kind = KIND_OF[v] ?? 'ped';
        const skin = LifeLayer.skinOf(who, kind);
        const look = kind === 'ped' ? lookOf(who) : null;
        // 个人差异按 id 固定：同一个人每次出门快慢一样
        const hsh = ((who.id * 2654435761) >>> 0) / 4294967296;
        const base = tr.vehicles[VEHICLE_OF[kind]].speed * (1 + (hsh * 2 - 1) * tr.personalSpread);
        // 赶路：路长的人走快一点，尽量在 targetSeconds 内走完
        const hurry = Math.max(1, Math.min(tr.trip.maxHurry, path.length / (base * tr.trip.targetSeconds)));

        const node = new Node(`A_${kind}`);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setAnchorPoint(new Vec2(0.5, 0));
        const op = node.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(LifeLayer.FADE, { opacity: 255 }).start();
        // 影子先加、身体后加：同一节点下后加的画在上面
        const sh = this._art!.get(SHADOW[kind].frame);
        if (sh) {
            const sn = new Node('Shadow');
            sn.layer = Layers.Enum.UI_2D;
            const sz = this._art!.worldSize(sh);
            sn.addComponent(UITransform).setContentSize(sz.width, sz.height);
            const ss = sn.addComponent(Sprite);
            ss.sizeMode = Sprite.SizeMode.CUSTOM;
            ss.spriteFrame = sh;
            ss.enabled = false;
            sn.setPosition(0, SHADOW[kind].settle, 0);
            node.addChild(sn);
        }
        const body = new Node('Body');
        body.layer = Layers.Enum.UI_2D;
        body.addComponent(UITransform).setAnchorPoint(new Vec2(0.5, 0));
        const sprite = body.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.enabled = false;
        node.addChild(body);
        const shSize = sh ? this._art!.worldSize(sh) : { width: 0, height: 0 };

        const w = this._model!.width;
        const c0 = path[0], c1 = path.length > 1 ? path[1] : path[0];
        const a: Agent = {
            kind, node, sprite, skin, look, path, i: 0,
            col: c0 % w, row: Math.floor(c0 / w), tc: c1 % w, tr: Math.floor(c1 / w), t: 0,
            speed: base * hurry,
            side: R(2) < 0.5 ? 1 : -1,
            anim: R(3),
            residentId: who.id,
            to,
            view: {
                gx: 0, gy: 0, frame: null, w: 0, h: 0, flip: false,
                shadow: sh, sw: shSize.width, sh: shSize.height, settle: SHADOW[kind].settle, alpha: 0,
            },
        };
        this._layer!.addActor(node, 0);
        this._agents.push(a);
        this.place(a);
        return a;
    }

    /** 外观跟着人走：同一个人每次出门都是同一身衣服 / 同一辆车 */
    private static skinOf(r: WalkerInfo, kind: Kind): number {
        if (kind === 'scoot') return r.id % SCOOT_SKINS;
        if (kind === 'moto') return r.id % MOTO_SKINS;
        if (kind === 'car') return r.id % CAR_SKINS;
        if (r.age >= 60) return 3;
        const female = [4, 0, 5], male = [1, 2, 5, 0];
        const set = r.gender === 'F' ? female : male;
        return set[r.id % set.length] % PED_SKINS;
    }

    // ---------------- 走路 ----------------
    private step(a: Agent, dt: number, index: number): void {
        const w = this._model!.width;
        if (a.path.length > 1) {
            const d = a.speed * this.roadFactor(a) * dt;
            a.t += d;
            a.anim += d;    // 步伐按走过的距离算，快的人迈得快、停下就不迈，脚不打滑
            while (a.t >= 1) {
                a.i++;
                if (a.i >= a.path.length - 1) { this.place(a); this.arrive(index, true); return; }
                a.t -= 1;
                const c0 = a.path[a.i], c1 = a.path[a.i + 1];
                a.col = c0 % w; a.row = Math.floor(c0 / w);
                a.tc = c1 % w; a.tr = Math.floor(c1 / w);
            }
        } else {
            // 两栋楼共用一个门口：原地站一下就到
            a.t += dt;
            if (a.t >= 0.6) { this.arrive(index, true); return; }
        }
        this.place(a);
    }

    /** 车道偏移：行人走人行道，车靠一侧（垂直于行进方向，对向自动分两边） */
    private lane(a: Agent): number {
        if (a.kind === 'ped') return (this.roadKind(a.col, a.row) === 'city' ? 0.36 : 0.27) * a.side;
        return a.kind === 'car' ? 0.14 : 0.2;
    }

    private place(a: Agent): void {
        const iso = this._iso!, art = this._art!;
        const dx = a.tc - a.col, dy = a.tr - a.row;
        const off = this.lane(a);
        // 垂直方向 (-dy, dx)
        const gx = a.col + 0.5 + dx * a.t + (-dy) * off;
        const gy = a.row + 0.5 + dy * a.t + dx * off;
        iso.toLocal(gx, gy, this._p);
        // 不取整：D021 起是 3D 预渲染图（线性过滤），取整到世界像素在 ×4 缩放下会一跳 4 个屏幕像素，走路一抽一抽
        a.node.setPosition(this._p.x, this._p.y, 0);
        this._layer!.setActorDepth(a.node, iso.depthAt(gx, gy));

        // 朝向看的是屏幕上往哪走（D031 转视角后按视图方向）：
        // +vx 正面，+vy 正面翻转，-vx 背面，-vy 背面翻转（车：沿 vy 翻转）
        const [vdx, vdy] = iso.viewDir(dx, dy);
        const flip = vdy !== 0;
        const front = vdx > 0 || vdy > 0 || (dx === 0 && dy === 0);
        let name: string;
        if (a.kind === 'ped') {
            const f = Math.floor(a.anim / LifeLayer.STRIDE) % 2;
            const suffix = `-${front ? 'front' : 'back'}${dx === 0 && dy === 0 ? 0 : f}`;
            // D023：先用新外观（woman1-front0），图集里还没有就退回旧的 ped<N>
            name = a.look && art.get(a.look + suffix) ? a.look + suffix : `ped${a.skin}${suffix}`;
        } else if (a.kind === 'scoot') {
            name = `scoot${a.skin}-${front ? 'front' : 'back'}`;
        } else if (a.kind === 'moto') {
            name = `moto${a.skin}-${front ? 'front' : 'back'}`;
        } else {
            name = `car${a.skin}`;
        }
        const frame = art.get(name);
        if (frame && a.sprite.spriteFrame !== frame) {
            a.sprite.spriteFrame = frame;
            const sz = art.worldSize(frame);
            a.sprite.node.getComponent(UITransform)!.setContentSize(sz.width, sz.height);
            a.node.getComponent(UITransform)!.setContentSize(sz.width, sz.height);   // 点人判定用
        }
        const sx = flip ? -1 : 1;
        if (a.node.scale.x !== sx) a.node.setScale(sx, 1, 1);
        const v = a.view;
        v.gx = gx; v.gy = gy; v.flip = flip;
        if (v.frame !== a.sprite.spriteFrame) {
            v.frame = a.sprite.spriteFrame;
            const sz = v.frame ? art.worldSize(v.frame) : { width: 0, height: 0 };
            v.w = sz.width; v.h = sz.height;
        }
    }

    // ---------------- 金币 ----------------
    /** 有人走进店里：店顶冒一个金币 */
    private spawnCoin(uid: number): void {
        const frame = this._art!.get('coin');
        if (!frame) return;
        const bn = this._layer!.nodeOf(uid);
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

    /** 到店消费：店顶飘「+¥N」，和金币错开一点 */
    private spawnFloat(uid: number, price: number): void {
        const bn = this._layer!.nodeOf(uid);
        if (!bn) return;
        const h = bn.getComponent(UITransform)!.contentSize.height;
        const node = new Node('Float');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const label = node.addComponent(Label);
        label.string = `+¥${price}`;
        label.fontSize = 13;
        label.lineHeight = 16;
        label.color = new Color(246, 201, 56, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.isBold = true;
        this.node.addChild(node);
        const p = bn.position;
        const y0 = Math.round(p.y + h * 0.85 + 20);
        node.setPosition(p.x, y0, 0);
        node.setScale(0.5, 0.5, 1);
        tween(node)
            .to(0.12, { scale: new Vec3(1.1, 1.1, 1) })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .by(1.1, { position: new Vec3(0, 22, 0) })
            .call(() => node.destroy())
            .start();
    }

    /** 两个行人靠近时，偶尔给其中一个冒一个对话气泡 */
    private trySpawnChatBubble(): void {
        const peds = this._agents.filter((a) => a.kind === 'ped');
        for (let i = 0; i < peds.length; i++) {
            const a = peds[i];
            if (this._chatCooldown.has(a.residentId)) continue;
            for (let j = i + 1; j < peds.length; j++) {
                const b = peds[j];
                if (this._chatCooldown.has(b.residentId)) continue;
                // 网格距离 ≤ 1.2 就算靠近
                const dx = (a.col + a.t * (a.tc - a.col)) - (b.col + b.t * (b.tc - b.col));
                const dy = (a.row + a.t * (a.tr - a.row)) - (b.row + b.t * (b.tr - b.row));
                if (dx * dx + dy * dy > 1.44) continue;
                // 30% 概率触发
                if (Math.random() > 0.3) continue;
                this.spawnChatBubble(Math.random() < 0.5 ? a : b);
                this._chatCooldown.set(a.residentId, 8);
                this._chatCooldown.set(b.residentId, 8);
            }
        }
    }

    /**
     * 两人聊天时头顶飘一个小音符，往上飘 1.5 秒后淡出。纯装饰，不能点。
     * 故意不用对话框 +「…」：楼顶心愿气泡也是对话框，玩家会看混。
     */
    private spawnChatBubble(a: Agent): void {
        const node = new Node('ChatBubble');
        node.layer = Layers.Enum.UI_2D;
        const ui = node.addComponent(UITransform);
        ui.setContentSize(14, 16);
        ui.setAnchorPoint(0.5, 0);
        const g = node.addComponent(Graphics);
        // 先画深色描边（同形状放粗），再画白色本体，草地 / 路面上都看得见
        const note = (c: Color, pad: number) => {
            g.fillColor = c;
            g.ellipse(-2, 3, 3 + pad, 2.2 + pad);          // 符头
            g.fill();
            g.rect(0.2 - pad, 3, 1.6 + pad * 2, 9 + pad);  // 符干
            g.fill();
            g.moveTo(1.8 - pad, 12 + pad); g.lineTo(5.5 + pad, 9.5); g.lineTo(5.5 + pad, 7.5 - pad); g.lineTo(1.8 - pad, 9.8 - pad); g.close();
            g.fill();                                      // 符尾
        };
        note(new Color(70, 74, 86, 200), 0.9);
        note(new Color(255, 255, 255, 255), 0);
        const op = node.addComponent(UIOpacity);
        op.opacity = 0;
        // 挂在行人节点上，跟着人走
        a.node.addChild(node);
        const x = Math.random() < 0.5 ? -6 : 6;
        node.setPosition(x, 92, 0);   // 行人图高约 94 世界像素（8 倍图 64×96），音符在头顶偏一侧
        node.setScale(0.6, 0.6, 1);
        tween(node).to(1.5, { position: new Vec3(x * 1.5, 104, 0) }).start();
        tween(op).to(0.15, { opacity: 230 }).delay(1.0).to(0.35, { opacity: 0 })
            .call(() => { Tween.stopAllByTarget(node); node.destroy(); })
            .start();
    }
}
