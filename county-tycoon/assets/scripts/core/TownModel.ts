import { BuildingDef } from './BuildingConfig';
import { Terrain } from './Terrain';

/** 已经放在地图上的一栋建筑 */
export interface PlacedBuilding {
    /** 运行时唯一编号，用来区分"同一栋"（多格建筑在多个格子里指向同一个对象） */
    uid: number;
    def: BuildingDef;
    /** 左下角所在列（0 起，从左往右） */
    col: number;
    /** 左下角所在行（0 起，从下往上） */
    row: number;
    /**
     * 门面朝向（D015 修订、D036 补成四面）：见 Facing。
     * null = 还没定（放下时四周没有道路）；第一次挨上道路时定一次，之后锁住，
     * 只有玩家手动点它才会再变。道路本身不用这个字段。
     */
    facing: Facing | null;
}

/**
 * 门面朝哪一边（D036）：'L' 左下（row+h 那侧）、'R' 右下（col+w 那侧）、'UR' 右上（row−1 那侧）、'UL' 左上（col−1 那侧）。
 * 以前只有 L / R（2D 只画了朝镜头的两面），路在楼背后时门只能背对着路；真 3D 转视角后一眼就看出来，所以补成四个。
 */
export type Facing = 'L' | 'R' | 'UR' | 'UL';
/** 屏幕上顺时针一圈：左下 → 左上 → 右上 → 右下（换朝向按这个顺序轮） */
export const FACING_ORDER: Facing[] = ['L', 'UL', 'UR', 'R'];

/**
 * 城镇的地块数据。
 *
 * 只管"哪一格被谁占了"，不碰任何渲染。这样以后加存档、加收益结算、
 * 加组合判定（PRD 第 6 节的特色街道）都只需要读这里，不用碰画面代码。
 *
 * 坐标约定：col 从 0 开始从左往右，row 从 0 开始从下往上。
 * 多格建筑只记它的左下角坐标，其余格子都指向同一个 PlacedBuilding 对象。
 */
export class TownModel {
    readonly width: number;
    readonly height: number;

    /** 下标 = row * width + col，空地为 null */
    private _cells: (PlacedBuilding | null)[] = [];
    private _nextUid = 1;
    /**
     * 地形（T321，支线 D）。null = 没接地形，行为和以前完全一样。
     * 接上之后 canPlace 会多查一条"这格地形能不能盖"，其余逻辑不变。
     */
    private _terrain: Terrain | null = null;

    constructor(width: number, height: number) {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this._cells = new Array(this.width * this.height).fill(null);
    }

    /** 接上地形数据。不调也行，那就当全平地处理（兼容没读 map.json 的场景） */
    setTerrain(terrain: Terrain | null): void {
        this._terrain = terrain;
    }

    get terrain(): Terrain | null {
        return this._terrain;
    }

    /** 坐标是否在地图内 */
    inBounds(col: number, row: number): boolean {
        return col >= 0 && row >= 0 && col < this.width && row < this.height;
    }

    /** 取某格上的建筑；空地或越界返回 null */
    getAt(col: number, row: number): PlacedBuilding | null {
        if (!this.inBounds(col, row)) return null;
        return this._cells[row * this.width + col];
    }

    /** 能否在这个位置放下这栋建筑：所有占用的格子都要在地图内、为空、地形允许 */
    canPlace(def: BuildingDef, col: number, row: number): boolean {
        for (let r = 0; r < def.height; r++) {
            for (let c = 0; c < def.width; c++) {
                const cc = col + c;
                const rr = row + r;
                if (!this.inBounds(cc, rr)) return false;
                if (this._cells[rr * this.width + cc] !== null) return false;
            }
        }
        // 地形判断放在最后：走得最多的"越界 / 被占"两条先短路，省得每次都算地形
        if (this._terrain && !this._terrain.canBuild(def, col, row)) return false;
        return true;
    }

