import { BuildingSim, Education, MonthlyReport, Resident, SimState, TownLevel } from './types';

/**
 * 画面层调用模拟层的唯一入口（合同，见 docs/PARALLEL.md）。
 * 支线 A（模拟）负责实现 Simulation；支线 B（界面）只依赖这个接口，
 * 开发期用 MockSim（mock.ts）顶着。
 */
export interface SimApi {
    readonly state: SimState;

    /** 推进一个月，返回本月账单 */
    stepMonth(): MonthlyReport;

    /**
     * 玩家盖了一栋（TownModel.place 成功后调）。资金不够返回 false，调用方应撤销放置。
     * dayProgress = 盖下的这一刻本月走到了哪儿（0..1，DayClock.progress）：工期从这里算起，不从月初算。
     */
    onBuilt(uid: number, defId: string, dayProgress?: number): boolean;
    /** 玩家拆了一栋 */
    onDemolished(uid: number): void;
    /**
     * 施工进度（D026）：0..1，已完工或不在施工返回 null。
     * 进度 = (现在 − 开工时刻) / 工期；现在 = month + dayProgress（dayProgress 由画面层传 DayClock.progress）。
     */
    constructionProgress?(uid: number, dayProgress: number): number | null;
    // ── D026 第二批：研究 / 阶段目标（可选，MockSim 不实现）──
    /** 这种建筑能不能盖（研究过 / 初始解锁） */
    isUnlocked?(defId: string): boolean;
    /** 研究列表 + 每项现在的状态 */
    researchList?(): ResearchStatus[];
    /** 开始研究：成功 null，失败返回原因 */
    startResearch?(id: string): string | null;
    // ── D030：并行研究 / 加速研究 / 人才引进 ──
    /** 研究位：已开通几个、最多几个、下一个多少钱（null = 开满了） */
    researchSlots?(): { used: number; total: number; nextCost: number | null };
    /** 开通一个研究位：成功 null，失败返回原因 */
    openResearchSlot?(): string | null;
    /** 加速研究（花钱立刻完成）：成功 null，失败返回原因 */
    rushResearch?(id: string): string | null;
    /** 人才引进：招一批某个学历的人。成功 null，失败返回原因 */
    hireTalents?(edu: Education): string | null;
    /** 人才引进现在能不能招、各档价格 */
    talentStatus?(): { ready: boolean; reason: string; nextCost: number[] };
    /** 当前等级的阶段目标和进度 */
    goals?(): GoalStatus[];
    /** 目标全部完成：升级。返回新等级，不能升返回 null */
    upgradeLevel?(): TownLevel | null;
    // ── D026 第三、四批（可选）──
    /** 特色街道图鉴：每种的组合、效果、凑成了几条 */
    streetBook?(): StreetStatus[];
    /** 放置预览提示：在 (col,row) 盖 defId 能不能凑成 / 差一栋凑成特色街道；没有返回 null */
    streetHint?(defId: string, col: number, row: number, w: number, h: number): string | null;
    /** 某种建筑对周边环境的影响（DESIGN 22），放置预览画污染范围用 */
    buildingEnv?(defId: string): number;
    /** 某格的环境分（正 = 好，负 = 污染） */
    envAt?(col: number, row: number): number;
    /** 覆盖范围（T538）：在 (col,row) 盖 defId，沿路能服务到哪些路、哪些住宅；不是店 / 学校 / 卫生院返回 null */
    serviceReach?(defId: string, col: number, row: number, w: number, h: number): ServiceReach | null;
    /** 覆盖范围（T538）：这位居民的店 / 学校 / 卫生院心愿要的范围（从他家沿路算）；没有这类心愿返回 null */
    wishReach?(residentId: number): ServiceReach | null;
    /** 营商环境分项和总分（0～100） */
    businessEnv?(): { total: number; parts: { label: string; value: number; max: number }[] };
    /** 招商：签约。mode = land 供地 / subsidy 补贴（两条都要选址盖楼，D032）；成功 null，失败返回理由 */
    acceptOffer?(offerId: number, mode: 'land' | 'subsidy', taxBreak: boolean): string | null;
    /** 某份意向的成功率（0～1）；mode 不传按供地算 */
    offerChance?(offerId: number, taxBreak: boolean, mode?: 'land' | 'subsidy'): number;
    /** 签约前检查：这条路线现在能不能签，不能的话差什么（能签返回 ''）。确认卡片把按钮变灰用 */
    offerBlock?(offerId: number, mode: 'land' | 'subsidy'): string;
    /** 放弃选址（这份签约作废） */
    cancelPendingDeal?(): void;
    /** 能不能盖（资金、城镇等级） */
    canAfford(defId: string): boolean;

    resident(id: number): Resident | null;
    building(uid: number): BuildingSim | null;
    /** 某种建筑的客单价（消费时飘字用）；不是消费型建筑返回 0 */
    buildingPrice?(defId: string): number;
    /** 汇总：人口、就业率、平均工资、平均储蓄、平均心情 */
    summary(): SimSummary;

    /** 月结算后的回调（顶栏、账单、行人刷新用） */
    onMonth: ((report: MonthlyReport) => void) | null;
}

export interface ResearchStatus {
    id: string;
    name: string;
    unlocks: string[];
    cost: number;
    days: number;
    level: TownLevel;
    /** done 研究完 / active 正在研究 / ready 可以研究 / locked 条件没满足 */
    state: 'done' | 'active' | 'ready' | 'locked';
    /** locked 的原因（「人口要到 20」「县里要有烧烤摊」），active 时是进度 0..1 的文字 */
    reason: string;
    /** active 时的进度 0..1（按整天算） */
    progress: number;
}

export interface StreetStatus {
    id: string;
    name: string;
    members: string[];
    effect: string;
    /** 凑成了几条 */
    count: number;
    /** 组合里哪些建筑还没研究 */
    lockedMembers: string[];
}

export interface GoalStatus {
    text: string;
    value: number;
    target: number;
    done: boolean;
}

export interface SimSummary {
    population: number;
    employed: number;
    workingAge: number;
    avgSalary: number;
    avgSavings: number;
    avgMood: number;
    /** 有交通工具（非步行）的人数（D022） */
    vehicles: number;
}

/** 覆盖范围高亮（T538）：沿路走 radius 步以内 */
export interface ServiceReach {
    radius: number;
    /** 走得到的道路格 [col, row] */
    roads: [number, number][];
    /** 范围内的住宅 uid（放置预览）/ 他家（心愿） */
    homes: number[];
    /** 店：居民有车时范围更大（radius 是步行的） */
    byVehicle: boolean;
}
