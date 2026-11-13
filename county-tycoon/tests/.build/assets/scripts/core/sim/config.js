"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEconomy = parseEconomy;
exports.parseNames = parseNames;
exports.makeSimConfig = makeSimConfig;
const DEMANDS = ['food', 'daily', 'fun', 'other'];
const EDU = [0, 1, 2, 3];
const LEVELS = ['village', 'town', 'county', 'city', 'top100'];
/** 兜底经营数据：economy.json 里没写的建筑按"纯装饰"处理（不招人、不发钱、不留客） */
function fallbackEcon(defId) {
    return {
        id: defId, cost: 0, upkeep: 0, housing: 0, jobs: [], demand: null,
        capacity: 0, price: 0, env: 0, unlock: 'village', publicJob: false,
    };
}
function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
}
function clamp01(v, fallback) {
    const n = num(v, fallback);
    return Math.max(0, Math.min(1, n));
}
function strList(v) {
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length > 0) : [];
}
function parseJob(raw, level) {
    const title = typeof raw?.title === 'string' && raw.title ? raw.title : '店员';
    const count = Math.max(0, Math.floor(num(raw?.count, 0)));
    if (count <= 0)
        return null;
    const edu = EDU.indexOf(raw?.edu) >= 0 ? raw.edu : 0;
    return { title, count, salary: Math.max(0, Math.round(num(raw?.salary, 2500))), edu };
}
function parseEcon(raw, defId) {
    const demand = DEMANDS.indexOf(raw?.demand) >= 0 ? raw.demand : null;
    const unlock = LEVELS.indexOf(raw?.unlock) >= 0 ? raw.unlock : 'village';
    const jobs = [];
    if (Array.isArray(raw?.jobs)) {
        for (const j of raw.jobs) {
            const slot = parseJob(j, 0);
            if (slot)
                jobs.push(slot);
        }
    }
    return {
        id: defId,
        cost: Math.max(0, Math.round(num(raw?.cost, 0))),
        upkeep: Math.max(0, Math.round(num(raw?.upkeep, 0))),
        housing: Math.max(0, Math.floor(num(raw?.housing, 0))),
        jobs,
        demand,
        capacity: Math.max(0, Math.floor(num(raw?.capacity, 0))),
        price: Math.max(0, Math.round(num(raw?.price, 0))),
        env: Math.round(num(raw?.env, 0)),
        unlock,
        publicJob: raw?.publicJob === true,
    };
}
const DEFAULT_ECONOMY = {
    secondsPerMonth: 20,
    taxRate: { business: 0.1, industry: 0.15, income: 0.05 },
    incomeTaxThreshold: 2000,
    spendRate: 0.5,
    savingsSpendRate: 0.05,
    demandWeight: { food: 0.4, daily: 0.2, fun: 0.2, other: 0.2 },
    serviceRadius: 8,
    distancePenalty: 0.06,
    rentPerPerson: 600,
    commuteComfort: 4,
    pension: 400,
    deathAge: 80,
    leaveMood: 20,
    leaveMonths: 3,
    unemployedLeaveMonths: 6,
    immigrationRate: 0.6,
    startFunds: 50000,
    bailout: 8000,
    taxRange: { min: 0.02, max: 0.3 },
    maxEducationWithSchool: 3,
    studentsPerTeacher: 20,
    logLimit: 12,
    residents: {
        startSavings: 6000,
        commutePenalty: 40,
        jobHopRaise: 1.2,
        jobHopChance: 0.05,
        marryMinAge: 18,
        marryMaxAge: 40,
        marryChance: 0.25,
        marryMaxAgeGap: 6,
        childMinAge: 22,
        childMaxAge: 40,
        childChancePerYear: 0.2,
        schoolMinAge: 6,
        schoolMaxAge: 17,
        workMinAge: 18,
        retireAge: 60,
        crowdRatio: 1,
        moodDrift: 0,
    },
};
const DEFAULT_NAMES = {
    surnames: ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'],
    maleOld: ['建国', '卫东', '志强', '长顺'],
    femaleOld: ['秀兰', '桂芳', '秀英', '玉梅'],
    maleYoung: ['伟', '磊', '浩然', '子轩'],
    femaleYoung: ['晓燕', '雨欣', '思琪', '佳怡'],
};
function parseEconomy(json) {
    const src = json ?? {};
    const t = (src.tuning ?? {});
    const r = (t.residents ?? {});
    const d = DEFAULT_ECONOMY;
    const w = (t.demandWeight ?? {});
    const weightSum = DEMANDS.reduce((a, k) => a + Math.max(0, num(w[k], d.demandWeight[k])), 0);
    const residentTuning = {
        startSavings: Math.max(0, num(r.startSavings, d.residents.startSavings)),
        commutePenalty: Math.max(0, num(r.commutePenalty, d.residents.commutePenalty)),
        jobHopRaise: num(r.jobHopRaise, d.residents.jobHopRaise),
        jobHopChance: clamp01(r.jobHopChance, d.residents.jobHopChance),
        marryMinAge: num(r.marryMinAge, d.residents.marryMinAge),
        marryMaxAge: num(r.marryMaxAge, d.residents.marryMaxAge),
        marryChance: clamp01(r.marryChance, d.residents.marryChance),
        marryMaxAgeGap: num(r.marryMaxAgeGap, d.residents.marryMaxAgeGap),
        childMinAge: num(r.childMinAge, d.residents.childMinAge),
        childMaxAge: num(r.childMaxAge, d.residents.childMaxAge),
        childChancePerYear: clamp01(r.childChancePerYear, d.residents.childChancePerYear),
        schoolMinAge: num(r.schoolMinAge, d.residents.schoolMinAge),
        schoolMaxAge: num(r.schoolMaxAge, d.residents.schoolMaxAge),
        workMinAge: num(r.workMinAge, d.residents.workMinAge),
        retireAge: num(r.retireAge, d.residents.retireAge),
        crowdRatio: Math.max(0.1, num(r.crowdRatio, d.residents.crowdRatio)),
        moodDrift: num(r.moodDrift, d.residents.moodDrift),
    };
    const demandWeight = {
        food: weightSum > 0 ? Math.max(0, num(w.food, d.demandWeight.food)) / weightSum : 0.25,
        daily: weightSum > 0 ? Math.max(0, num(w.daily, d.demandWeight.daily)) / weightSum : 0.25,
        fun: weightSum > 0 ? Math.max(0, num(w.fun, d.demandWeight.fun)) / weightSum : 0.25,
        other: weightSum > 0 ? Math.max(0, num(w.other, d.demandWeight.other)) / weightSum : 0.25,
    };
    return {
        secondsPerMonth: Math.max(1, num(src.secondsPerMonth, d.secondsPerMonth)),
        taxRate: {
            business: clamp01(src.taxRate?.business, d.taxRate.business),
            industry: clamp01(src.taxRate?.industry, d.taxRate.industry),
            income: clamp01(src.taxRate?.income, d.taxRate.income),
        },
        incomeTaxThreshold: Math.max(0, num(t.incomeTaxThreshold, d.incomeTaxThreshold)),
        spendRate: clamp01(t.spendRate, d.spendRate),
        savingsSpendRate: clamp01(t.savingsSpendRate, d.savingsSpendRate),
        demandWeight,
        serviceRadius: Math.max(1, num(t.serviceRadius, d.serviceRadius)),
        distancePenalty: clamp01(t.distancePenalty, d.distancePenalty),
        rentPerPerson: Math.max(0, num(t.rentPerPerson, d.rentPerPerson)),
        commuteComfort: Math.max(0, num(t.commuteComfort, d.commuteComfort)),
        pension: Math.max(0, num(t.pension, d.pension)),
        deathAge: Math.max(60, num(t.deathAge, d.deathAge)),
        leaveMood: Math.max(0, num(t.leaveMood, d.leaveMood)),
        leaveMonths: Math.max(1, Math.floor(num(t.leaveMonths, d.leaveMonths))),
        unemployedLeaveMonths: Math.max(1, Math.floor(num(t.unemployedLeaveMonths, d.unemployedLeaveMonths))),
        immigrationRate: Math.max(0, num(t.immigrationRate, d.immigrationRate)),
        startFunds: Math.max(0, num(src.startFunds, d.startFunds)),
        bailout: Math.max(0, num(t.bailout, d.bailout)),
        taxRange: {
            min: clamp01(t.taxRange?.min, d.taxRange.min),
            max: clamp01(t.taxRange?.max, d.taxRange.max),
        },
        maxEducationWithSchool: (EDU.indexOf(t.maxEducationWithSchool) >= 0 ? t.maxEducationWithSchool : d.maxEducationWithSchool),
        studentsPerTeacher: Math.max(1, num(t.studentsPerTeacher, d.studentsPerTeacher)),
        logLimit: Math.max(1, Math.floor(num(t.logLimit, d.logLimit))),
        residents: residentTuning,
    };
}
function parseNames(json) {
    const src = json ?? {};
    const pick = (v, fallback) => (strList(v).length ? strList(v) : fallback);
    const opening = [];
    if (Array.isArray(src.opening)) {
        for (const p of src.opening) {
            if (!p || typeof p.name !== 'string')
                continue;
            opening.push({
                name: p.name,
                gender: p.gender === 'F' ? 'F' : 'M',
                age: Math.max(0, Math.floor(num(p.age, 25))),
                spouseOf: typeof p.spouseOf === 'number' ? p.spouseOf : undefined,
                homeDefId: typeof p.homeDefId === 'string' ? p.homeDefId : undefined,
            });
        }
    }
    return {
        surnames: pick(src.surnames, DEFAULT_NAMES.surnames),
        maleOld: pick(src.maleOld, DEFAULT_NAMES.maleOld),
        femaleOld: pick(src.femaleOld, DEFAULT_NAMES.femaleOld),
        maleYoung: pick(src.maleYoung, DEFAULT_NAMES.maleYoung),
        femaleYoung: pick(src.femaleYoung, DEFAULT_NAMES.femaleYoung),
        opening: opening.length ? opening : undefined,
    };
}
/** 把两份 JSON 包成 SimConfig，顺带建好 defId → BuildingEcon 的索引 */
function makeSimConfig(economyJson, namesJson) {
    const economy = parseEconomy(economyJson);
    const names = parseNames(namesJson);
    const table = new Map();
    const list = Array.isArray(economyJson?.buildings) ? economyJson.buildings : [];
    for (const raw of list) {
        const id = typeof raw?.id === 'string' ? raw.id : '';
        if (!id || table.has(id))
            continue;
        table.set(id, parseEcon(raw, id));
    }
    return {
        economy,
        names,
        building: (defId) => table.get(defId) ?? null,
    };
}