    /**
     * 放一栋建筑。
     * 放不下时返回 null，调用方据此给出失败反馈。
     */
    place(def: BuildingDef, col: number, row: number, facing: Facing | null = null): PlacedBuilding | null {
        if (!this.canPlace(def, col, row)) return null;

        // 放置预览里玩家选好的朝向直接锁定（D022）；没给就按 settleFacings 的老规则
        const placed: PlacedBuilding = { uid: this._nextUid++, def, col, row, facing: def.flat ? null : facing };
        for (let r = 0; r < def.height; r++) {
            for (let c = 0; c < def.width; c++) {
                this._cells[(row + r) * this.width + (col + c)] = placed;
            }
        }
        // 新盖的楼给自己定朝向；新修的路给旁边还没定朝向的楼定朝向
        this.settleFacings();
        return placed;
    }

    private isRoad(col: number, row: number): boolean {
        const b = this.getAt(col, row);
        return !!b && b.def.flat;
    }

    /**
     * 给还没定朝向、且已经挨着道路的建筑定朝向，定了就不再改。
     * 规则：按 roadSides 的优先级取第一条挨路的边（左下 → 右下 → 右上 → 左上，D036）。
     */
    settleFacings(): void {
        const list = this.allBuildings();
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.def.flat || b.facing) continue;
            const f = this.facingByRoads(b.def, b.col, b.row);
            if (f) b.facing = f;
        }
    }

    /**
     * 找一块放得下、挨着路、离 (nearCol, nearRow) 最近的空地（招商选址引导用，D032）。
     * 找不到挨路的就退一步，只要放得下；都没有返回 null。
     */
    findSpot(def: BuildingDef, nearCol: number, nearRow: number): { col: number; row: number } | null {
        let best: { col: number; row: number } | null = null, bestD = Infinity;
        let loose: { col: number; row: number } | null = null, looseD = Infinity;
        const cx = nearCol - def.width / 2, cy = nearRow - def.height / 2;
        for (let row = 0; row + def.height <= this.height; row++) {
            for (let col = 0; col + def.width <= this.width; col++) {
                if (!this.canPlace(def, col, row)) continue;
                const d = (col - cx) * (col - cx) + (row - cy) * (row - cy);
                if (this.facingByRoads(def, col, row)) {
                    if (d < bestD) { bestD = d; best = { col, row }; }
                } else if (d < looseD) { looseD = d; loose = { col, row }; }
            }
        }
        return best ?? loose;
    }

    /**
     * 按四周的路算一个朝向（不改任何东西）；四周没路返回 null。
     * 放置预览用它给默认朝向，settleFacings 用它定朝向，两边规则一致。
     */
    facingByRoads(def: BuildingDef, col: number, row: number): Facing | null {
        return this.roadSides(def, col, row)[0] ?? null;
    }

    /** 四条边里挨着路的边，按优先级：左下、右下、右上、左上（朝镜头的两面优先） */
    roadSides(def: BuildingDef, col: number, row: number): Facing[] {
        const w = def.width, h = def.height;
        const has = { L: false, R: false, UR: false, UL: false };
        for (let c = col; c < col + w; c++) {
            if (this.isRoad(c, row + h)) has.L = true;
            if (this.isRoad(c, row - 1)) has.UR = true;
        }
        for (let r = row; r < row + h; r++) {
            if (this.isRoad(col + w, r)) has.R = true;
            if (this.isRoad(col - 1, r)) has.UL = true;
        }
        return (['L', 'R', 'UR', 'UL'] as Facing[]).filter((f) => has[f]);
    }

    /**
     * 换朝向的下一个：按屏幕顺时针找下一条挨路的边（路口转角就在两条路之间切）；
     * 只有一条边挨路（或都不挨）就按顺时针挨个转。
     */
    nextFacing(def: BuildingDef, col: number, row: number, cur: Facing | null): Facing {
        const sides = this.roadSides(def, col, row);
        const at = FACING_ORDER.indexOf(cur ?? 'L');
        for (let k = 1; k <= 4; k++) {
            const f = FACING_ORDER[(at + k) % 4];
            if (sides.length < 2 || sides.indexOf(f) >= 0) return f;
        }
        return cur ?? 'L';
    }

    /** 玩家手动换朝向（路口转角想朝另一条路时用）。道路和空地返回 null */
    toggleFacing(col: number, row: number): PlacedBuilding | null {
        const b = this.getAt(col, row);
        if (!b || b.def.flat) return null;
        b.facing = this.nextFacing(b.def, b.col, b.row, b.facing);
        return b;
    }

    /**
     * 读档时修老朝向（D036）：以前门只能朝 L / R，路在背后的楼被定成了 L。
     * 门面那一边不挨路、别的边挨路的，按现在的规则重定一次。返回改了几栋。
     */
    fixFacings(): number {
        let n = 0;
        for (const b of this.allBuildings()) {
            if (b.def.flat || !b.facing) continue;
            const sides = this.roadSides(b.def, b.col, b.row);
            if (sides.length && sides.indexOf(b.facing) < 0) { b.facing = sides[0]; n++; }
        }
        return n;
    }

    /**
     * 拆掉某格上的建筑（整栋一起拆，不是拆一格）。
     * 返回被拆掉的建筑；空地返回 null。
     */
    removeAt(col: number, row: number): PlacedBuilding | null {
        const target = this.getAt(col, row);
        if (!target) return null;

        for (let r = 0; r < target.def.height; r++) {
            for (let c = 0; c < target.def.width; c++) {
                this._cells[(target.row + r) * this.width + (target.col + c)] = null;
            }
        }
        return target;
    }

    /** 当前地图上所有建筑（渲染时遍历用） */
    allBuildings(): PlacedBuilding[] {
        const seen = new Set<number>();
        const result: PlacedBuilding[] = [];
        for (let i = 0; i < this._cells.length; i++) {
            const b = this._cells[i];
            if (b && !seen.has(b.uid)) {
                seen.add(b.uid);
                result.push(b);
            }
        }
        return result;
    }

    /** 建筑总数 */
    get buildingCount(): number {
        return this.allBuildings().length;
    }

    /** 清空（以后读档、重开一局要用） */
    clear(): void {
        this._cells.fill(null);
        this._nextUid = 1;
    }

    // ------------------------------------------------------------------
    // 读档用（支线 D / T320）。只加不改：上面已有的方法行为完全没动。
    // ------------------------------------------------------------------

    /** 下一个要用的 uid。存档时记下来，读档后接着编号，避免新建筑撞号 */
    peekNextUid(): number {
        return this._nextUid;
    }

    /**
     * 保证"下一个要分配的 uid"至少是这个数。
     * 读档时把存档里的 nextUid 塞回来，避免新建筑和旧建筑撞号。
     */
    ensureNextUidAtLeast(nextUid: number): void {
        if (Number.isFinite(nextUid) && nextUid > this._nextUid) {
            this._nextUid = Math.floor(nextUid);
        }
    }

    /**
     * 用存档里记录的 uid 放一栋建筑。
     *
     * 和 place() 的唯一区别是不自己分配 uid —— 读档必须保留原来的编号，
     * 因为 SimState 里的住户 / 员工全是按 uid 对上的。
     * 朝向由调用方随后赋值（place 里那套自动定朝向对读档是错的：
     * 存档里面对的是玩家手动换过的结果，不该被重新推断覆盖）。
     *
     * 放不下返回 null，调用方跳过这栋即可。
     */
    placeWithUid(def: BuildingDef, col: number, row: number, uid: number): PlacedBuilding | null {
        if (!this.canPlace(def, col, row)) return null;

        const placed: PlacedBuilding = { uid, def, col, row, facing: null };
        for (let r = 0; r < def.height; r++) {
            for (let c = 0; c < def.width; c++) {
                this._cells[(row + r) * this.width + (col + c)] = placed;
            }
        }
        this.ensureNextUidAtLeast(uid + 1);
        return placed;
    }

    /** 原地换成同尺寸的另一种建筑（住户自家翻盖，D026）。尺寸不同返回 false */
    replaceDef(uid: number, def: BuildingDef): boolean {
        let found = false;
        for (let i = 0; i < this._cells.length; i++) {
            const b = this._cells[i];
            if (!b || b.uid !== uid) continue;
            if (b.def.width !== def.width || b.def.height !== def.height) return false;
            b.def = def;
            found = true;
        }
        return found;
    }

    /** uid 是否已经被占（读档时查重用） */
    hasUid(uid: number): boolean {
        for (let i = 0; i < this._cells.length; i++) {
            const b = this._cells[i];
            if (b && b.uid === uid) return true;
        }
        return false;
    }
}
