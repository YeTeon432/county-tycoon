import { BuildingEcon, BuildingSim, Demand, JobSlot, Resident } from './types';

/**
 * 模拟层内部用的一层「世界索引」：把 state 里的数组换成按用途分好的 Map / 列表。
 *
 * 每个月重建一次，几千人也只是几毫秒；好处是所有结算函数都拿到同一份一致的视图，
 * 不用在结算途中反复 find()，也不会因为月内改动而看到半新半旧的数据。
 */
export interface World {
    residentsById: Map<number, Resident>;
    buildingByUid: Map<number, BuildingSim>;
    econOf: (uid: number) => BuildingEcon | null;
    /** 能住人的（housing > 0） */
    homes: BuildingSim[];
    /** 满足某类消费的店铺（demand != null） */
    shops: BuildingSim[];
    /** 生产类：有岗位、不产出消费、财政不发工资（工厂 / 矿场 / 港口 / 银行） */
    producers: BuildingSim[];
    /** 岗位工资由财政发的公共建筑 */
    publics: BuildingSim[];
    /** 有需求编号的店铺，按 demand 分好 */
    shopsByDemand: Map<Demand, BuildingSim[]>;
}

/** 把一栋楼的岗位展开成一个个具体的位置，学历低的排前面（谁都能先上，高学历岗位才留得住位置） */
export function flatSlots(econ: BuildingEcon): JobSlot[] {
    const out: JobSlot[] = [];
    for (const slot of econ.jobs) {
        for (let i = 0; i < slot.count; i++) out.push(slot);
    }
    out.sort((a, b) => a.edu - b.edu);
    return out;
}

export function isHousing(econ: BuildingEcon | null): boolean {
    return !!econ && econ.housing > 0;
}

export function isShop(econ: BuildingEcon | null): boolean {
    return !!econ && econ.demand !== null && econ.capacity > 0;
}

export function isPublic(econ: BuildingEcon | null): boolean {
    return !!econ && econ.publicJob;
}

export function isProducer(econ: BuildingEcon | null): boolean {
    return !!econ && !econ.publicJob && econ.demand === null && econ.jobs.length > 0;
}

export function buildWorld(
    residents: Resident[],
    buildings: BuildingSim[],
    econOf: (uid: number) => BuildingEcon | null,
): World {
    const residentsById = new Map<number, Resident>();
    for (const r of residents) residentsById.set(r.id, r);
    const buildingByUid = new Map<number, BuildingSim>();
    for (const b of buildings) buildingByUid.set(b.uid, b);

    const homes: BuildingSim[] = [];
    const shops: BuildingSim[] = [];
    const producers: BuildingSim[] = [];
    const publics: BuildingSim[] = [];
    const shopsByDemand = new Map<Demand, BuildingSim[]>();

    for (const b of buildings) {
        const econ = econOf(b.uid);
        if (!econ) continue;
        if (econ.housing > 0) homes.push(b);
        if (econ.demand !== null && econ.capacity > 0) {
            shops.push(b);
            const list = shopsByDemand.get(econ.demand);
            if (list) list.push(b);
            else shopsByDemand.set(econ.demand, [b]);
        }
        if (isProducer(econ)) producers.push(b);
        if (econ.publicJob) publics.push(b);
    }

    return { residentsById, buildingByUid, econOf, homes, shops, producers, publics, shopsByDemand };
}
