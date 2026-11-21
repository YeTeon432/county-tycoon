/**
 * 模拟层和画面层之间的「合同」（并行开发的共享接口，见 docs/PARALLEL.md）。
 *
 * 规则：
 *   - 这个文件只能由「集成」改。其他支线需要加字段时，在自己的分支里提，合并时统一改。
 *   - 不 import 'cc'：模拟层要能在 node 下直接跑测试。
 *   - 全部是纯数据（可 JSON 序列化），存档直接存 SimState。
 * 字段含义和计算规则见 docs/DESIGN.md。
 */

export type Gender = 'M' | 'F';
/** 0 无 / 1 初中 / 2 高中 / 3 大专以上 */
export type Education = 0 | 1 | 2 | 3;
/** 消费类型（DESIGN 2.3） */
export type Demand = 'food' | 'daily' | 'fun' | 'other';
/** 城镇等级（DESIGN 6） */
export type TownLevel = 'village' | 'town' | 'county' | 'city' | 'top100';
/** 交通工具（DESIGN 11，D022）。开局都是 walk，只往上换 */
export type Vehicle = 'walk' | 'ebike' | 'moto' | 'car';

export interface Resident {
    id: number;
    name: string;
    gender: Gender;
    age: number;
    birthMonth: number;          // 1..12
    homeId: number | null;       // 建筑 uid
    jobId: number | null;        // 建筑 uid
    jobTitle: string;            // 无工作时为 ''
    salary: number;              // 月薪，无工作为 0
    savings: number;
    spouseId: number | null;
    parentIds: number[];
    childIds: number[];
    mood: number;                // 0..100
    education: Education;
    monthsUnemployed: number;
    arrivedMonth: number;        // 绝对月份（见 SimState.month）
    /** 交通工具（D022）。旧存档没有这个字段，读档时当 'walk' */
    vehicle: Vehicle;
    /**
     * 赋闲（D024）：劳动年龄、没工作，但存款够多，自己选择不上班。
     * 不算失业：不找工作、不扣心情、不会因为失业搬走。旧存档没有这个字段，当 false。
     */
    idle?: boolean;
    /** 幸福度分项（D026，DESIGN 16.1）：每月结算时写，档案里显示「为什么开心 / 不开心」。旧存档没有 */
    moodParts?: MoodPart[];
    /** 想离开县城（幸福度 < leaveMood）：从哪个月开始、吐槽的原因。null / 没有 = 不想走 */
    leaving?: { since: number; reasons: string[] } | null;
    /** 心愿（D026，DESIGN 17）。null / 没有 = 现在没有 */
    wish?: Wish | null;
    log: LifeEvent[];            // 最近 N 条，新的在后
}

/** 居民心愿（DESIGN 17）：只从模拟层真实数据里产生 */
export type WishKind = 'shop' | 'school' | 'clinic' | 'job' | 'commute' | 'env' | 'vehicle' | 'house';
export interface Wish {
    kind: WishKind;
    /** shop 心愿：缺哪类店 */
    demand?: Demand;
    /** 指定就业意向；没有意向时接受学历相符的任意岗位。 */
    jobTarget?: { defId: string; title: string };
    /** 原话：「家附近没地方吃早饭」 */
    text: string;
    /** 建议：「在他家 8 格内盖一家早餐铺」 */
    hint: string;
    /** 建议盖的建筑（已解锁的）；没解锁时为 '' ，hint 里会写「先研究 X」 */
    suggest: string;
    /** 范围（格），购物按住宅中心画圆，学校和卫生院沿路；0 = 不限 */
    radius: number;
    since: number;
    /** 到哪个月过期 */
    until: number;
}

/** 招商签约后等交地的那一份（DESIGN 20，D032） */
export interface PendingDeal {
    offerId: number;
    defId: string;
    company: string;
    /** 供地：交地时收的出让金；补贴路线 = 0 */
    landFee: number;
    taxBreak: boolean;
    mode?: 'land' | 'subsidy';
    /** 补贴路线：交地时拨的补贴 */
    subsidy?: number;
    /** 补贴路线：厂建成时带来的工人数、学历 */
    workers?: number;
    workerEdu?: Education;
}

/** 开工时确定的原厂与产权，施工途中拆掉原厂也能正常投产。 */
export interface FactoryBranch {
    sourceUid: number;
    owner: 'county' | 'private';
}

/** 招商的厂施工期间记着：建成后是私营、让不让税、带不带工人（D032） */
export interface DealOwner {
    company: string;
    taxBreak: boolean;
    workers: number;
    workerEdu: Education;
}

