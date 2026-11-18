import {
    _decorator, Component, Graphics, Layers, Node, UITransform, Color, Sprite, Vec2, SpriteFrame,
} from 'cc';
import {
    ArtLibrary, GROUND_FRAME_COUNT, GROUND_FRAME_COUNT_TERRAIN, GROUND_GRASS_FRAMES, GROUND_ROAD_BASE,
} from '../core/ArtLibrary';
import { bridgeName, grassName, neighborMask, roadName, terrainName } from '../core/GroundFrames';
import { IsoMath } from '../core/IsoMath';
import { TownModel } from '../core/TownModel';
import { WorldConfig } from '../core/WorldConfig';

const { ccclass } = _decorator;

/**
 * 地面层：等距菱形地块 + 贴地的东西（道路：土路 / 城市道路）+ 地形（T322）（D014）。
 *
 * 有地面图集时每格一个 Sprite，全部来自同一张纹理，引擎会合成一次绘制；
 * 图集没加载到时用 Graphics 画纯色菱形顶上。
 *
 * 取帧方式有两套：
 *   - **按名字**（有 ground-frames.json 时，优先）：地形和道路都按名字取，
 *     美术加帧、调顺序都不用改代码。名字约定见 docs/PARALLEL.md 支线 C。
 *   - 按帧号（老路径，没有 ground-frames.json 时）：只有草地和道路，认 0~35。
 *
 * mask 的位（和 docs/art/gen/terrain.py 一致）：
 *   1 = 左上邻 (col-1)   2 = 右上邻 (row-1)   4 = 右下邻 (col+1)   8 = 左下邻 (row+1)
 *   道路：这些位是"四邻是道路"
 *   水：  这些位是"四邻是陆地"（有岸的那几条边）
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
        // 有地形时图集是 66 帧；没有地形帧的旧图集只要 36 帧就够画草地和道路
        const need = this._terrain ? GROUND_FRAME_COUNT_TERRAIN : GROUND_FRAME_COUNT;
        if (art && art.groundFrameCount >= need) {
            if (this._fallback) this._fallback.clear();
            this.syncSprites(art);
        } else {
            this.drawFallback();
        }
    }

    private get _terrain() {
        return this._model ? this._model.terrain : null;
    }

    /**
     * 这一格该用哪一帧。按名字取（T322）；没有 ground-frames.json 时退回帧号。
     * 返回 null 表示查不到，调用方保持原样。
     */
    private frameFor(col: number, row: number): SpriteFrame | null {
        const art = this._art;
        if (!art) return null;

        // 道路优先：道路是玩家放的建筑，盖在地形上面
        const kind = this.roadKind(col, row);
        if (kind) {
            const name = roadName(kind, this.viewMask((c, r) => this.isRoad(c, r), col, row));
            if (art.hasGroundNames) {
                return art.groundByName(name) ?? art.ground(GROUND_ROAD_BASE[kind] + this.roadMask(col, row));
            }
            return art.ground(GROUND_ROAD_BASE[kind] + this.roadMask(col, row));
        }

        // 装饰地块：flat 且有 decoFrame 名字（T218）
        const deco = this.decoFrame(col, row);
        if (deco) return art.groundByName(deco) ?? art.ground(0);

        // 地形
        const terrain = this._terrain;
        if (terrain && art.hasGroundNames) {
            const f = this.terrainFrame(art, col, row);
            if (f) return f;
        }

        // 草地变体按坐标哈希取，保证同一格每次都一样；第 0 帧最常见，带花的最少
        return art.ground(this.grassVariant(col, row));
    }

    /** flat 装饰地块的帧名（T218）：dirt-tile / flagstone / flower-bed */
    private static readonly DECO_FRAMES: Record<string, string> = {
        'dirt-tile': 'dirt-tile',
        'flagstone': 'flagstone',
        'flower-bed': 'flower-bed',
    };

    private decoFrame(col: number, row: number): string | null {
        const b = this._model ? this._model.getAt(col, row) : null;
        if (!b || !b.def.flat || b.def.road) return null;
        return GridMap.DECO_FRAMES[b.def.id] ?? null;
    }

    /** 地形格 → 帧。桥面也在这里，因为桥没有对应的建筑图 */
    private terrainFrame(art: ArtLibrary, col: number, row: number): SpriteFrame | null {
        const terrain = this._terrain;
        if (!terrain) return null;

        // 桥（玩家放的建筑）压在地面上：这格画桥面，不画水
        const here = this._model ? this._model.getAt(col, row) : null;
        if (here && here.def.id === 'bridge') {
            return art.groundByName(this.viewBridge(col, row));
        }

        const t = terrain.typeAt(col, row);
        if (t === 'river') {
            // 水的 mask：位 = 四邻是陆地，有岸的那几条边
            const name = `water-${this.viewMask((c, r) => !this.isWater(c, r), col, row)}`;
            return art.groundByName(name) ?? art.groundByName('water-0');
        }
        if (t === 'bridge') {
            // map.json 里手工画的桥位（还没放桥建筑）
            return art.groundByName(this.viewBridge(col, row))
                ?? art.groundByName('water-0');
        }
        return art.groundByName(terrainName(t, col, row));
    }

    /**
     * 桥面朝哪个方向 —— 逻辑在 GroundFrames.bridgeName 里，
     * 这边只提供"桥能延伸到哪"的判定，方便在 node 下单独测帧名。
     */
    private isBridgeable(col: number, row: number): boolean {
        const t = this._terrain;
        if (!t) return false;
        const type = t.typeAt(col, row);
        return type === 'river' || type === 'bridge';
    }

    private roadMask(col: number, row: number): number {
        return this.viewMask((c, r) => this.isRoad(c, r), col, row);
    }

    /**
     * 四邻 mask 的位是**屏幕方向**（1 左上 / 2 右上 / 4 右下 / 8 左下），所以要在视图格子里数邻居（D031）：
     * 模型格 → 视图格，在视图里取四邻，再换回模型格去判断。
     */
    private viewMask(test: (c: number, r: number) => boolean, col: number, row: number): number {
        const iso = this._iso;
        if (!iso) return neighborMask(test, col, row);
        const [vc, vr] = iso.viewCell(col, row);
        return neighborMask((x, y) => { const m = iso.modelCell(x, y); return test(m[0], m[1]); }, vc, vr);
    }

    /** 桥面方向同理：gx / gy 指的是屏幕上的走向，在视图格子里判断 */
    private viewBridge(col: number, row: number): string {
        const iso = this._iso;
        const same = (c: number, r: number) => this.isBridgeable(c, r);
        if (!iso) return bridgeName(same, col, row);
        const [vc, vr] = iso.viewCell(col, row);
        return bridgeName((x, y) => { const m = iso.modelCell(x, y); return same(m[0], m[1]); }, vc, vr);
    }

    private isWater(col: number, row: number): boolean {
        const t = this._terrain;
        if (!t) return false;
        const type = t.typeAt(col, row);
        return type === 'river' || type === 'pond';
    }

    /** 草地：0 最常见，带花的最少（取法和 GroundFrames.grassName 一致，这里只要帧号） */
    private grassVariant(col: number, row: number): number {
        return Number(grassName(col, row, GROUND_GRASS_FRAMES).split('-')[1]);
    }

    private roadKind(col: number, row: number): 'city' | 'dirt' | null {
        const b = this._model ? this._model.getAt(col, row) : null;
        if (!b || !b.def.flat) return null;
        return b.def.road ?? 'city';
    }

    private isRoad(col: number, row: number): boolean {
        return this.roadKind(col, row) !== null;
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
                    // 瓦片固定在「视图格子」上，转视角时不挪，换成转过来的那一格的图（D031）
                    iso.project(col, row, p);
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
                const [mc, mr] = iso.modelCell(col, row);
                const f: SpriteFrame | null = this.frameFor(mc, mr);
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

        // 地形占位色（没有图集时至少能看出河、山、矿在哪）。颜色取自固定调色板。
        this.drawTerrainFallback(g, poly, iso);

        // 道路用各自配置里的占位色（土路土黄、城市道路深灰）
        for (let row = 0; row < iso.rows; row++) {
            for (let col = 0; col < iso.cols; col++) {
                if (!this.isRoad(col, row)) continue;
                g.fillColor = new Color().fromHEX(this._model!.getAt(col, row)!.def.color);
                poly(iso.footprint(col, row, 1, 1));
                g.fill();
            }
        }

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

    /**
     * 地形占位色。没有地面图集时，至少能看出哪是河、哪是山、哪是矿。
     * 颜色取自 48 色调色板（D014），和美术那边的取色习惯一致。
     */
    private drawTerrainFallback(g: Graphics, poly: (pts: { x: number; y: number }[]) => void,
        iso: IsoMath): void {
        const terrain = this._terrain;
        if (!terrain) return;

        const COLOR: Record<string, string | null> = {
            river: '#4d9be6',
            pond: '#4d9be6',
            mountain: '#7a7086',
            ore: '#5a5a6e',
            forest: '#2f7d3a',
            bridge: '#b4b4c4',
        };

        for (let row = 0; row < iso.rows; row++) {
            for (let col = 0; col < iso.cols; col++) {
                const hex = COLOR[terrain.typeAt(col, row)];
                if (!hex) continue;                       // 草地不画，底下已经是地面色
                // 桥建筑压在地面上：画桥面而不是水
                const here = this._model ? this._model.getAt(col, row) : null;
                if (here && here.def.id === 'bridge') continue;
                g.fillColor = new Color().fromHEX(hex);
                poly(iso.footprint(col, row, 1, 1));
                g.fill();
            }
        }
    }
}
