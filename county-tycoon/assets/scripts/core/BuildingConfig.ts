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
    width: number;
    height: number;
    /** 占位色。等 M4 美术到位后换成贴图，这个字段就只剩调试用 */
    color: string;
}

interface BuildingConfigJson {
    buildings: BuildingDef[];
}

/** 兜底：只留三种，够验证逻辑，缺字段时也有东西可放 */
export const DEFAULT_BUILDINGS: BuildingDef[] = [
    { id: 'house', name: '自建房', category: '住宅', width: 1, height: 1, color: '#966c6c' },
    { id: 'milk-tea', name: '奶茶店', category: '店铺', width: 1, height: 1, color: '#eaaded' },
    { id: 'road', name: '马路', category: '设施', width: 1, height: 1, color: '#313638' },
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
        width: Math.max(1, Math.floor(def.width || 1)),
        height: Math.max(1, Math.floor(def.height || 1)),
        color: typeof def.color === 'string' && def.color ? def.color : '#966c6c',
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
