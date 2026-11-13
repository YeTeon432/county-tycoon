import { JsonAsset, resources } from 'cc';
import { Terrain, TerrainMapJson } from './Terrain';

/**
 * 读 map.json，建出 Terrain（T321）。
 *
 * 拆成独立文件的原因：Terrain.ts 要能在 node 下跑（模拟层不 import 'cc'），
 * 而 resources.load 只能在引擎里用。所以职责是——
 *   Terrain.ts       纯数据 + 放置规则
 *   TerrainConfig.ts 把 json 读进来，交给 Terrain.fromJson()
 */
export function loadTerrain(fallbackWidth: number, fallbackHeight: number): Promise<Terrain> {
    return new Promise((resolve) => {
        resources.load('config/map', JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) {
                console.warn('[TerrainConfig] 没读到 config/map.json，先用全草地', err);
                resolve(Terrain.allGrass(fallbackWidth, fallbackHeight));
                return;
            }
            try {
                resolve(Terrain.fromJson(asset.json as TerrainMapJson));
            } catch (e) {
                console.error('[TerrainConfig] map.json 解析失败，用全草地', e);
                resolve(Terrain.allGrass(fallbackWidth, fallbackHeight));
            }
        });
    });
}
