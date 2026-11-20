/**
 * 地形数据（T321）。
 *
 * 一张手工设计的 64×64 地图，数据在 assets/resources/config/map.json。
 * 这个文件**不 import 'cc'**：模拟层要在 node 下直接跑测试，
 * 而"这格是河、那格是山"本来就是纯数据，没必要跟引擎绑在一起。
 * 负责读 json 的是 TerrainConfig.ts（那一份才 import cc）。
 *
 * 坐标约定和 TownModel 一致：col 从 0 从左往右，row 从 0 从下往上。
 * map.json 的 tiles[0] 是**最下面一行**，也就是 row 0。
 *
 * 放置规则（PARALLEL.md 支线 D / DESIGN 第 7 节）：
 *   - 河：不能盖；桥只能盖在河上；港口要挨着河（盖在岸上）
 *   - 山：不能盖
 *   - 矿点：只有矿场能盖
 *   - 树林：可以盖（砍了会使环境下降，那是模拟层的事，这里只回答"能不能放"）
 */
import { BuildingDef } from './BuildingConfig';

/** 地块类型。字符到类型的映射见 map.json 的 legend */
export type TerrainType = 'grass' | 'river' | 'mountain' | 'ore' | 'forest' | 'pond' | 'bridge';

/** 建筑对地形的额外要求，等价于 buildings.json 里的 `terrain` 字段 */
export type TerrainRequirement = 'river' | 'riverbank' | 'ore';

export interface ZoneRect {
    id: string;
    name: string;
    /** [col, row, width, height] */
    rect: [number, number, number, number];
    /** 城镇等级到几级解锁（0 = 开局可用）。等级系统做好之前先只用来看 */
    unlock: number;
}

export interface TerrainMapJson {
    width: number;
    height: number;
    legend: Record<string, string>;
    spawn?: { col: number; row: number };
    zones?: ZoneRect[];
    /** tiles[0] = 最下面一行 */
    tiles: string[];
}

/** 字符 → 类型。map.json 里写错一个字符，这里按草地处理并 warn，不让整张图读不出来 */
const CHAR_TYPE: Record<string, TerrainType> = {
    '.': 'grass',
    '~': 'river',
    '^': 'mountain',
    'O': 'ore',
    'T': 'forest',
    'o': 'pond',
    '=': 'bridge',
};

export class Terrain {
    readonly width: number;
    readonly height: number;
    spawn: { col: number; row: number };
    zones: ZoneRect[];

    /** 下标 = row * width + col */
    private readonly _types: TerrainType[];
    /** 地形有变时加一，渲染层据此判断要不要重画 */
    private _revision = 0;

    constructor(width: number, height: number, types?: TerrainType[]) {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this._types = types && types.length === this.width * this.height
            ? types.slice()
            : new Array(this.width * this.height).fill('grass');
        this.spawn = { col: Math.floor(this.width / 4), row: Math.floor(this.height / 4) };
        this.zones = [];
    }

    /** 地形改动计数，渲染层用它判断要不要重画 */
    get revision(): number {
        return this._revision;
    }

    /** 从 map.json 的结构建一张地形。任何异常都退回全草地，不让游戏起不来 */
    static fromJson(json: TerrainMapJson): Terrain {
        const width = Math.max(1, Math.floor(Number(json.width) || 64));
        const height = Math.max(1, Math.floor(Number(json.height) || 64));
        const types: TerrainType[] = new Array(width * height).fill('grass');

        const tiles = Array.isArray(json.tiles) ? json.tiles : [];
        if (tiles.length !== height) {
            console.warn(`[Terrain] map.json 行数 ${tiles.length} 与 height ${height} 不符，缺的行按草地`);
        }

        const legend = json.legend ?? {};
        let unknown = 0;
        for (let row = 0; row < height; row++) {
            const line = tiles[row];
            if (typeof line !== 'string') continue;
            if (line.length !== width) {
                console.warn(`[Terrain] 第 ${row} 行长度 ${line.length} 与 width ${width} 不符`);
            }
            for (let col = 0; col < width; col++) {
                const ch = line.charAt(col);
                if (!ch) continue;                       // 短行剩下的按草地
                const t = CHAR_TYPE[ch] ?? (legend[ch] as TerrainType | undefined);
                if (t && CHAR_TYPE[Object.keys(CHAR_TYPE).find((k) => CHAR_TYPE[k] === t) ?? ''] !== undefined) {
                    types[row * width + col] = t;
                } else {
                    unknown++;
                    types[row * width + col] = 'grass';
                }
            }
        }
        if (unknown > 0) console.warn(`[Terrain] map.json 里有 ${unknown} 个不认识的字符，按草地处理`);

        const terrain = new Terrain(width, height, types);
        if (json.spawn && Number.isFinite(json.spawn.col) && Number.isFinite(json.spawn.row)) {
            terrain.spawn.col = Math.max(0, Math.min(width - 1, Math.floor(json.spawn.col)));
            terrain.spawn.row = Math.max(0, Math.min(height - 1, Math.floor(json.spawn.row)));
        }
        if (Array.isArray(json.zones)) {
            terrain.zones = json.zones.filter((z) => z && Array.isArray(z.rect) && z.rect.length === 4);
        }
        return terrain;
    }

