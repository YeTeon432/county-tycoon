import { BuildingEcon, Demand, Education, JobSlot, TownLevel, Vehicle } from './types';

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
    /** 研究 / 目标 / 心愿（progress.json，D026）。没配 = 一切都解锁、没有目标（老测试、MockSim） */
    progress: ProgressConfig | null;
}

export interface ResearchDef {
    id: string;
    name: string;
    unlocks: string[];
    cost: number;
    days: number;
    level: TownLevel;
    needPop: number;
    /** 县里要有其中一种（'a|b'） */
    needBuilding: string[];
    needEdu: { edu: Education; count: number } | null;
}

export interface GoalDef {
    kind: 'pop' | 'research' | 'wishes' | 'mood' | 'roads' | 'building' | 'employment' | 'streets' | 'deals';
    target: number;
    of: string[];
    text: string;
}

export interface WishTuning {
    chance: number;
    minActive: number;
    perPeople: number;
    days: number;
    doneMood: number;
    expireMood: number;
    doneBuzz: number;
}

export interface StreetDef {
    id: string;
    name: string;
    members: string[];
    outsideMult: number;
    mood: number;
    who: 'all' | 'kids' | 'young';
    buzz: number;
    effect: string;
}

export interface InvestConfig {
    every: number;
    max: number;
    valid: number;
    landFeeRate: number;
    subsidyRate: number;
    envWeight: number;
    taxBreakBonus: number;
    taxBreakMonths: number;
    maxChance: number;
    pool: Partial<Record<TownLevel, string[]>>;
    companies: string[];
}

export interface ProgressConfig {
    streets: { range: number; radius: number; list: StreetDef[] };
    invest: InvestConfig;
    initialUnlocked: string[];
    research: ResearchDef[];
    goals: Partial<Record<TownLevel, GoalDef[]>>;
    levelReward: Partial<Record<TownLevel, number>>;
    wishes: WishTuning;
}

