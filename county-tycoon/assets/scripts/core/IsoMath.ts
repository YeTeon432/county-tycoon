import { WorldConfig } from './WorldConfig';

/**
 * 等距（2:1 菱形）坐标换算，纯函数，不依赖引擎（D014）。
 *
 * 格子坐标 (gx, gy) 是连续值：第 col 列第 row 行的格子覆盖 gx∈[col, col+1)、gy∈[row, row+1)。
 *   - gx 增大 → 屏幕上往右下走
 *   - gy 增大 → 屏幕上往左下走
 *   - (0, 0) 是地图最上面那个角
 *
 * 地图本地坐标的原点在整张菱形地图的正中，y 向上（Cocos 约定）。
 * 整张图的外接矩形宽 (W+H)·半宽、高 (W+H)·半高，永远是 2:1。
 */
export interface IsoPoint {
    x: number;
    y: number;
}

export class IsoMath {
    readonly hw: number;
    readonly hh: number;
    readonly cols: number;
    readonly rows: number;
    /** 让菱形左右居中的水平偏移 */
    private readonly _offX: number;
    /** 地图最上角的 y */
    private readonly _topY: number;

    constructor(config: WorldConfig) {
        this.hw = config.tileWidth / 2;
        this.hh = config.tileHeight / 2;
        this.cols = config.gridWidth;
        this.rows = config.gridHeight;
        this._offX = (this.cols - this.rows) * this.hw / 2;
        this._topY = (this.cols + this.rows) * this.hh / 2;
    }

    /** 整张地图外接矩形的宽（未缩放） */
    get mapWidth(): number {
        return (this.cols + this.rows) * this.hw;
    }

    /** 整张地图外接矩形的高（未缩放） */
    get mapHeight(): number {
        return (this.cols + this.rows) * this.hh;
    }

    /** 连续格子坐标 → 地图本地坐标 */
    toLocal(gx: number, gy: number, out: IsoPoint = { x: 0, y: 0 }): IsoPoint {
        out.x = (gx - gy) * this.hw - this._offX;
        out.y = this._topY - (gx + gy) * this.hh;
        return out;
    }

    /** 地图本地坐标 → 格子 [col, row]；越界返回 null */
    toCell(x: number, y: number): [number, number] | null {
        const a = (x + this._offX) / this.hw;   // gx - gy
        const b = (this._topY - y) / this.hh;   // gx + gy
        const col = Math.floor((a + b) / 2);
        const row = Math.floor((b - a) / 2);
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
        return [col, row];
    }

    /** 某一格（或 w×h 占地）菱形的上顶点：贴地面图时用它对齐 */
    cellTop(col: number, row: number, out?: IsoPoint): IsoPoint {
        return this.toLocal(col, row, out);
    }

    /**
     * w×h 占地的最下顶点。建筑图的"底边中点"对齐到这里，
     * 所以建筑图宽必须是 (w+h)·半宽（ART_SPEC）。
     */
    footBottom(col: number, row: number, w: number, h: number, out?: IsoPoint): IsoPoint {
        return this.toLocal(col + w, row + h, out);
    }

    /** 占地菱形的四个顶点（上、右、下、左），画预览框用 */
    footprint(col: number, row: number, w: number, h: number): IsoPoint[] {
        return [
            this.toLocal(col, row),
            this.toLocal(col + w, row),
            this.toLocal(col + w, row + h),
            this.toLocal(col, row + h),
        ];
    }

    /**
     * 前后遮挡的排序键：越大越靠前（后画）。
     * 用占地中心的 gx+gy。对互不重叠的 1×1、2×2 混排是正确的：
     * 一栋建筑若整体在另一栋的右下或左下，它的中心和一定更大。
     */
    static depth(col: number, row: number, w: number, h: number): number {
        return col + w / 2 + row + h / 2;
    }
}
