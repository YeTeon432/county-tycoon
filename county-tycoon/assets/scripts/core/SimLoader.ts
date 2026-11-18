import { JsonAsset, resources } from 'cc';
import { makeSimConfig } from './sim/config';
import { Simulation } from './sim/Simulation';
import { SimpleTownView } from './sim/townView';
import { TownModel } from './TownModel';
import { SimState } from './sim/types';

/**
 * 把模拟层接进游戏（集成）：读 economy.json / names.json，用 TownModel 做 TownView。
 * 模拟层本身不碰引擎（PARALLEL.md 支线 A），读文件这一步放在这里。
 */
function loadJson(path: string): Promise<any> {
    return new Promise((resolve) => {
        resources.load(path, JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.warn(`[SimLoader] 没读到 ${path}，用兜底值`, err);
                resolve(null);
                return;
            }
            resolve(asset.json);
        });
    });
}

export function loadSimJson(): Promise<[any, any, any]> {
    return Promise.all([loadJson('config/economy'), loadJson('config/names'), loadJson('config/progress')]);
}

/** state 给了就是读档：接着存档里的居民、财政、随机数往下跑（D022 接上读档） */
export function createSimulation(model: TownModel, economyJson: any, namesJson: any, seed: number, state?: SimState, progressJson: any = null): Simulation {
    const view = new SimpleTownView(model.width, model.height, () =>
        model.allBuildings().map((b) => ({
            uid: b.uid, defId: b.def.id,
            col: b.col, row: b.row, width: b.def.width, height: b.def.height,
            road: b.def.flat,
        })));
    return new Simulation(makeSimConfig(economyJson, namesJson, progressJson), view, state ? { state } : { seed });
}
