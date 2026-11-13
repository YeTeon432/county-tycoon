import { BuildingEcon, Demand, Education, JobSlot, TownLevel } from './types';

/**
 * 模拟层的配置读取（收 economy.json + names.json 的原始 JSON，转成强类型）。
 *
 * 模拟层不做 `resources.load`（见 PARALLEL.md 支线 A）：GameRoot 读好 JSON 传进来，
 * node 测试则直接 `require('../../assets/resources/config/economy.json')`。
 */
export interface SimConfig {
    economy: EconomyConfig;
    names: NameConfig;
    /** defId → 经营数据 */
    building: (defId: string) => BuildingEcon | null;
}

export interface EconomyConfig {
    secondsPerMonth: number;
    taxRate: { business: number; industry: number; income: number };
    /** 个税起征点（月薪超过多少才交） */
    incomeTaxThreshold: number;
    /** 月可支配收入里工资被花掉的比例 */
    spendRate: number;
    /** 储蓄被花掉的比例 */
    savingsSpendRate: number;
    /** 各类需求占可支配收入的比例，四类加起来 1 */
    demandWeight: Record<Demand, number>;
    /** "附近店铺"的最大沿路距离（格） */
    serviceRadius: number;
    /** 距离每多一格的优先度惩罚（0 = 只看距离排序，1 = 无所谓距离） */
    distancePenalty: number;
    /** 每人每月的房租（M4 前固定，见 DESIGN 2.3 第 3 步） */
    rentPerPerson: number;
    /** 通勤超过这个距离开始扣心情 */
    commuteComfort: number;
    pension: number;
    deathAge: number;
    /** 心情低于这个数且持续几个月 → 搬走 */
    leaveMood: number;
    leaveMonths: number;
    /** 失业达到几个月 → 搬走 */
    unemployedLeaveMonths: number;
    /** 每月迁入的基础吸引力 */
    immigrationRate: number;
    /** 开局给的启动资金 */
    startFunds: number;
    /** 破产时的救助钱（不会游戏结束，见 DESIGN 3） */
    bailout: number;
    /** 玩家能调的税率范围 */
    taxRange: { min: number; max: number };
    /** 有学校时学历能升到几（0 是纯兜底，正常配 3） */
    maxEducationWithSchool: Education;
    /** 学校每名学生要摊多少老师，低于这个数就不能继续提升学历 */
    studentsPerTeacher: number;
    /** 居民日志最多留几条 */
    logLimit: number;
    residents: ResidentTuning;
}

export interface ResidentTuning {
    startSavings: number;
    /** 找工作的通勤惩罚：每格多少块钱（从工资里扣着比） */
    commutePenalty: number;
    /** 跳槽要工资高多少倍才动 */
    jobHopRaise: number;
    jobHopChance: number;
    /** 每年跳槽判定一次（在生日那个月） */
    /** 结婚 */
    marryMinAge: number;
    marryMaxAge: number;
    marryChance: number;
    marryMaxAgeGap: number;
    /** 生孩子 */
    childMinAge: number;
    childMaxAge: number;
    childChancePerYear: number;
    /** 上学 */
    schoolMinAge: number;
    schoolMaxAge: number;
    /** 劳动年龄 */
    workMinAge: number;
    retireAge: number;
    /** 住房拥挤：楼里人数 > 住房 × 这个比例就扣心情 */
    crowdRatio: number;
    /** 空房多便宜算"最便宜的空房"（迁入时排序用） */
    moodDrift: number;
}

export interface NameConfig {
    /** 姓（单个字或复姓） */
    surnames: string[];
    /** 按年代挑名：rural = 中老年，modern = 年轻人 */
    maleOld: string[];
    femaleOld: string[];
    maleYoung: string[];
    femaleYoung: string[];
    /** 开局固定人物（新手期有节奏，DESIGN 2.7） */
    opening?: OpeningPerson[];
}

export interface OpeningPerson {
    name: string;
    gender: 'M' | 'F';
    age: number;
    spouseOf?: number;      // 数组下标，0 起
    /** 开局时想住的建筑（按 BuildingsEcon 的 id 找），找不到就塞进第一栋空房 */
    homeDefId?: string;
}

const DEMANDS: Demand[] = ['food', 'daily', 'fun', 'other'];
const EDU: Education[] = [0, 1, 2, 3];
const LEVELS: TownLevel[] = ['village', 'town', 'county', 'city', 'top100'];