/** 招商意向（DESIGN 20） */
export interface Offer {
    id: number;
    company: string;
    defId: string;
    /** 供地：对方交的土地出让金 */
    landFee: number;
    /** 补贴：交地时我们出的钱（D032：补贴路线也盖楼，没有出让金） */
    subsidy: number;
    /** 补贴路线：厂建成时对方带来几位熟练工人 */
    workers: number;
    workerEdu: Education;
    /** 对方要求县里至少有几个能招的工人（供地时检查） */
    needLabor: number;
    /** 到哪个月失效 */
    until: number;
}

/** 幸福度的一项：正数加分、负数扣分（相对基准 50） */
export interface MoodPart {
    key: string;                 // work / commute / shops / missed / crowd / env / services / vehicle / tax / idle
    label: string;               // 「有工作」「上班太远」
    value: number;
}

/**
 * 给画面层的通知（D026，DESIGN 16.4 / 16.5）：公告栏、大公示用。
 * arrive = 有人来；leave = 有人走；warn = 有人想走；stay = 被挽留下来；info = 其他
 */
export interface Notice {
    kind: 'arrive' | 'leave' | 'warn' | 'stay' | 'layoff' | 'info' | 'wish' | 'wishDone' | 'research' | 'levelUp'
        | 'complete' | 'street' | 'renovate' | 'offer' | 'deal';
    text: string;
    residentIds: number[];
    /** 来的理由 / 走的原因 */
    reason?: string;
}

export interface LifeEvent {
    month: number;               // 绝对月份
    text: string;                // "入职 纺织厂·车间工人"
}

/** 一栋建筑在模拟层里的状态（位置、朝向仍归 TownModel 管，用 uid 对上） */
export interface BuildingSim {
    uid: number;
    defId: string;
    branchOf?: number;           // 开分厂时的原厂 uid
    residentIds: number[];       // 住户
    workerIds: number[];         // 员工
    lastRevenue: number;         // 上月营业额 / 产值
    lastCustomers: number;       // 上月服务人次
    lastTax: number;             // 上月上交
    reputation: number;          // 口碑 0..100（店铺升级用，M4）
    /**
     * 真实账目（D026，DESIGN 25）。以下字段旧存档没有，读档时补默认值。
     * 谁的楼：county = 玩家（县里）盖的，利润 / 亏损进财政；private = 招商来的企业，利润归对方（流出县外）
     */
    owner?: 'county' | 'private';
    lastWages?: number;          // 上月发的工资
    lastCost?: number;           // 上月进货 / 原料成本（流出县外）
    lastUpkeep?: number;         // 上月维护费（经营性建筑自己付）
    lastProfit?: number;         // 上月利润 = 营业额 − 工资 − 成本 − 税 − 维护（可为负）
    lastOutside?: number;        // 上月营业额里县外客人（过路客）贡献的部分
    lossMonths?: number;         // 连续亏损几个月（≥3 裁员）
    taxBreakUntil?: number;      // 招商让税：这个月之前企业税减半（D026）
    freezeMonths?: number;       // 裁员后暂停招人还剩几个月
}

/** 每种建筑的经营数据，来自配置表（DESIGN 4） */
export interface BuildingEcon {
    id: string;
    cost: number;
    upkeep: number;
    housing: number;
    jobs: JobSlot[];
    demand: Demand | null;
    capacity: number;            // 每月最多服务人次
    price: number;               // 客单价
    /** 店铺辐射半径：步行沿道路几格，有车的人乘交通倍率（feat/shop-radius 的半径部分）。0 = 用 serviceRadius */
    radius: number;
    env: number;                 // 对周边环境
    unlock: TownLevel;
    publicJob: boolean;          // 岗位工资由财政发（学校、卫生院、发展中心）
    /** 工期（天 = 月），0 = 立刻建成（道路、树）。D026 */
    buildDays: number;
    canOpenBranch?: boolean;
    /** 住房（D026，DESIGN 23）：每个成年住户每月房租（0 = 用 rentPerPerson）、等级 1～5、幸福度加成 */
    rent: number;
    homeLevel: number;
    homeMood: number;
    /** 住户攒够钱可以自己翻盖成什么（'' = 不能）；selfBuilt = 只能翻盖得到，玩家不能直接盖 */
    upgradeTo: string;
    selfBuilt: boolean;
    /** 成本率：营业额里多少是进货 / 原料成本，流出县外（D026） */
    costRate: number;
    /** 办婚宴（大酒楼）：县里有人结婚就来这里办酒，一桌酒席多少钱；0 = 不办。新建筑第一批 */
    wedding?: number;
    /** 地标带客（老街）：boostRadius 格内的店过路客 ×boostMult；buzz = 每月口碑 + */
    boostRadius?: number;
    boostMult?: number;
    buzz?: number;
}

