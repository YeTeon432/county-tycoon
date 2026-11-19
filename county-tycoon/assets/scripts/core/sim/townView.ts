/**
 * 模拟层看地图的唯一入口（与 TownModel 解耦，见 docs/PARALLEL.md 支线 A）。
 *
 * 模拟层只关心三件事：哪栋楼在哪、哪一格是道路、从 A 走到 B 要几步。
 * 具体的实现（TownModel / 存档 / 测试用的假地图）都通过这个只读接口传进来，
 * 所以 `core/sim/` 不需要 import TownModel，也就能在 node 下直接跑测试。
 *
 * 怎么接（集成用）：
 *   const view = new SimpleTownView(world.gridWidth, world.gridHeight, () =>
 *       model.allBuildings().map((b) => ({
 *           uid: b.uid, defId: b.def.id,
 *           col: b.col, row: b.row, width: b.def.width, height: b.def.height,
 *           road: b.def.flat,
 *       })));
 */

export interface PlacedInfo {
    uid: number;
    defId: string;
    /** 左下角所在列 / 行 */
    col: number;
    row: number;
    width: number;
    height: number;
    /** 贴地的道路（土路 / 城市道路）：居民沿它走 */
    road: boolean;
}

export interface TownView {
    readonly width: number;
    readonly height: number;
    allBuildings(): readonly PlacedInfo[];
    building(uid: number): PlacedInfo | null;
    /**
     * 沿道路从 a 走到 b 要几步。
     * 从各自贴着道路的那一格开始算，两栋共用一个路口 = 1 步；同一栋 = 0。
     * 不挨道路、地图上不存在、或路网不连通 → Infinity。
     */
    roadDistance(a: number, b: number): number;
    /** 两栋楼在地块上的直线距离（环境、服务范围判断用，不走道路） */
    gridDistance(a: number, b: number): number;
    /** 地图变了（盖楼 / 拆楼 / 拆路）之后调一次。可选，模拟层会尽量自己调 */
    refresh?(): void;
    /** 一块还没盖的地（col,row,w,h）沿路走到某栋楼几步（放置预览的特色街道提示用，D026） */
    spotDistance?(col: number, row: number, w: number, h: number, uid: number): number;
    /**
     * 服务范围（覆盖范围高亮用）：从一块地（还没盖的预览）或一栋楼的门口出发，沿路走 maxSteps 步以内。
     * roads = 走得到的道路格（下标 row * width + col）；near = 走得到的楼 uid → 步数（和 roadDistance 同一算法）。
     */
    spotReach?(col: number, row: number, w: number, h: number, maxSteps: number): Reach;
    uidReach?(uid: number, maxSteps: number): Reach;
}

export interface Reach {
    roads: number[];
    near: Map<number, number>;
}

/** 每次 refresh 时重新读一遍地图，所以接 TownModel 只需要一个取建筑的函数 */
export type BuildingSource = () => readonly PlacedInfo[];

const NO_ROAD = Number.POSITIVE_INFINITY;
/** 缓存多少个"起点"的 BFS 结果；超了整体清一次，县城规模下基本用不到 */
const MAX_CACHE = 256;

/**
 * 默认实现：把地图拍平成一组格子做 BFS。
 *
 * 40×40 的地图，一次 BFS 扫 1600 格；一个月里按"家"当起点，居民有多少户就扫多少次，
 * 100 户也才 16 万次，够用。真要几千人再换预计算路网最短路。
 */
export class SimpleTownView implements TownView {
    readonly width: number;
    readonly height: number;

    private readonly _source: BuildingSource;
    private _list: PlacedInfo[] = [];
    private _byUid = new Map<number, PlacedInfo>();
    /** 道路格子，下标 = row * width + col */
    private _roadCells = new Set<number>();
    /** 每栋楼贴着道路的格子（门口），算距离的起点 / 终点 */
    private _doors = new Map<number, number[]>();
    /** 起点 uid → (终点 uid → 步数) */
    private _cache = new Map<number, Map<number, number>>();

    constructor(width: number, height: number, source: BuildingSource) {
        this.width = Math.max(1, Math.floor(width));
        this.height = Math.max(1, Math.floor(height));
        this._source = source;
        this.refresh();
    }

    /** 重新读地图、清缓存 */
    refresh(): void {
        const list = this._source() ?? [];
        this._list = list.slice();
        this._byUid.clear();
        this._roadCells.clear();
        this._doors.clear();
        this._cache.clear();
        for (const b of this._list) {
            this._byUid.set(b.uid, b);
            if (b.road) {
                for (let r = b.row; r < b.row + b.height; r++) {
                    for (let c = b.col; c < b.col + b.width; c++) {
                        if (this.inBounds(c, r)) this._roadCells.add(r * this.width + c);
                    }
                }
            }
        }
        for (const b of this._list) this._doors.set(b.uid, this.doorsOf(b));
    }

    allBuildings(): readonly PlacedInfo[] {
        return this._list;
    }

    building(uid: number): PlacedInfo | null {
        return this._byUid.get(uid) ?? null;
    }

    roadDistance(a: number, b: number): number {
        if (a === b) return 0;
        let dists = this._cache.get(a);
        if (!dists) {
            dists = this.bfsFrom(a);
            if (this._cache.size >= MAX_CACHE) this._cache.clear();
            this._cache.set(a, dists);
        }
        return dists.get(b) ?? NO_ROAD;
    }