export function parseProgress(json: any): ProgressConfig | null {
    if (!json || typeof json !== 'object') return null;
    const levelOf = (v: unknown): TownLevel => (LEVELS.indexOf(v as TownLevel) >= 0 ? v as TownLevel : 'village');
    const split = (v: unknown) => (typeof v === 'string' && v ? v.split('|') : []);
    const research: ResearchDef[] = (Array.isArray(json.research) ? json.research : []).filter((r: any) => r && typeof r.id === 'string').map((r: any) => ({
        id: r.id,
        name: typeof r.name === 'string' ? r.name : r.id,
        unlocks: strList(r.unlocks),
        cost: Math.max(0, Math.round(num(r.cost, 0))),
        days: Math.max(1, Math.floor(num(r.days, 1))),
        level: levelOf(r.level),
        needPop: Math.max(0, num(r.needPop, 0)),
        needBuilding: split(r.needBuilding),
        needEdu: r.needEdu && typeof r.needEdu === 'object'
            ? { edu: (EDU.indexOf(r.needEdu.edu) >= 0 ? r.needEdu.edu : 0) as Education, count: Math.max(0, num(r.needEdu.count, 0)) }
            : null,
    }));
    const goals: Partial<Record<TownLevel, GoalDef[]>> = {};
    const kinds = ['pop', 'research', 'wishes', 'mood', 'roads', 'building', 'employment', 'streets', 'deals'];
    for (const lv of LEVELS) {
        const list = json.goals?.[lv];
        if (!Array.isArray(list)) continue;
        goals[lv] = list.filter((g: any) => g && kinds.indexOf(g.kind) >= 0).map((g: any) => ({
            kind: g.kind, target: num(g.target, 1), of: split(g.of), text: typeof g.text === 'string' ? g.text : g.kind,
        }));
    }
    const reward: Partial<Record<TownLevel, number>> = {};
    for (const lv of LEVELS) if (typeof json.levelReward?.[lv] === 'number') reward[lv] = json.levelReward[lv];
    const w = json.wishes ?? {};
    const st = json.streets ?? {};
    const iv = json.invest ?? {};
    const pool: Partial<Record<TownLevel, string[]>> = {};
    for (const lv of LEVELS) if (Array.isArray(iv.pool?.[lv])) pool[lv] = strList(iv.pool[lv]);
    return {
        streets: {
            range: Math.max(1, num(st.range, 4)),
            radius: Math.max(1, num(st.radius, 8)),
            list: (Array.isArray(st.list) ? st.list : []).filter((x: any) => x && typeof x.id === 'string').map((x: any) => ({
                id: x.id, name: typeof x.name === 'string' ? x.name : x.id, members: strList(x.members),
                outsideMult: Math.max(0, num(x.outsideMult, 1)), mood: num(x.mood, 0),
                who: x.who === 'kids' || x.who === 'young' ? x.who : 'all', buzz: num(x.buzz, 0),
                effect: typeof x.effect === 'string' ? x.effect : '',
            })),
        },
        invest: {
            every: Math.max(1, Math.floor(num(iv.every, 3))), max: Math.max(1, Math.floor(num(iv.max, 3))),
            valid: Math.max(1, Math.floor(num(iv.valid, 7))), landFeeRate: num(iv.landFeeRate, 0.6),
            subsidyRate: num(iv.subsidyRate, 0.5), envWeight: num(iv.envWeight, 0.9), taxBreakBonus: num(iv.taxBreakBonus, 0.2),
            taxBreakMonths: Math.max(0, Math.floor(num(iv.taxBreakMonths, 12))), maxChance: clamp01(iv.maxChance, 0.9),
            pool, companies: strList(iv.companies).length ? strList(iv.companies) : ['外地'],
        },
        initialUnlocked: strList(json.initialUnlocked),
        research,
        goals,
        levelReward: reward,
        wishes: {
            chance: clamp01(w.chance, 0.25),
            minActive: Math.max(0, num(w.minActive, 3)),
            perPeople: Math.max(1, num(w.perPeople, 5)),
            days: Math.max(1, Math.floor(num(w.days, 10))),
            doneMood: num(w.doneMood, 15),
            expireMood: num(w.expireMood, 5),
            doneBuzz: num(w.doneBuzz, 0.05),
        },
    };
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
    /** 公共服务（环卫、治安、管网）每人每月多少钱，按城镇等级乘倍率（T532）。财政出，流出县外 */
    servicePerCapita: number;
    serviceLevelMult: Record<string, number>;
    /** 规模效应：人均公共服务 × (1 + 人口 / 这个数)；0 = 不加（T532） */
    serviceCrowding: number;
    deathAge: number;
    /** 幸福度低于这个数 → 想走（D026：30） */
    leaveMood: number;
    /** 想走之后的挽留期（月 = 天），到期还没回到 stayMood 就全家搬走 */
    leaveMonths: number;
    /** 挽留成功的线：想走的人幸福度回到这个数以上就留下 */
    stayMood: number;
    /** 迁入：县城幸福度 → 吸引倍率的折线 [[幸福度, 倍率], ...]（DESIGN 16.2） */
    immigrationCurve: [number, number][];
    /** 口碑：每有一个人走 −、每月衰减比例、上限 */
    buzzPerLeave: number;
    buzzDecay: number;
    buzzMax: number;
    /** 失业达到几个月 → 搬走 */
    unemployedLeaveMonths: number;
    /** 过路客（县外客人）：每家店每月额外的营业额 = 满额营业额 × 这个比例，按城镇等级（D026） */
    outsideShare: Record<TownLevel, number>;
    /** 连续亏损几个月就裁一个人（至少留 1 人） */
    layoffMonths: number;
    /** 住户自家翻盖（DESIGN 23）：每月概率、存款要够翻盖费 × 几倍、平均幸福度门槛 */
    renovateChance: number;
    renovateSavingsRatio: number;
    renovateMood: number;
    /** 搬去更好的房子：每月概率、存款要够几个月房租 */
    moveChance: number;
    moveRentMonths: number;
    /** 每月迁入的基础吸引力 */
    immigrationRate: number;
    /** 人才引进分档（D030，DESIGN 16.6）：每次招 count 人，每人 price */
    talentTiers: { edu: Education; price: number; count: number }[];
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
    /** 交通工具（DESIGN 11，economy.json: vehicles） */
    vehicles: VehicleConfig;
}

/** 一种交通工具的数值（DESIGN 11.1 / 11.2） */
export interface VehicleTier {
    /** 价格（从储蓄扣，算进对应工厂的产值） */
    price: number;
    /** 县里要有这种厂才能买（建筑 id）；walk 为 '' */
    factory: string;
    /** 储蓄 ≥ 价格 × 这个数才买 */
    savingsRatio: number;
    /** 月薪门槛 */
    minSalary: number;
    /** 满足条件时每月买的概率 */
    chance: number;
    /** 交通倍率：消费半径、上班舒适距离 ×，找工作的通勤惩罚 ÷ */
    range: number;
    /** 每月心情目标加成 */
    mood: number;
    /** 每月油费（从可支配收入扣，不进财政） */
    fuel: number;
}

