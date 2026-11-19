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

    // ---------------- 视角旋转（D031） ----------------
    /**
     * 视角：0～3，每一档 = 地图在屏幕上顺时针转 90°。只改「怎么画」，格子坐标（模型、存档、模拟）都不变。
     * 下面所有接收 (col, row) / (gx, gy) 的方法都是**模型坐标**，内部先转成「视图坐标」再投影。
     * 地图必须是正方形（cols === rows）才能转；不是正方形时 rot 永远是 0。
     */
    private _rot = 0;

    get rot(): number {
        return this._rot;
    }

    set rot(v: number) {
        this._rot = this.cols === this.rows ? ((Math.round(v) % 4) + 4) % 4 : 0;
    }

    get canRotate(): boolean {
        return this.cols === this.rows;
    }

    /**
     * 跟手转时 rot 之外多出来的那一点角度（弧度，|spin| ≤ 45°，正 = 屏幕上顺时针）。
     * 只影响连续坐标（楼、人车的位置和前后顺序）；格子换算（viewCell / modelCell / toCell）和选图仍按 rot。
     * 停下来时一定是 0。
     */
    private _spin = 0;

    get spin(): number {
        return this._spin;
    }

    set spin(v: number) {
        this._spin = this.canRotate ? v : 0;
    }

    /** 模型连续坐标 → 视图连续坐标 */
    private view(gx: number, gy: number): [number, number] {
        const n = this.cols;
        if (this._spin !== 0) {
            // 绕地图中心转 rot·90° + spin（视图坐标里正角 = 屏幕上顺时针）
            const a = this._rot * Math.PI / 2 + this._spin, c = Math.cos(a), s = Math.sin(a);
            const u = gx - n / 2, w = gy - n / 2;
            return [u * c - w * s + n / 2, u * s + w * c + n / 2];
        }
        switch (this._rot) {
            case 1: return [n - gy, gx];
            case 2: return [n - gx, n - gy];
            case 3: return [gy, n - gx];
            default: return [gx, gy];
        }
    }

    /** 模型格子 → 视图格子 */
    viewCell(col: number, row: number): [number, number] {
        const n = this.cols - 1;
        switch (this._rot) {
            case 1: return [n - row, col];
            case 2: return [n - col, n - row];
            case 3: return [row, n - col];
            default: return [col, row];
        }
    }

    /** 视图格子 → 模型格子（越界照样算，调用方自己判断） */
    modelCell(vc: number, vr: number): [number, number] {
        const n = this.cols - 1;
        switch (this._rot) {
            case 1: return [vr, n - vc];
            case 2: return [n - vc, n - vr];
            case 3: return [n - vr, vc];
            default: return [vc, vr];
        }
    }

    /** 模型里的方向（如 (1,0) = +col）→ 视图里的方向。行人车辆选正面 / 背面帧用 */
    viewDir(dx: number, dy: number): [number, number] {
        switch (this._rot) {
            case 1: return [-dy, dx];
            case 2: return [-dx, -dy];
            case 3: return [dy, -dx];
            default: return [dx, dy];
        }
    }

    /** w×h 占地在视图里的左上格和宽高（奇数档宽高对调） */
    private viewRect(col: number, row: number, w: number, h: number): [number, number, number, number] {
        const [ax, ay] = this.view(col, row);
        const [bx, by] = this.view(col + w, row + h);
        return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
    }

    /** 视图连续坐标 → 地图本地坐标（不转，地面瓦片这种固定在视图格子上的东西直接用） */
    project(vx: number, vy: number, out: IsoPoint = { x: 0, y: 0 }): IsoPoint {
        out.x = (vx - vy) * this.hw - this._offX;
        out.y = this._topY - (vx + vy) * this.hh;
        return out;
    }

    /** 模型连续坐标 → 地图本地坐标 */
    toLocal(gx: number, gy: number, out: IsoPoint = { x: 0, y: 0 }): IsoPoint {
        const [vx, vy] = this.view(gx, gy);
        return this.project(vx, vy, out);
    }

    /** 地图本地坐标 → 模型连续坐标（不限范围）。转视角时找「屏幕中心是哪一点」用 */
    fromLocal(x: number, y: number): [number, number] {
        const a = (x + this._offX) / this.hw;   // vx - vy
        const b = (this._topY - y) / this.hh;   // vx + vy
        const vx = (a + b) / 2, vy = (b - a) / 2;
        const n = this.cols;
        if (this._spin !== 0) {
            const t = -(this._rot * Math.PI / 2 + this._spin), c = Math.cos(t), s = Math.sin(t);
            const u = vx - n / 2, w = vy - n / 2;
            return [u * c - w * s + n / 2, u * s + w * c + n / 2];
        }
        switch (this._rot) {
            case 1: return [vy, n - vx];
            case 2: return [n - vx, n - vy];
            case 3: return [n - vy, vx];
            default: return [vx, vy];
        }
    }

    /** 地图本地坐标 → 视图格子；越界返回 null */
    toViewCell(x: number, y: number): [number, number] | null {
        const a = (x + this._offX) / this.hw;   // vx - vy
        const b = (this._topY - y) / this.hh;   // vx + vy
        const col = Math.floor((a + b) / 2);
        const row = Math.floor((b - a) / 2);
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
        return [col, row];
    }

    /** 地图本地坐标 → 模型格子 [col, row]；越界返回 null */
    toCell(x: number, y: number): [number, number] | null {
        const v = this.toViewCell(x, y);
        return v ? this.modelCell(v[0], v[1]) : null;
    }

    /** 某一格菱形在屏幕上的上顶点：贴地面图时用它对齐 */
    cellTop(col: number, row: number, out?: IsoPoint): IsoPoint {
        const [vc, vr] = this.viewCell(col, row);
        return this.project(vc, vr, out);
    }

    /**
     * w×h 占地在屏幕上的最下顶点。建筑图的"底边中点"对齐到这里，
     * 所以建筑图宽必须是 (w+h)·半宽（ART_SPEC）。
     */
    footBottom(col: number, row: number, w: number, h: number, out?: IsoPoint): IsoPoint {
        const [vx, vy, vw, vh] = this.viewRect(col, row, w, h);
        return this.project(vx + vw, vy + vh, out);
    }

    /** 占地菱形在屏幕上的四个顶点（上、右、下、左），画预览框用 */
    footprint(col: number, row: number, w: number, h: number): IsoPoint[] {
        const [vx, vy, vw, vh] = this.viewRect(col, row, w, h);
        return [
            this.project(vx, vy),
            this.project(vx + vw, vy),
            this.project(vx + vw, vy + vh),
            this.project(vx, vy + vh),
        ];
    }

    /**
     * 楼图锚点（占地最下顶点）相对占地中心的屏幕偏移。跟手转的时候楼身保持竖直，
     * 整张图跟着占地中心走：位置 = toLocal(中心) + 这个偏移。静止时和 footBottom 完全一致。
     */
    footOffset(w: number, h: number, out: IsoPoint = { x: 0, y: 0 }): IsoPoint {
        const odd = this._rot % 2 === 1;
        const vw = odd ? h : w, vh = odd ? w : h;
        out.x = (vw - vh) / 2 * this.hw;
        out.y = -(vw + vh) / 2 * this.hh;
        return out;
    }

    /**
     * 前后遮挡的排序键：越大越靠前（后画）。
     * 用占地中心在视图里的 vx+vy。对互不重叠的 1×1、2×2 混排是正确的：
     * 一栋建筑若整体在另一栋的右下或左下，它的中心和一定更大。
     */
    depth(col: number, row: number, w: number, h: number): number {
        const [vx, vy] = this.view(col + w / 2, row + h / 2);
        return vx + vy;
    }

    /** 连续点（行人、车）的排序键，和 depth 同一标准 */
    depthAt(gx: number, gy: number): number {
        const [vx, vy] = this.view(gx, gy);
        return vx + vy;
    }
}
