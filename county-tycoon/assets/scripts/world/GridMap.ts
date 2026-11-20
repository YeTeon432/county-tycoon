import { _decorator, Component, Layers, Node, UITransform, SpriteFrame } from 'cc';
import { ArtLibrary, GROUND_GRASS_FRAMES, GROUND_ROAD_BASE } from '../core/ArtLibrary';
import { bridgeName, grassName, neighborMask, RoadKind, roadName, terrainName } from '../core/GroundFrames';
import { Facing, PlacedBuilding, TownModel } from '../core/TownModel';

const { ccclass } = _decorator;

export interface GroundQuad {
    frame: SpriteFrame;
    c: number; r: number;
    width: number; length: number;
    turn: number;
}

// 叠层贴图的正向是 +row，转角和建筑门面一致。
const ROAD_EDGES = [
    { facing: 'L', dc: 0, dr: 1, turn: 0 },
    { facing: 'R', dc: 1, dr: 0, turn: 1 },
    { facing: 'UR', dc: 0, dr: -1, turn: 2 },
    { facing: 'UL', dc: -1, dr: 0, turn: 3 },
] as const;
// 开局这几种模型的门偏离院子中线，按模型正面的坐标修正。
const DOOR_OFFSET: Partial<Record<string, number>> = { hut: -0.195, breakfast: 0.24, workshop: -0.16 };

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

    /** 按实际占地铺建筑阴影，再叠混铺接头和沿街小径。 */
    *roadOverlays(): Iterable<GroundQuad> {
        const model = this._model;
        const art = this._art;
        if (!model || !art) return;
        const buildings = model.allBuildings();
        const shadow = art.groundByName('lot-shadow');
        if (shadow) for (const b of buildings) {
            if (b.def.flat || b.def.terrain || b.def.id === 'farm') continue;
            const { width, height } = b.def;
            const tree = b.def.id === 'tree';
            yield { frame: shadow, c: b.col + width / 2, r: b.row + height / 2,
                width: tree ? 0.56 : width + 0.34, length: tree ? 0.56 : height + 0.34, turn: 0 };
        }
        const apron = art.groundByName('asphalt-apron');
        const earth = art.groundByName('entrance-earth');
        const paving = art.groundByName('entrance-paving');
        for (const b of buildings) {
            if (b.def.road === 'dirt' && apron) {
                for (const { dc, dr, turn } of ROAD_EDGES) {
                    if (this.roadKind(b.col + dc, b.row + dr) === 'city') {
                        yield { frame: apron, c: b.col + 0.5, r: b.row + 0.5, width: 1, length: 1, turn };
                    }
                }
            }
            if (b.def.flat || b.def.id === 'tree' || b.def.id === 'farm' || (b.def.terrain && b.def.id !== 'mine') || !b.facing) continue;
            const frame = b.def.id === 'hut' || b.def.id === 'mine' ? earth : paving;
            const entrance = frame && this.entranceOverlay(b, b.facing, frame);
            if (entrance) yield entrance;
        }
    }

    private entranceOverlay(b: PlacedBuilding, facing: Facing, frame: SpriteFrame): GroundQuad | null {
        const edge = ROAD_EDGES.find((side) => side.facing === facing);
        if (!edge) return null;
        const { dc, dr, turn } = edge;
        const start = dc ? b.row : b.col;
        const span = dc ? b.def.height : b.def.width;
        const boundary = dc ? b.col + (dc > 0 ? b.def.width : 0)
            : b.row + (dr > 0 ? b.def.height : 0);
        const street = boundary - (dc + dr < 0 ? 1 : 0);
        const isDirt = (along: number) => (dc ? this.roadKind(street, along) : this.roadKind(along, street)) === 'dirt';
        const door = start + span / 2 + (DOOR_OFFSET[b.def.id] ?? 0) * (dr || -dc);
        const width = span === 1 ? 0.43 : 0.72;
        let along = Infinity;
        for (let i = start; i < start + span; i++) {
            if (!isDirt(i)) continue;
            const min = i + (isDirt(i - 1) ? 0 : width / 2);
            const max = i + 1 - (isDirt(i + 1) ? 0 : width / 2);
            const candidate = Math.max(min, Math.min(max, door));
            if (Math.abs(candidate - door) < Math.abs(along - door)) along = candidate;
        }
        if (!Number.isFinite(along)) return null;
        // 跨过地块边一小截，碰到土坯房向内缩的院子底座。
        const across = boundary + 0.22 * (dc + dr);
        return { frame, c: dc ? across : along, r: dc ? along : across, width, length: 0.56, turn: (turn + 2) % 4 };
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
            const mask = neighborMask((c, r) => this.roadKind(c, r) !== null, col, row);
            return art.groundByName(roadName(kind, mask)) ?? art.ground(GROUND_ROAD_BASE[kind] + mask);
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
        // 山体网格在山脚收回草地，避免低处露出方形石板。
        if (t === 'mountain') return art.groundByName(grassName(col, row));
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

    private roadKind(col: number, row: number): RoadKind | null {
        return this._model?.getAt(col, row)?.def.road ?? null;
    }
}
