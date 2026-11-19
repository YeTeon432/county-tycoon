import { _decorator, Component, Layers, Node, UITransform, SpriteFrame } from 'cc';
import { ArtLibrary, GROUND_GRASS_FRAMES, GROUND_ROAD_BASE } from '../core/ArtLibrary';
import { bridgeName, grassName, neighborMask, roadName, terrainName } from '../core/GroundFrames';
import { TownModel } from '../core/TownModel';

const { ccclass } = _decorator;

/**
 * 地面每格用哪一帧（D014 / T322）：道路（土路 / 城市道路）、装饰地块、地形（河、桥、山、矿、树林……）、草地。
 * 画由 World3D 做（D033：一整张 3D 地面网格，每格贴图集里这一帧的菱形），这里只管取帧。
 * T540h 起 2D 瓦片和没有图集时的纯色菱形都去掉了。
 *
 * 取帧方式有两套：
 *   - **按名字**（有 ground-frames.json 时，优先）：地形和道路都按名字取，
 *     美术加帧、调顺序都不用改代码。名字约定见 docs/PARALLEL.md 支线 C。
 *   - 按帧号（老路径，没有 ground-frames.json 时）：只有草地和道路，认 0~35。
 *
 * mask 的位（和 docs/art/gen/terrain.py 一致），按模型坐标数：
 *   1 = 左上邻 (col-1)   2 = 右上邻 (row-1)   4 = 右下邻 (col+1)   8 = 左下邻 (row+1)
 *   道路：这些位是"四邻是道路"
 *   水：  这些位是"四邻是陆地"（有岸的那几条边）
 */
@ccclass('GridMap')
export class GridMap extends Component {
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;

    static create(model: TownModel, art: ArtLibrary): GridMap {
        const node = new Node('GridMap');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const g = node.addComponent(GridMap);
        g._model = model;
        g._art = art;
        return g;
    }

    /** 这一格的地面帧 */
    modelFrame(col: number, row: number): SpriteFrame | null {
        return this.frameFor(col, row);
    }

    private get _terrain() {
        return this._model ? this._model.terrain : null;
    }

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

    /** 四邻 mask 按模型坐标数（3D 地面不跟视角换图，转视角由相机做） */
    private viewMask(test: (c: number, r: number) => boolean, col: number, row: number): number {
        return neighborMask(test, col, row);
    }

    /** 桥面方向同理，按模型坐标 */
    private viewBridge(col: number, row: number): string {
        return bridgeName((c, r) => this.isBridgeable(c, r), col, row);
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
}
