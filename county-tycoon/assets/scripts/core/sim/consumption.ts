import { SimConfig } from './config';
import { TownView } from './townView';
import { BuildingEcon, BuildingSim, Demand, Resident } from './types';

/**
 * 每月消费（DESIGN 2.3 第 2 步）。
 *
 * 每个人的钱按四类需求拆开，各自去「在这家店辐射半径以内」的同类店里花（每种店半径不同，economy.json 的 radius）。
 * 距离越近、口碑越好越优先；店满员了（capacity）剩下的钱就存下来，心情扣一点。
 */

export interface ConsumptionCtx {
    cfg: SimConfig;
    town: TownView;
    econOf: (uid: number) => BuildingEcon | null;
    shopsByDemand: Map<Demand, BuildingSim[]>;
    /** 本月每家店已经服务了多少人次 */
    served: Map<number, number>;
    /** 本月每家店的营业额（累加） */
    revenue: Map<number, number>;
    /** 本月每家店在岗人数（服务能力按这个打折） */
    staff: Map<number, number>;
}

export interface ConsumptionResult {
    /** 实际花掉的钱 */
    spent: number;
    /** 有几类需求在附近找不到店 / 排不上队 */
    missed: number;
}

/**
 * 店里的服务能力（人次 / 月）= capacity × 在岗比例。
 * D026 真实账目起没有「老板自己撑门面」的保底：没人上班就不营业（工资也不用发）。
 * 新手期的店靠过路客（outsideShare）和少量店员维持，见 DESIGN 25。
 */
export const OWNER_RUN_MIN = 0;

export function shopCapacity(b: BuildingSim, econ: BuildingEcon, staff: number): number {
    let required = 0;
    for (const slot of econ.jobs) required += slot.count;
    if (required <= 0) return econ.capacity;
    const ratio = Math.max(OWNER_RUN_MIN, Math.min(1, Math.max(0, staff) / required));
    return Math.floor(econ.capacity * ratio);
}

/** 店铺的辐射半径（步行沿路格数）；没配就用全局 serviceRadius */
export function shopRadius(econ: BuildingEcon, cfg: SimConfig): number {
    return econ.radius > 0 ? econ.radius : cfg.economy.serviceRadius;
}

/**
 * 从某栋楼出发，沿道路能走到、且这月还没排满的同类店。
 * 每家店按自己的辐射半径算：距离 ≤ 店的半径 × 这个人的交通倍率（步行 1，DESIGN 11.2）。
 */
export function reachableShops(
    ctx: ConsumptionCtx,
    homeUid: number | null,
    demand: Demand,
    range: number,
): Array<{ building: BuildingSim; distance: number; weight: number }> {
    const list = ctx.shopsByDemand.get(demand);
    if (!list || !list.length) return [];
    const out: Array<{ building: BuildingSim; distance: number; weight: number }> = [];
    const penalty = ctx.cfg.economy.distancePenalty;
    for (const b of list) {
        const econ = ctx.econOf(b.uid);
        if (!econ) continue;
        const cap = shopCapacity(b, econ, ctx.staff.get(b.uid) ?? 0);
        if ((ctx.served.get(b.uid) ?? 0) >= cap) continue;
        const radius = shopRadius(econ, ctx.cfg) * range;
        const distance = homeUid === null ? radius : ctx.town.roadDistance(homeUid, b.uid);
        if (!isFinite(distance) || distance > radius) continue;
        // 口碑 50 算标准；距离越远越不值得跑
        const repFactor = Math.max(0.2, Math.min(2, 0.5 + (b.reputation / 100)));
        // 距离按占这家店半径的比例算（8 = 以前的统一半径），半径大的店不吃亏
        const weight = Math.max(0.01, repFactor * (1 - penalty * distance * 8 / radius));
        out.push({ building: b, distance, weight });
    }
    out.sort((a, b) => b.weight - a.weight || a.building.uid - b.building.uid);
    return out;
}

/**
 * 一个居民这个月花多少钱、花在哪儿。
 * `budget` 是四类需求的总额，调用方已经按工资 / 储蓄算好。
 */
export function consumeForResident(
    r: Resident,
    budget: number,
    ctx: ConsumptionCtx,
    /** 交通倍率（步行 1，DESIGN 11.2）；每家店的半径乘它 */
    range = 1,
): ConsumptionResult {
    const cfg = ctx.cfg.economy;
    const result: ConsumptionResult = { spent: 0, missed: 0 };
    if (budget <= 0) return result;

    const demands: Demand[] = ['food', 'daily', 'fun', 'other'];
    for (const demand of demands) {
        const amount = budget * cfg.demandWeight[demand];
        if (amount <= 0.5) continue;
        const shops = reachableShops(ctx, r.homeId, demand, range);
        if (!shops.length) {
            result.missed++;
            continue;
        }
        let totalW = 0;
        for (const s of shops) totalW += s.weight;
        let left = amount;
        for (const s of shops) {
            if (left <= 0.5) break;
            const econ = ctx.econOf(s.building.uid);
            if (!econ) continue;
            const cap = shopCapacity(s.building, econ, ctx.staff.get(s.building.uid) ?? 0);
            const servedNow = ctx.served.get(s.building.uid) ?? 0;
            if (servedNow >= cap) continue;
            // 人次 = 花的钱 ÷ 客单价（D026）；不能超过店里剩下的接待能力。免费的地方（广场）算 1 人次、不花钱
            let pay = Math.min(amount * (s.weight / totalW), left);
            let visits = 1;
            if (econ.price > 0) {
                pay = Math.min(pay, (cap - servedNow) * econ.price);
                visits = pay / econ.price;
            } else {
                pay = 0;
            }
            ctx.revenue.set(s.building.uid, (ctx.revenue.get(s.building.uid) ?? 0) + pay);
            ctx.served.set(s.building.uid, servedNow + visits);
            if (econ.price <= 0) { left = 0; continue; }
            left -= pay;
            result.spent += pay;
        }
        // 钱没地儿花：存着，但心情会记住（DESIGN 2.3）
        if (left > amount * 0.5) result.missed++;
    }
    return result;
}
