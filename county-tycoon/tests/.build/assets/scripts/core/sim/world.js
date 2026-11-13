"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flatSlots = flatSlots;
exports.isHousing = isHousing;
exports.isShop = isShop;
exports.isPublic = isPublic;
exports.isProducer = isProducer;
exports.buildWorld = buildWorld;
/** 把一栋楼的岗位展开成一个个具体的位置，学历低的排前面（谁都能先上，高学历岗位才留得住位置） */
function flatSlots(econ) {
    const out = [];
    for (const slot of econ.jobs) {
        for (let i = 0; i < slot.count; i++)
            out.push(slot);
    }
    out.sort((a, b) => a.edu - b.edu);
    return out;
}
function isHousing(econ) {
    return !!econ && econ.housing > 0;
}
function isShop(econ) {
    return !!econ && econ.demand !== null && econ.capacity > 0;
}
function isPublic(econ) {
    return !!econ && econ.publicJob;
}
function isProducer(econ) {
    return !!econ && !econ.publicJob && econ.demand === null && econ.jobs.length > 0;
}
function buildWorld(residents, buildings, econOf) {
    const residentsById = new Map();
    for (const r of residents)
        residentsById.set(r.id, r);
    const buildingByUid = new Map();
    for (const b of buildings)
        buildingByUid.set(b.uid, b);
    const homes = [];
    const shops = [];
    const producers = [];
    const publics = [];
    const shopsByDemand = new Map();
    for (const b of buildings) {
        const econ = econOf(b.uid);
        if (!econ)
            continue;
        if (econ.housing > 0)
            homes.push(b);
        if (econ.demand !== null && econ.capacity > 0) {
            shops.push(b);
            const list = shopsByDemand.get(econ.demand);
            if (list)
                list.push(b);
            else
                shopsByDemand.set(econ.demand, [b]);
        }
        if (isProducer(econ))
            producers.push(b);
        if (econ.publicJob)
            publics.push(b);
    }
    return { residentsById, buildingByUid, econOf, homes, shops, producers, publics, shopsByDemand };
}
