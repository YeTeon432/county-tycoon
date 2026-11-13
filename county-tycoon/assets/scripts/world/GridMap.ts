import {
    _decorator, Component, Graphics, Layers, Node, UITransform, Color, Sprite, Vec2, SpriteFrame,
} from 'cc';
import { ArtLibrary, GROUND_GRASS_FRAMES, GROUND_ROAD_BASE } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { TownModel } from '../core/TownModel';
import { WorldConfig } from '../core/WorldConfig';

const { ccclass } = _decorator;

/**
 * 地面层：等距菱形地块 + 贴地的东西（马路）（D014）。
 *
 * 有地面图集时每格一个 Sprite，全部来自同一张纹理，引擎会合成一次绘制；
 * 图集没加载到时用 Graphics 画纯色菱形顶上。
 *
 * 马路按四邻自动选图（mask 的位和 docs/art/gen/sample.py 一致）：
 *   1 = 左上邻 (col-1)   2 = 右上邻 (row-1)   4 = 右下邻 (col+1)   8 = 左下邻 (row+1)
 */
@ccclass('GridMap')
export class GridMap extends Component {
    private _config: WorldConfig | null = null;
    private _iso: IsoMath | null = null;
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;

    private _fallback: Graphics | null = null;
    private _tileRoot: Node | null = null;
    /** 下标 = row * cols + col */
    private _tiles: Sprite[] = [];

    static create(config: WorldConfig, iso: IsoMath, model: TownModel, art: ArtLibrary): Node {
        const node = new Node('GridMap');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        node.addComponent(GridMap).build(config, iso, model, art);
        return node;
    }

    get mapWidth(): number {
        return this._iso ? this._iso.mapWidth : 0;
    }

    get mapHeight(): number {
        return this._iso ? this._iso.mapHeight : 0;
    }

    build(config: WorldConfig, iso: IsoMath, model: TownModel, art: ArtLibrary): void {
        this._config = config;
        this._iso = iso;
        this._model = model;
        this._art = art;
        this._fallback = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.redraw();
    }

    /** 地块或马路有变化时调用 */
    redraw(): void {
        const art = this._art;
        if (art && art.groundFrameCount >= GROUND_ROAD_BASE + 16) {
            if (this._fallback) this._fallback.clear();
            this.syncSprites(art);
        } else {
            this.drawFallback();
        }
    }

    /** 这一格该用哪一帧 */
    private frameIndex(col: number, row: number): number {
        if (this.isRoad(col, row)) {
            const mask = (this.isRoad(col - 1, row) ? 1 : 0)
                | (this.isRoad(col, row - 1) ? 2 : 0)
                | (this.isRoad(col + 1, row) ? 4 : 0)
                | (this.isRoad(col, row + 1) ? 8 : 0);
            return GROUND_ROAD_BASE + mask;
        }
        // 草地变体按坐标哈希取，保证同一格每次都一样；第 0 帧最常见，带花的最少
        const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
        const r = h % 10;
        return r < 4 ? 0 : (r < 6 ? 1 : (r < 8 ? 2 : GROUND_GRASS_FRAMES - 1));
    }

    private isRoad(col: number, row: number): boolean {
        const b = this._model ? this._model.getAt(col, row) : null;
        return !!b && b.def.flat;
    }

    private syncSprites(art: ArtLibrary): void {
        const iso = this._iso!;
        if (!this._tileRoot) {
            this._tileRoot = new Node('Tiles');
            this._tileRoot.layer = Layers.Enum.UI_2D;
            this._tileRoot.addComponent(UITransform);
            this.node.addChild(this._tileRoot);
            const p = { x: 0, y: 0 };
            for (let row = 0; row < iso.rows; row++) {
                for (let col = 0; col < iso.cols; col++) {
                    const n = new Node();
                    n.layer = Layers.Enum.UI_2D;
                    const ui = n.addComponent(UITransform);
                    ui.setAnchorPoint(new Vec2(0.5, 1));
                    ui.setContentSize(iso.hw * 2, iso.hh * 2);
                    iso.cellTop(col, row, p);
                    n.setPosition(p.x, p.y, 0);
                    const s = n.addComponent(Sprite);
                    s.sizeMode = Sprite.SizeMode.CUSTOM;
                    s.trim = false;
                    this._tileRoot.addChild(n);
                    this._tiles.push(s);
                }
            }
        }
        for (let row = 0; row < iso.rows; row++) {
            for (let col = 0; col < iso.cols; col++) {
                const s = this._tiles[row * iso.cols + col];
                const f: SpriteFrame | null = art.ground(this.frameIndex(col, row));
                if (s.spriteFrame !== f) s.spriteFrame = f;
            }
        }
    }

    /** 没有图集：纯色菱形 + 网格线 + 马路深色格 */
    private drawFallback(): void {
        const g = this._fallback;
        const iso = this._iso;
        const config = this._config;
        if (!g || !iso || !config) return;
        g.clear();

        const poly = (pts: { x: number; y: number }[]) => {
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.close();
        };

        g.fillColor = new Color().fromHEX(config.palette.ground);
        poly(iso.footprint(0, 0, iso.cols, iso.rows));
        g.fill();

        g.fillColor = new Color().fromHEX('#313638');
        for (let row = 0; row < iso.rows; row++) {
            for (let col = 0; col < iso.cols; col++) {
                if (this.isRoad(col, row)) poly(iso.footprint(col, row, 1, 1));
            }
        }
        g.fill();

        g.lineWidth = 1;
        g.strokeColor = new Color().fromHEX(config.palette.gridLine);
        for (let i = 0; i <= iso.cols; i++) {
            const a = iso.toLocal(i, 0), b = iso.toLocal(i, iso.rows);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        }
        for (let j = 0; j <= iso.rows; j++) {
            const a = iso.toLocal(0, j), b = iso.toLocal(iso.cols, j);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        }
        g.stroke();
    }
}