export interface JobSlot {
    title: string;
    count: number;
    salary: number;
    edu: Education;
}

export interface Finance {
    funds: number;               // 建设资金
    taxRate: { business: number; industry: number; income: number };
    lastMonth: MonthlyReport | null;
}

export interface MonthlyReport {
    month: number;
    /** business / industry / income = 三种税；profit = 县属店铺工厂的经营利润（可为负）；rent = 县属住房房租 */
    income: { business: number; industry: number; income: number; land: number; investment: number; profit: number; rent: number };
    /** research = 研究费（D026），services = 公共服务（T532），旧存档没有 */
    expense: { construction: number; upkeep: number; publicWages: number; pension: number; promotion: number; research?: number; services?: number; talent?: number };
    populationBefore: number;
    populationAfter: number;
    events: LifeEvent[];         // 本月全县大事记（结婚、迁入、离开……）
    /** 本月的通知（D026）。旧存档 / MockSim 没有 */
    notices?: Notice[];
}

/**
 * 一个月里县里的钱和县外的进出（D026 真实账目，守恒测试用）。
 * 县内的钱 = 财政 + 全体居民存款；它的变化必须正好等于 inflow 合计 − outflow 合计。
 */
export interface MoneyFlows {
    inflow: { exports: number; outsideCustomers: number; immigrants: number; bailout: number; grants: number; investment: number };
    outflow: { goodsCost: number; upkeep: number; construction: number; fuel: number; leavers: number; privateProfit: number; research: number; subsidy: number; talent: number };
}

export interface SimState {
    version: 1;
    seed: number;
    rngState: number;            // 随机数生成器当前状态，存档后接着算结果一致
    month: number;               // 绝对月份，0 = 第 1 年 1 月
    level: TownLevel;
    residents: Resident[];
    buildings: BuildingSim[];
    finance: Finance;
    nextResidentId: number;
    /** 已经能盖的建筑 id（初始解锁 + 研究出来的）。旧存档没有：读档时按城镇等级补（D026） */
    unlocked?: string[];
    /** 研究完的项目 id */
    researched?: string[];
    /** 正在研究的项目（D030 起可并行：数组，最多 = 研究位数） */
    research?: { id: string; left: number; total: number }[] | null;
    /** 已开通的研究位（1～3，D030）。旧存档没有：按 1 算 */
    researchSlots?: number;
    /** 人才引进冷却到哪一天（绝对月序号，D030）。没到就再招不了 */
    talentReadyAt?: number;
    /** 招过几次人才（统计用） */
    talentHires?: number;
    /** 累计实现的心愿数（阶段目标用） */
    wishesDone?: number;
    /** 凑成的特色街道（每月重算，DESIGN 21） */
    streets?: { kind: string; uids: number[] }[];
    /** 住户自家翻盖中（D026，DESIGN 23）：完工后 defId 换成 to。startAt = 开工时本月的进度（0..1） */
    renovations?: { uid: number; to: string; left: number; total: number; startAt?: number }[];
    /** 招商意向（DESIGN 20） */
    offers?: Offer[];
    /** 签约成功、等玩家选址交地的那一份（D032：供地、补贴都要选址；mode 旧存档没有 = land） */
    pendingDeal?: PendingDeal | null;
    dealsDone?: number;
    nextOfferId?: number;
    /**
     * 施工中的楼（D026，DESIGN 24）：完工前不进 buildings，不住人、不招工。旧存档没有。
     * startAt = 开工那一刻本月的进度（0..1）：进度条和工期都从这一刻算，不从月初算。
     */
    construction?: { uid: number; defId: string; left: number; total: number; startAt?: number; branch?: FactoryBranch; deal?: DealOwner }[];
    /** 口碑（D026，DESIGN 16.2）：满足心愿 +，有人走 −，每月衰减；加在迁入吸引力上。旧存档没有 = 0 */
    buzz?: number;
}

/** 年月显示用 */
export function monthLabel(month: number): string {
    return `${Math.floor(month / 12) + 1} 年 ${(month % 12) + 1} 月`;
}