    gridDistance(a: number, b: number): number {
        const pa = this._byUid.get(a);
        const pb = this._byUid.get(b);
        if (!pa || !pb) return NO_ROAD;
        const ax = pa.col + pa.width / 2;
        const ay = pa.row + pa.height / 2;
        const bx = pb.col + pb.width / 2;
        const by = pb.row + pb.height / 2;
        return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); // 切比雪夫距离，方块地图上更好理解
    }

    private inBounds(col: number, row: number): boolean {
        return col >= 0 && row >= 0 && col < this.width && row < this.height;
    }

    /** 一栋楼四周贴着道路的格子 */
    private doorsOf(b: PlacedInfo): number[] {
        const cells: number[] = [];
        const left = b.col - 1;
        const right = b.col + b.width;
        const bottom = b.row - 1;
        const top = b.row + b.height;
        for (let c = b.col; c < b.col + b.width; c++) {
            if (this.isRoadCell(c, bottom)) cells.push(bottom * this.width + c);
            if (this.isRoadCell(c, top)) cells.push(top * this.width + c);
        }
        for (let r = b.row; r < b.row + b.height; r++) {
            if (this.isRoadCell(left, r)) cells.push(r * this.width + left);
            if (this.isRoadCell(right, r)) cells.push(r * this.width + right);
        }
        return cells;
    }

    private isRoadCell(col: number, row: number): boolean {
        if (!this.inBounds(col, row)) return false;
        return this._roadCells.has(row * this.width + col);
    }

    spotDistance(col: number, row: number, w: number, h: number, uid: number): number {
        const start = this.doorsOf({ uid: -1, defId: '', col, row, width: w, height: h, road: false });
        const goal = new Set(this._doors.get(uid) ?? []);
        if (!start.length || !goal.size) return NO_ROAD;
        const dist = new Map<number, number>();
        const queue: number[] = [];
        for (const c of start) if (!dist.has(c)) { dist.set(c, 1); queue.push(c); }
        for (let head = 0; head < queue.length; head++) {
            const cell = queue[head];
            const d = dist.get(cell) as number;
            if (goal.has(cell)) return d;
            for (const next of this.neighbours(cell)) {
                if (dist.has(next)) continue;
                dist.set(next, d + 1);
                queue.push(next);
            }
        }
        return NO_ROAD;
    }

    spotReach(col: number, row: number, w: number, h: number, maxSteps: number): Reach {
        return this.reachFromDoors(this.doorsOf({ uid: -1, defId: '', col, row, width: w, height: h, road: false }), maxSteps, -1);
    }

    uidReach(uid: number, maxSteps: number): Reach {
        return this.reachFromDoors(this._doors.get(uid) ?? [], maxSteps, uid);
    }

    /** 门口那一格算第 1 步（和 bfsFrom 一致），走到 maxSteps 为止 */
    private reachFromDoors(start: number[], maxSteps: number, self: number): Reach {
        const dist = new Map<number, number>();
        const queue: number[] = [];
        if (maxSteps >= 1) for (const c of start) if (!dist.has(c)) { dist.set(c, 1); queue.push(c); }
        for (let head = 0; head < queue.length; head++) {
            const cell = queue[head];
            const d = dist.get(cell) as number;
            if (d >= maxSteps) continue;
            for (const next of this.neighbours(cell)) {
                if (dist.has(next)) continue;
                dist.set(next, d + 1);
                queue.push(next);
            }
        }
        const near = new Map<number, number>();
        for (const b of this._list) {
            if (b.uid === self || b.road) continue;
            let best = NO_ROAD;
            for (const cell of this._doors.get(b.uid) ?? []) {
                const d = dist.get(cell);
                if (d !== undefined && d < best) best = d;
            }
            if (best !== NO_ROAD) near.set(b.uid, best);
        }
        return { roads: queue, near };
    }

    /** 从 a 的门口出发，沿道路走到能到达的每一栋楼 */
    private bfsFrom(a: number): Map<number, number> {
        const result = new Map<number, number>();
        const start = this._doors.get(a);
        if (!start || !start.length) return result;

        // 道路格子 → 步数。从门口那一格算第 1 步
        const dist = new Map<number, number>();
        const queue: number[] = [];
        for (const cell of start) {
            if (!dist.has(cell)) {
                dist.set(cell, 1);
                queue.push(cell);
            }
        }

        // 反查：某格道路挨着哪些楼（算到终点用）
        for (let head = 0; head < queue.length; head++) {
            const cell = queue[head];
            const d = dist.get(cell) as number;
            for (const next of this.neighbours(cell)) {
                if (dist.has(next)) continue;
                dist.set(next, d + 1);
                queue.push(next);
            }
        }

        for (const b of this._list) {
            if (b.uid === a) continue;
            const doors = this._doors.get(b.uid);
            if (!doors) continue;
            let best = NO_ROAD;
            for (const cell of doors) {
                const d = dist.get(cell);
                if (d !== undefined && d < best) best = d;
            }
            if (best !== NO_ROAD) result.set(b.uid, best);
        }
        return result;
    }

    private neighbours(cell: number): number[] {
        const col = cell % this.width;
        const row = Math.floor(cell / this.width);
        const out: number[] = [];
        if (col > 0 && this._roadCells.has(cell - 1)) out.push(cell - 1);
        if (col < this.width - 1 && this._roadCells.has(cell + 1)) out.push(cell + 1);
        if (row > 0 && this._roadCells.has(cell - this.width)) out.push(cell - this.width);
        if (row < this.height - 1 && this._roadCells.has(cell + this.width)) out.push(cell + this.width);
        return out;
    }
}