/** 兜底经营数据：economy.json 里没写的建筑按"纯装饰"处理（不招人、不发钱、不留客） */
function fallbackEcon(defId: string): BuildingEcon {
    return {
        id: defId, cost: 0, upkeep: 0, housing: 0, jobs: [], demand: null,
        capacity: 0, price: 0, env: 0, unlock: 'village', publicJob: false,
    };
}

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function clamp01(v: unknown, fallback: number): number {
    const n = num(v, fallback);
    return Math.max(0, Math.min(1, n));
}

function strList(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

function parseJob(raw: any, level: number): JobSlot | null {
    const title = typeof raw?.title === 'string' && raw.title ? raw.title : '店员';
    const count = Math.max(0, Math.floor(num(raw?.count, 0)));
    if (count <= 0) return null;
    const edu = EDU.indexOf(raw?.edu) >= 0 ? (raw.edu as Education) : 0;
    return { title, count, salary: Math.max(0, Math.round(num(raw?.salary, 2500))), edu };
}

function parseEcon(raw: any, defId: string): BuildingEcon {
    const demand = DEMANDS.indexOf(raw?.demand) >= 0 ? (raw.demand as Demand) : null;
    const unlock = LEVELS.indexOf(raw?.unlock) >= 0 ? (raw.unlock as TownLevel) : 'village';
    const jobs: JobSlot[] = [];
    if (Array.isArray(raw?.jobs)) {
        for (const j of raw.jobs) {
            const slot = parseJob(j, 0);
            if (slot) jobs.push(slot);
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

const DEFAULT_ECONOMY: EconomyConfig = {
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

const DEFAULT_NAMES: NameConfig = {
    surnames: ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'],
    maleOld: ['建国', '卫东', '志强', '长顺'],
    femaleOld: ['秀兰', '桂芳', '秀英', '玉梅'],
    maleYoung: ['伟', '磊', '浩然', '子轩'],
    femaleYoung: ['晓燕', '雨欣', '思琪', '佳怡'],
};

/** economy.json 的原始结构 */
interface EconomyJson {
    secondsPerMonth?: number;
    taxRate?: { business?: number; industry?: number; income?: number };
    startFunds?: number;
    /** 每栋建筑的经营数据，按下标顺序 */
    buildings?: Array<Record<string, unknown> & { id?: string }>;
    /** 全局参数放在 tuning 里，和 buildings 分开，读起来清楚 */
    tuning?: Record<string, unknown>;
}

export function parseEconomy(json: EconomyJson | null | undefined): EconomyConfig {
    const src = json ?? {};
    const t = (src.tuning ?? {}) as Record<string, any>;
    const r = (t.residents ?? {}) as Record<string, any>;
    const d = DEFAULT_ECONOMY;
    const w = (t.demandWeight ?? {}) as Record<string, any>;
    const weightSum = DEMANDS.reduce((a, k) => a + Math.max(0, num(w[k], d.demandWeight[k])), 0);

    const residentTuning: ResidentTuning = {
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
            min: clamp01((t.taxRange as any)?.min, d.taxRange.min),
            max: clamp01((t.taxRange as any)?.max, d.taxRange.max),
        },
        maxEducationWithSchool: (EDU.indexOf(t.maxEducationWithSchool as any) >= 0 ? t.maxEducationWithSchool : d.maxEducationWithSchool) as Education,
        studentsPerTeacher: Math.max(1, num(t.studentsPerTeacher, d.studentsPerTeacher)),
        logLimit: Math.max(1, Math.floor(num(t.logLimit, d.logLimit))),
        residents: residentTuning,
    };
}

export function parseNames(json: any): NameConfig {
    const src = json ?? {};
    const pick = (v: unknown, fallback: string[]) => (strList(v).length ? strList(v) : fallback);
    const opening: OpeningPerson[] = [];
    if (Array.isArray(src.opening)) {
        for (const p of src.opening) {
            if (!p || typeof p.name !== 'string') continue;
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
export function makeSimConfig(economyJson: EconomyJson | null | undefined, namesJson: any): SimConfig {
    const economy = parseEconomy(economyJson);
    const names = parseNames(namesJson);
    const table = new Map<string, BuildingEcon>();
    const list = Array.isArray(economyJson?.buildings) ? economyJson!.buildings! : [];
    for (const raw of list) {
        const id = typeof raw?.id === 'string' ? raw.id : '';
        if (!id || table.has(id)) continue;
        table.set(id, parseEcon(raw, id));
    }
    return {
        economy,
        names,
        building: (defId: string) => table.get(defId) ?? null,
    };
}