    /** 全草地的兜底地形（json 读不到时用） */
    static allGrass(width: number, height: number): Terrain {
        return new Terrain(width, height);
    }

    inBounds(col: number, row: number): boolean {
        return col >= 0 && row >= 0 && col < this.width && row < this.height;
    }

    /** 某格的地形；越界返回 'mountain'（当作不能盖，免得边界外被误判成草地） */
    typeAt(col: number, row: number): TerrainType {
        if (!this.inBounds(col, row)) return 'mountain';
        return this._types[row * this.width + col];
    }

    /** 直接改一格地形（以后"砍树""开荒"用） */
    setTypeAt(col: number, row: number, type: TerrainType): boolean {
        if (!this.inBounds(col, row)) return false;
        const i = row * this.width + col;
        if (this._types[i] === type) return false;
        this._types[i] = type;
        this._revision++;
        return true;
    }

    /** 这格是不是水（河或池塘）。放桥、判定港口靠水都用它 */
    isWater(col: number, row: number): boolean {
        const t = this.typeAt(col, row);
        return t === 'river' || t === 'pond';
    }

    /** 四邻里有没有水（河或池塘） */
    touchesWater(col: number, row: number): boolean {
        return this.isWater(col - 1, row) || this.isWater(col + 1, row)
            || this.isWater(col, row - 1) || this.isWater(col, row + 1);
    }

    /**
     * 四邻里有没有**河**（池塘不算）。
     * 港口认的是这个：池塘是景观，不是航道，靠池塘不该能建港口。
     */
    touchesRiver(col: number, row: number): boolean {
        return this.typeAt(col - 1, row) === 'river' || this.typeAt(col + 1, row) === 'river'
            || this.typeAt(col, row - 1) === 'river' || this.typeAt(col, row + 1) === 'river';
    }

    /** 单格地形是否适合该建筑。港口的临河要求由整块占地另外判断。 */
    canBuildCell(def: BuildingDef, col: number, row: number): boolean {
        if (!this.inBounds(col, row)) return false;
        const type = this.typeAt(col, row);
        switch (terrainRequirementOf(def)) {
            case 'river': return type === 'river';
            case 'ore': return type === 'ore';
            default: return type === 'grass' || type === 'forest' || type === 'bridge';
        }
    }

    /** 某格属于哪个可建区域，不在任何区域里返回 null */
    zoneAt(col: number, row: number): ZoneRect | null {
        for (const z of this.zones) {
            const [c, r, w, h] = z.rect;
            if (col >= c && col < c + w && row >= r && row < r + h) return z;
        }
        return null;
    }

    /**
     * 能不能在这块地上盖这栋建筑（只看地形，不管占格冲突、资金、等级）。
     * 完整判定要连 TownModel.canPlace 一起看，见 canBuildAt()。
     */
    canBuild(def: BuildingDef, col: number, row: number): boolean {
        let meetsRiverRequirement = terrainRequirementOf(def) !== 'riverbank';
        for (let r = row; r < row + def.height; r++) {
            for (let c = col; c < col + def.width; c++) {
                if (!this.canBuildCell(def, c, r)) return false;
                if (!meetsRiverRequirement) meetsRiverRequirement = this.touchesRiver(c, r);
            }
        }
        return meetsRiverRequirement;
    }

    /**
     * 地形 + 占格一起判（不涉及资金和等级，那两样在模拟层）。
     * 传 town 时顺便查格子有没有被占。
     */
    canBuildAt(def: BuildingDef, col: number, row: number, occupied: ((c: number, r: number) => boolean) | null): boolean {
        if (!this.canBuild(def, col, row)) return false;
        if (!occupied) return true;
        for (let r = 0; r < def.height; r++) {
            for (let c = 0; c < def.width; c++) {
                if (occupied(col + c, row + r)) return false;
            }
        }
        return true;
    }

    /** 占格外圈一圈（不含占格本身）有没有满足条件的格子 */
    private borderTouches(def: BuildingDef, col: number, row: number,
        ok: (c: number, r: number) => boolean): boolean {
        // 一条环：上边一行、下边一行、左边一列、右边一列
        for (let c = col - 1; c <= col + def.width; c++) {
            if (ok(c, row - 1) || ok(c, row + def.height)) return true;
        }
        for (let r = row; r < row + def.height; r++) {
            if (ok(col - 1, r) || ok(col + def.width, r)) return true;
        }
        return false;
    }
}

/**
 * 建筑对地形的要求。
 *
 * 现在从两个地方取，顺序是：
 *   1. buildings.json 里的 `terrain` 字段（已经写了，但 BuildingConfig 还没解析出来，
 *      所以这里用宽松读取；集成把字段加进 BuildingDef 后可以改成 def.terrain）
 *   2. 按 id 兜底（桥 / 港口 / 矿场这三个是固定的）
 * 两边都没有就是普通建筑，只能盖在平地 / 树林上。
 */
export function terrainRequirementOf(def: BuildingDef): TerrainRequirement | null {
    const raw = (def as any).terrain;
    if (raw === 'river' || raw === 'riverbank' || raw === 'ore') return raw;
    if (def.id === 'bridge') return 'river';
    if (def.id === 'port') return 'riverbank';
    if (def.id === 'mine') return 'ore';
    return null;
}