/** 人才引进一档（D030）：一次招一批同样学历的人 */
export interface TalentTier { edu: Education; price: number; count: number }

export interface VehicleConfig {
    /** 买车的年龄范围（含两端），还要有工作 */
    minAge: number;
    maxAge: number;
    tiers: Record<Vehicle, VehicleTier>;
}

/** 从差到好，只往上换 */
export const VEHICLE_ORDER: Vehicle[] = ['walk', 'ebike', 'moto', 'car'];

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
    /** 赋闲（D024）：存款 ≥ 这么多个月的开销（房租 + idleLivingCost）就可以不上班 */
    idleSavingsMonths: number;
    /** 赋闲的人每月生活费（算门槛用） */
    idleLivingCost: number;
    /** 赋闲后存款跌到门槛的这个比例以下，才重新找工作（免得每月来回切） */
    idleExitRatio: number;
    /** 赋闲的人心情加成（有闲） */
    idleMood: number;
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
        capacity: 0, price: 0, env: 0, unlock: 'village', publicJob: false, costRate: 0, buildDays: 0,
        rent: 0, homeLevel: 0, homeMood: 0, upgradeTo: '', selfBuilt: false,
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
        buildDays: Math.max(0, Math.floor(num(raw?.buildDays, 1))),
        rent: Math.max(0, num(raw?.rent, 0)),
        homeLevel: Math.max(0, Math.floor(num(raw?.homeLevel, raw?.housing > 0 ? 1 : 0))),
        homeMood: num(raw?.homeMood, 0),
        upgradeTo: typeof raw?.upgradeTo === 'string' ? raw.upgradeTo : '',
        selfBuilt: raw?.selfBuilt === true,
        // 没写就按类型给：吃的进货贵，服务类便宜，工厂原料 0.3（D026）
        costRate: clamp01(raw?.costRate, demand === 'food' ? 0.45 : demand === 'daily' ? 0.6 : demand ? 0.25 : 0.3),
    };
}

const DEFAULT_ECONOMY: EconomyConfig = {
    secondsPerMonth: 60,
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
    servicePerCapita: 0,
    serviceLevelMult: { village: 1, town: 1, county: 1, city: 1, top100: 1 },
    serviceCrowding: 0,
    deathAge: 80,
    leaveMood: 30,
    leaveMonths: 3,
    stayMood: 35,
    immigrationCurve: [[30, 0], [50, 1], [70, 2], [85, 2.5], [100, 2.5]],
    buzzPerLeave: 0.05,
    buzzDecay: 0.1,
    buzzMax: 0.5,
    unemployedLeaveMonths: 6,
    outsideShare: { village: 0.3, town: 0.2, county: 0.15, city: 0.1, top100: 0.1 },
    layoffMonths: 3,
    renovateChance: 0.12,
    renovateSavingsRatio: 1.5,
    renovateMood: 50,
    moveChance: 0.1,
    moveRentMonths: 12,
    immigrationRate: 0.6,
    talentTiers: [
        { edu: 0, price: 1500, count: 6 },
        { edu: 1, price: 3000, count: 6 },
        { edu: 2, price: 5000, count: 6 },
    ],
    startFunds: 100000,
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
        idleSavingsMonths: 12,
        idleLivingCost: 1000,
        idleExitRatio: 0.5,
        idleMood: 4,
        moodDrift: 0,
    },
    vehicles: {
        minAge: 18,
        maxAge: 65,
        tiers: {
            walk: { price: 0, factory: '', savingsRatio: 0, minSalary: 0, chance: 0, range: 1, mood: 0, fuel: 0 },
            ebike: { price: 3000, factory: 'moto-factory', savingsRatio: 1.5, minSalary: 0, chance: 0.015, range: 1.5, mood: 3, fuel: 0 },
            moto: { price: 8000, factory: 'moto-factory', savingsRatio: 1.5, minSalary: 3000, chance: 0.01, range: 1.7, mood: 3, fuel: 0 },
            car: { price: 40000, factory: 'car-factory', savingsRatio: 1.2, minSalary: 4500, chance: 0.008, range: 2.2, mood: 5, fuel: 300 },
        },
    },
};

/** 人才引进分档（D030）：JSON 里改价钱 / 人数 */
function parseTalentTiers(raw: any, d: TalentTier[]): TalentTier[] {
    if (!Array.isArray(raw) || !raw.length) return d;
    const out: TalentTier[] = [];
    for (const t of raw) {
        if (!t || typeof t !== 'object') continue;
        if (EDU.indexOf(t.edu as any) < 0) continue;
        out.push({
            edu: t.edu as Education,
            price: Math.max(0, Math.round(num(t.price, 3000))),
            count: Math.max(1, Math.floor(num(t.count, 6))),
        });
    }
    return out.length ? out : d;
}

