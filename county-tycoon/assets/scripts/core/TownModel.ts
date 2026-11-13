import { BuildingDef } from './BuildingConfig';

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
     * 门面朝向（D015 修订）：'L' 门面在左下墙，'R' 在右下墙。
     * null = 还没定（放下时四周没有道路）；第一次挨上道路时定一次，之后锁住，
     * 只有玩家手动点它才会再变。道路本身不用这个字段。
     */
    facing: Facing | null;
}

export type Facing = 'L' | 'R';

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

    constructor(width: number, height: number) {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this._cells = new Array(this.width * this.height).fill(null);
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

    /** 能否在这个位置放下这栋建筑：所有占用的格子都要在地图内且为空 */
    canPlace(def: BuildingDef, col: number, row: number): boolean {
        for (let r = 0; r < def.height; r++) {
            for (let c = 0; c < def.width; c++) {
                const cc = col + c;
                const rr = row + r;
                if (!this.inBounds(cc, rr)) return false;
                if (this._cells[rr * this.width + cc] !== null) return false;
            }
        }
        return true;
    }

    /**
     * 放一栋建筑。
     * 放不下时返回 null，调用方据此给出失败反馈。
     */
    place(def: BuildingDef, col: number, row: number): PlacedBuilding | null {
        if (!this.canPlace(def, col, row)) return null;

        const placed: PlacedBuilding = { uid: this._nextUid++, def, col, row, facing: null };
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
     * 规则：左下边（row+h 那一侧）有路 → 'L'；否则右下边（col+w 那一侧）有路 → 'R'；
     * 只有背后（左上 / 右上）有路 → 'L'（门面没法对着背后的路，只能朝镜头）。
     */
    settleFacings(): void {
        const list = this.allBuildings();
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.def.flat || b.facing) continue;
            const { col, row } = b, w = b.def.width, h = b.def.height;
            let front = false, right = false, back = false;
            for (let c = col; c < col + w; c++) {
                if (this.isRoad(c, row + h)) front = true;
                if (this.isRoad(c, row - 1)) back = true;
            }
            for (let r = row; r < row + h; r++) {
                if (this.isRoad(col + w, r)) right = true;
                if (this.isRoad(col - 1, r)) back = true;
            }
            if (front) b.facing = 'L';
            else if (right) b.facing = 'R';
            else if (back) b.facing = 'L';
        }
    }

    /** 玩家手动换朝向（路口转角想朝另一条路时用）。道路和空地返回 null */
    toggleFacing(col: number, row: number): PlacedBuilding | null {
        const b = this.getAt(col, row);
        if (!b || b.def.flat) return null;
        b.facing = b.facing === 'R' ? 'L' : 'R';
        return b;
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
}
