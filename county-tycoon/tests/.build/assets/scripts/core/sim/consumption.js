"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWNER_RUN_MIN = void 0;
exports.shopCapacity = shopCapacity;
exports.reachableShops = reachableShops;
exports.consumeForResident = consumeForResident;
/**
 * 店里的服务能力。
 *
 * 按在岗比例折算，但留 40% 的保底：小店没人来上班时老板自己撑着门面，
 * 不能因为招不到人就一分钱不挣（否则新手期整条街都是 0 收入，玩家看不到反馈）。
 */
exports.OWNER_RUN_MIN = 0.4;
function shopCapacity(b, econ, staff) {
    let required = 0;
    for (const slot of econ.jobs)
        required += slot.count;
    if (required <= 0)
        return econ.capacity;
    const ratio = Math.max(exports.OWNER_RUN_MIN, Math.min(1, Math.max(0, staff) / required));
    return Math.floor(econ.capacity * ratio);
}
/** 从某栋楼出发，沿道路能走到、且这月还没排满的同类店 */
function reachableShops(ctx, homeUid, demand, radius) {
    const list = ctx.shopsByDemand.get(demand);
    if (!list || !list.length)
        return [];
    const out = [];
    const penalty = ctx.cfg.economy.distancePenalty;
    for (const b of list) {
        const econ = ctx.econOf(b.uid);
        if (!econ)
            continue;
        const cap = shopCapacity(b, econ, ctx.staff.get(b.uid) ?? 0);
        if ((ctx.served.get(b.uid) ?? 0) >= cap)
            continue;
        const distance = homeUid === null ? radius : ctx.town.roadDistance(homeUid, b.uid);
        if (!isFinite(distance) || distance > radius)
            continue;
        // 口碑 50 算标准；距离越远越不值得跑
        const repFactor = Math.max(0.2, Math.min(2, 0.5 + (b.reputation / 100)));
        const weight = Math.max(0.01, repFactor * (1 - penalty * distance));
        out.push({ building: b, distance, weight });
    }
    out.sort((a, b) => b.weight - a.weight || a.building.uid - b.building.uid);
    return out;
}
/**
 * 一个居民这个月花多少钱、花在哪儿。
 * `budget` 是四类需求的总额，调用方已经按工资 / 储蓄算好。
 */
function consumeForResident(r, budget, ctx) {
    const cfg = ctx.cfg.economy;
    const result = { spent: 0, missed: 0 };
    if (budget <= 0)
        return result;
    const demands = ['food', 'daily', 'fun', 'other'];
    for (const demand of demands) {
        const amount = budget * cfg.demandWeight[demand];
        if (amount <= 0.5)
            continue;
        const shops = reachableShops(ctx, r.homeId, demand, cfg.serviceRadius);
        if (!shops.length) {
            result.missed++;
            continue;
        }
        let totalW = 0;
        for (const s of shops)
            totalW += s.weight;
        let left = amount;
        for (const s of shops) {
            if (left <= 0.5)
                break;
            const econ = ctx.econOf(s.building.uid);
            if (!econ)
                continue;
            const cap = shopCapacity(s.building, econ, ctx.staff.get(s.building.uid) ?? 0);
            const servedNow = ctx.served.get(s.building.uid) ?? 0;
            if (servedNow >= cap)
                continue;
            const share = amount * (s.weight / totalW);
            const pay = Math.min(share, left);
            ctx.revenue.set(s.building.uid, (ctx.revenue.get(s.building.uid) ?? 0) + pay);
            ctx.served.set(s.building.uid, servedNow + 1);
            left -= pay;
            result.spent += pay;
        }
        // 钱没地儿花：存着，但心情会记住（DESIGN 2.3）
        if (left > amount * 0.5)
            result.missed++;
    }
    return result;
}