function parseVehicles(raw: any, d: VehicleConfig): VehicleConfig {
    const src = raw && typeof raw === 'object' ? raw : {};
    const types = (src.types && typeof src.types === 'object' ? src.types : {}) as Record<string, any>;
    const tiers = {} as Record<Vehicle, VehicleTier>;
    for (const v of VEHICLE_ORDER) {
        const t = types[v] ?? {};
        const def = d.tiers[v];
        tiers[v] = {
            price: Math.max(0, Math.round(num(t.price, def.price))),
            factory: v === 'walk' ? '' : (typeof t.factory === 'string' && t.factory ? t.factory : def.factory),
            savingsRatio: Math.max(0, num(t.savingsRatio, def.savingsRatio)),
            minSalary: Math.max(0, num(t.minSalary, def.minSalary)),
            chance: v === 'walk' ? 0 : clamp01(t.chance, def.chance),
            range: Math.max(0.1, num(t.range, def.range)),
            mood: num(t.mood, def.mood),
            fuel: Math.max(0, num(t.fuel, def.fuel)),
        };
    }
    return {
        minAge: num(src.minAge, d.minAge),
        maxAge: num(src.maxAge, d.maxAge),
        tiers,
    };
}

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
    /** 交通工具（DESIGN 11） */
    vehicles?: unknown;
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
        idleSavingsMonths: Math.max(0, num(r.idleSavingsMonths, d.residents.idleSavingsMonths)),
        idleLivingCost: Math.max(0, num(r.idleLivingCost, d.residents.idleLivingCost)),
        idleExitRatio: clamp01(r.idleExitRatio, d.residents.idleExitRatio),
        idleMood: num(r.idleMood, d.residents.idleMood),
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
        servicePerCapita: Math.max(0, num(t.servicePerCapita, d.servicePerCapita)),
        serviceCrowding: Math.max(0, num(t.serviceCrowding, d.serviceCrowding)),
        serviceLevelMult: { ...d.serviceLevelMult, ...((t.serviceLevelMult && typeof t.serviceLevelMult === 'object') ? t.serviceLevelMult as Record<string, number> : {}) },
        deathAge: Math.max(60, num(t.deathAge, d.deathAge)),
        leaveMood: Math.max(0, num(t.leaveMood, d.leaveMood)),
        leaveMonths: Math.max(1, Math.floor(num(t.leaveMonths, d.leaveMonths))),
        stayMood: Math.max(0, num(t.stayMood, d.stayMood)),
        immigrationCurve: Array.isArray(t.immigrationCurve) && t.immigrationCurve.every((p: unknown) => Array.isArray(p) && p.length === 2)
            ? (t.immigrationCurve as [number, number][]).map(([a, b]) => [num(a, 0), num(b, 0)] as [number, number])
            : d.immigrationCurve,
        buzzPerLeave: num(t.buzzPerLeave, d.buzzPerLeave),
        buzzDecay: clamp01(t.buzzDecay, d.buzzDecay),
        buzzMax: num(t.buzzMax, d.buzzMax),
        unemployedLeaveMonths: Math.max(1, Math.floor(num(t.unemployedLeaveMonths, d.unemployedLeaveMonths))),
        outsideShare: (() => {
            const o = (t.outsideShare ?? {}) as Record<string, unknown>;
            const out = { ...d.outsideShare };
            for (const k of LEVELS) out[k] = clamp01(o[k], d.outsideShare[k]);
            return out;
        })(),
        layoffMonths: Math.max(1, Math.floor(num(t.layoffMonths, d.layoffMonths))),
        renovateChance: clamp01(t.renovateChance, d.renovateChance),
        renovateSavingsRatio: Math.max(0, num(t.renovateSavingsRatio, d.renovateSavingsRatio)),
        renovateMood: num(t.renovateMood, d.renovateMood),
        moveChance: clamp01(t.moveChance, d.moveChance),
        moveRentMonths: Math.max(0, num(t.moveRentMonths, d.moveRentMonths)),
        immigrationRate: Math.max(0, num(t.immigrationRate, d.immigrationRate)),
        talentTiers: parseTalentTiers(t.talentTiers, d.talentTiers),
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
        vehicles: parseVehicles(src.vehicles, d.vehicles),
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
export function makeSimConfig(economyJson: EconomyJson | null | undefined, namesJson: any, progressJson: any = null): SimConfig {
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
        progress: parseProgress(progressJson),
    };
}
