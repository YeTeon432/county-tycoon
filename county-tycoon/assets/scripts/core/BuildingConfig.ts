import type { TownLevel } from './sim/types';
import { JsonAsset, resources } from 'cc';

/**
 * 建筑定义。
 *
 * 名字、类别、占格尺寸、占位色全部来自 assets/resources/config/buildings.json，
 * 代码里只留一份最小的兜底表（json 读不到时也能玩）。
 * 尺寸单位是"地块"，1×1 表示占一格，2×2 表示占四格（和 PRD 第 5 节一致）。
 */
export interface BuildingDef {
    id: string;
    name: string;
    category: string;
    purpose?: string;
    estateName?: string;
    width: number;
    height: number;
    /** 占位色：没有贴图时画色块用 */
    color: string;
    /** 贴地的东西（道路）：画进地面层、按四邻自动拼接，不参与前后遮挡排序（D014） */
    flat: boolean;
    /** 道路种类：土路 / 城市道路。两种都算"道路"，互相连通（PRD 第 5 节）；非道路为 null */
    road: RoadKind | null;
    /** 城镇等级到几级解锁（0 = 村口，2 = 县城，见 PRD 第 7 节）。等级系统做好之前只记录不生效 */
    unlockLevel: number;
    /** 地形要求（T321）：桥要在河上、港口贴河、矿场在矿点；其他为 null */
    terrain?: 'river' | 'riverbank' | 'ore' | null;
}

/** 发展中心始终是同一个建筑；城镇等级只决定模型与缩略图。 */
export function centerArtId(level: TownLevel): string {
    if (level === 'village') return 'center';
    if (level === 'town') return 'center-town';
    return 'center-county';
}

export type RoadKind = 'dirt' | 'city';

/** 可通行的铺装道路和已建桥面；装饰地块也贴地，但不接入路网。 */
export function travelSurface(def?: BuildingDef): RoadKind | 'bridge' | null {
    return def?.id === 'bridge' ? 'bridge' : def?.road ?? null;
}

interface BuildingConfigJson {
    buildings: BuildingDef[];
}

/** 兜底：只留三种，够验证逻辑，缺字段时也有东西可放 */
export const DEFAULT_BUILDINGS: BuildingDef[] = [
    { id: 'house', name: '自建房', category: '住宅', width: 1, height: 1, color: '#966c6c', flat: false, road: null, unlockLevel: 0 },
    { id: 'milk-tea', name: '奶茶店', category: '店铺', width: 1, height: 1, color: '#eaaded', flat: false, road: null, unlockLevel: 0 },
    { id: 'dirt-road', name: '土路', category: '设施', width: 1, height: 1, color: '#b98a6a', flat: true, road: 'dirt', unlockLevel: 0 },
];

/** 校验一条定义，防止配置写错（比如宽高为 0、id 重复）把逻辑搞坏 */
function sanitize(def: BuildingDef, index: number): BuildingDef | null {
    if (!def || typeof def.id !== 'string' || def.id.length === 0) {
        console.warn(`[BuildingConfig] 第 ${index} 条缺少 id，跳过`);
        return null;
    }
    return {
        id: def.id,
        name: typeof def.name === 'string' && def.name ? def.name : def.id,
        category: typeof def.category === 'string' ? def.category : '其他',
        purpose: typeof def.purpose === 'string' ? def.purpose : undefined,
        estateName: typeof def.estateName === 'string' ? def.estateName : undefined,
        width: Math.max(1, Math.floor(def.width || 1)),
        height: Math.max(1, Math.floor(def.height || 1)),
        color: typeof def.color === 'string' && def.color ? def.color : '#966c6c',
        flat: def.flat === true,
        road: def.road === 'dirt' || def.road === 'city' ? def.road : null,
        unlockLevel: typeof def.unlockLevel === 'number' ? Math.max(0, Math.floor(def.unlockLevel)) : 0,
        terrain: def.terrain === 'river' || def.terrain === 'riverbank' || def.terrain === 'ore' ? def.terrain : null,
    };
}

/** 读取建筑配置；失败时回退到内置兜底表 */
export function loadBuildingConfig(): Promise<BuildingDef[]> {
    return new Promise((resolve) => {
        resources.load('config/buildings', JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) {
                console.warn('[BuildingConfig] 没读到 config/buildings.json，先用内置兜底表', err);
                resolve(DEFAULT_BUILDINGS);
                return;
            }
            const json = asset.json as BuildingConfigJson;
            const list = Array.isArray(json.buildings) ? json.buildings : [];
            const cleaned: BuildingDef[] = [];
            const seen = new Set<string>();
            for (let i = 0; i < list.length; i++) {
                const def = sanitize(list[i], i);
                if (!def) continue;
                if (seen.has(def.id)) {
                    console.warn(`[BuildingConfig] id 重复：${def.id}，跳过`);
                    continue;
                }
                seen.add(def.id);
                cleaned.push(def);
            }
            resolve(cleaned.length > 0 ? cleaned : DEFAULT_BUILDINGS);
        });
    });
}
