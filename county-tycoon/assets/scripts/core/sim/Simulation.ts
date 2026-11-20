import { Employer, JobReferral, GoalStatus, ResearchStatus, ServiceReach, SimApi, SimSummary, StreetStatus } from './SimApi';
import { ResearchDef, SimConfig, StreetDef, VEHICLE_ORDER, VehicleTier } from './config';
import { chance, nextFloat, nextInt, rngFromSeed } from './rng';
import { Reach, TownView } from './townView';
import { assignJob, clearJob, openingsFor, staffing, totalPositions, positionsOf, Opening } from './labor';
import { consumeForResident, shopCapacity, shopRadius } from './consumption';
import { buildWorld, World } from './world';
import { makeName } from './names';
import {
    BuildingEcon, BuildingSim, DealOwner, FactoryBranch, Education, MoneyFlows, PendingDeal, MoodPart, Notice, Wish, WishKind, Demand, LifeEvent, MonthlyReport, Resident, SimState, TownLevel, Vehicle,
} from './types';

/**
 * 真模拟（DESIGN 1～3）。
 *
 * 规则：
 *   - 不 import 'cc'，配置和地图都从构造参数进来，node 下能直接跑。
 *   - 一切随机走 rng.ts，状态存在 SimState.rngState，同种子同操作结果完全一样。
 *   - 每月结算顺序照 DESIGN 1 固定下来，`stepMonth()` 里一步步看得见。
 *   - 只写 SimState 里合同规定的字段；"这个月没买到东西""心情差了几个月"
 *     这类临时状态放在实例的 Map 里，不进存档（读档后从头累计，无关紧要）。
 */
/** 学校 / 卫生院的服务范围（格，沿路）：心愿和覆盖范围高亮共用 */
const SCHOOL_RANGE = 10;
const CLINIC_RANGE = 8;
/** 派出所 / 广场：家在范围内心情 +（幸福度分项「附近有…」） */
const POLICE_RANGE = 10;
const PLAZA_RANGE = 6;
/** 幼儿园：家里有 0～6 岁孩子、范围内有幼儿园 → 幸福度 +（D034） */
const KINDERGARTEN_RANGE = 8;

export class Simulation implements SimApi {
    readonly state: SimState;
    onMonth: ((report: MonthlyReport) => void) | null = null;

    private readonly _cfg: SimConfig;
    private readonly _town: TownView;
    private _rng: { state: number };
    /** 本月盖楼花掉的钱（进月账单的 expense.construction） */
    private _constructionSpent = 0;
    /** 本月研究费（开始研究时已经扣了，账单里记一笔） */
    private _researchSpent = 0;
    /** 本月人才引进花的钱（D030） */
    private _talentSpent = 0;
    /** 本月招商：土地出让金收入、补贴支出（发生时已进出财政，账单里记一笔） */
    private _investIncome = 0;
    private _subsidySpent = 0;
    /** 招商来的、还在施工的楼：uid → 让不让税（完工时记成私营）。存档里靠 construction + owner 恢复不了，读档后当县属 */
    /** 本月每家店服务人次 / 营业额 / 在岗人数 */
    private readonly _served = new Map<number, number>();
    private readonly _revenue = new Map<number, number>();
    private readonly _staff = new Map<number, number>();
    /** 本月每栋楼发出的工资（私营 + 县属经营性建筑；公共岗位走财政） */
    private readonly _wages = new Map<number, number>();
    /** 县里的钱和县外的进出（D026）。从上次结算之后开始累计，结算时交给 lastFlows 再清零 */
    private _flows: MoneyFlows = Simulation.emptyFlows();
    /** 上一个月的县外进出（守恒测试、账单用） */
    lastFlows: MoneyFlows = Simulation.emptyFlows();

    static emptyFlows(): MoneyFlows {
        return {
            inflow: { exports: 0, outsideCustomers: 0, immigrants: 0, bailout: 0, grants: 0, investment: 0 },
            outflow: { goodsCost: 0, upkeep: 0, construction: 0, fuel: 0, leavers: 0, privateProfit: 0, research: 0, subsidy: 0, talent: 0 },
        };
    }

    /** 县内的钱 = 财政 + 全体居民存款（守恒测试用） */
    moneyInCounty(): number {
        let m = this.state.finance.funds;
        for (const r of this.state.residents) m += r.savings;
        return m;
    }
    /** 本月每人没买到东西的需求类数（心情用） */
    private readonly _missed = new Map<number, number>();
    /** 每人心情低于线的连续月数 */
    private _events: LifeEvent[] = [];
    private _notices: Notice[] = [];
    /** 沿路距离缓存，每月清一次 */
    private readonly _distCache = new Map<string, number>();
    /** 每个家（按消费半径）能覆盖到哪几类消费，每月清一次。key = `uid:半径` */
    private readonly _homeCoverage = new Map<string, Set<Demand>>();
    /** 每个家周围的环境分，每月清一次 */
    private readonly _homeEnv = new Map<number, number>();

    /**
     * 新游戏：`new Simulation(cfg, town, { seed })`。
     * 读档：`new Simulation(cfg, town, { state: save.sim })`——直接接管这份 SimState（原地归一化，
     * 补上旧存档缺的字段），随机数从 `state.rngState` 接着算，不再登记开局建筑和开局居民。
     */
    constructor(cfg: SimConfig, town: TownView, opts?: { seed?: number; opening?: boolean; state?: SimState }) {
        this._cfg = cfg;
        this._town = town;
        if (opts?.state) {
            this.state = normalizeSimState(opts.state, cfg);
            this._rng = { state: (this.state.rngState >>> 0) || 1 };
            this.syncRng();
            return;
        }
        const seed = opts?.seed ?? 20260101;
        this._rng = rngFromSeed(seed);
        this.state = {
            version: 1,
            seed,
            rngState: this._rng.state,
            month: 0,
            level: 'village',
            residents: [],
            buildings: [],
            finance: { funds: cfg.economy.startFunds, taxRate: { ...cfg.economy.taxRate }, lastMonth: null },
            nextResidentId: 1,
        };
        if (cfg.progress) {
            this.state.unlocked = cfg.progress.initialUnlocked.slice();
            this.state.researched = [];
            this.state.research = null;
            this.state.wishesDone = 0;
        }
        // 地图上已经有的建筑（开局自带的自建房等）先登记，等人搬进来
        this.adoptExistingBuildings();
        if (opts?.opening !== false) this.spawnOpeningResidents();
        this.syncRng();
    }

    // ───────────────────────────── 对外接口（SimApi） ─────────────────────────────

    stepMonth(): MonthlyReport {
        const s = this.state;
        s.month++;
        this._served.clear();
        this._revenue.clear();
        this._staff.clear();
        this._wages.clear();
        this._missed.clear();
        this._events = [];
        this._notices = [];
        s.buzz = (s.buzz ?? 0) * (1 - this._cfg.economy.buzzDecay);
        this._distCache.clear();
        this._homeCoverage.clear();
        this._homeEnv.clear();

        const populationBefore = s.residents.length;
        this.finishConstruction();
        this.advanceResearch();

        this.ageEveryone();                       // 生日：长一岁、上学、退休、离世
        const world = this.refreshWorld();
        this.detectStreets();                     //    特色街道（D026）
        this.landmarkBuzz();                      //    老街口碑
        this.assignHomes(s.residents.filter((r) => r.homeId === null));
        this.fillVacancies(world);                // 月初先把空岗填上（新盖的楼、新来的人）
        this.measureStaff(world);
        this.payWages(world);                     // 1. 上班领工资
        this.runConsumption(world);               // 2. 消费
        const { income, expense } = this.settleFinance(world);  // 3. 交租交税、财政支出
        this.updateResidents(world, income);      // 4. 心情、找工作、买车、结婚生子
        this.updateWishes(world);                 //    心愿（D026）
        this.updateDepartures();                  // 最后一个月达成心愿也有机会留下
        this.renovateHomes();                     //    住户自家翻盖（D026）
        this.moveToBetterHomes();                 //    搬去更好的房子
        this.assessBuildings(world);              //    店铺口碑
        this.runImmigration(world);               // 5. 迁入
        this.updateOffers();                      //    招商意向（D026）
        if (!this._cfg.progress) this.updateLevel();   // 有阶段目标时改为玩家手动「申请升级」（D026）

        const report: MonthlyReport = {
            month: s.month,
            income,
            expense,
            populationBefore,
            populationAfter: s.residents.length,
            events: this._events.slice(),
            notices: this._notices.slice(),
        };
        s.finance.lastMonth = report;
        this.lastFlows = this._flows;
        this._flows = Simulation.emptyFlows();
        this.syncRng();
        if (this.onMonth) this.onMonth(report);
        return report;
    }

    /**
     * dayProgress = 盖下去的这一刻本月已经走到哪儿（0..1，GameRoot 传 DayClock.progress）。
     * 工地记下这个绝对时刻，工期和进度条都从它算起——不从月初算（不然下午开工的 1 天楼
     * 一出现进度条就半满，而且月底动的工下月初就完工，等于工期缩水）。
     */
    onBuilt(uid: number, defId: string, dayProgress = 0, branchOf?: number): boolean {
        const econ = this._cfg.building(defId);
        const s = this.state;
        if (s.buildings.some((b) => b.uid === uid) || s.construction?.some((c) => c.uid === uid)) return true;
        if (!this.isUnlocked(defId)) return false;   // 没研究过（D026）
        if (econ && econ.selfBuilt) return false;     // 只能住户自己翻盖得到
        const deal = s.pendingDeal && s.pendingDeal.defId === defId ? s.pendingDeal : null;
        const source = branchOf === undefined ? null : this.building(branchOf);
        if (branchOf !== undefined && (!source || source.defId !== defId || !this.branchOffer(branchOf) || deal)) return false;
        // 招商（D032）：对方出钱盖；补贴路线交地时我们拨补贴款
        const cost = deal ? dealCost(deal) : econ ? econ.cost : 0;
        if (cost > s.finance.funds) return false;

        s.finance.funds -= cost;
        if (deal) {
            this._subsidySpent += cost;
            this._flows.outflow.subsidy += cost;
        } else {
            this._constructionSpent += cost;
            this._flows.outflow.construction += cost;     // 施工队、建材都在县外（D026）
        }
        const owner = deal ? this.closeLandDeal(deal) : undefined;
        const branch: FactoryBranch | undefined = source ? { sourceUid: source.uid, owner: source.owner ?? 'county' } : undefined;
        // 有工期的先进工地，完工那天才变成能用的楼（D026，DESIGN 24）
        const days = econ ? econ.buildDays : 0;
        if (days > 0) {
            const c: NonNullable<SimState['construction']>[number] = { uid, defId, left: days, total: days, startAt: s.month + clamp01(dayProgress) };
            if (branch) c.branch = branch;
            if (owner) c.deal = owner;   // 记在工地上：施工中途存档也不丢
            (s.construction ??= []).push(c);
            this._town.refresh?.();   // 工地也占着路边：特色街道提示要算到它
            this.syncRng();
            return true;
        }
        this._town.refresh?.();
        this.openBuilding(uid, defId, owner, branch);
        // 有了新楼，先把没工作的人配上去（不等下个月）
        const world = this.refreshWorld();
        this.fillVacancies(world);
        this.syncRng();
        return true;
    }

    onDemolished(uid: number): void {
        this._town.refresh?.();
        this._distCache.clear();
        const s = this.state;
        if (s.construction && s.construction.some((c) => c.uid === uid)) {
            s.construction = s.construction.filter((c) => c.uid !== uid);   // 拆工地：钱不退
            return;
        }
        const b = s.buildings.find((x) => x.uid === uid);
        if (!b) return;
        for (const id of b.workerIds.slice()) {
            const r = s.residents.find((x) => x.id === id);
            if (r && r.jobId === uid) clearJob(r, null);
        }
        for (const id of b.residentIds.slice()) {
            const r = s.residents.find((x) => x.id === id);
            if (r && r.homeId === uid) r.homeId = null;
        }
        s.buildings = s.buildings.filter((x) => x.uid !== uid);
        // 被拆掉的楼里的人另找房子
        const world = this.refreshWorld();
        this.assignHomes(s.residents.filter((r) => r.homeId === null));
        this.syncRng();
    }

    constructionProgress(uid: number, dayProgress: number): number | null {
        const s = this.state;
        const c = s.construction?.find((x) => x.uid === uid) ?? s.renovations?.find((x) => x.uid === uid);
        if (!c) return null;
        const start = constructionStart(s, c);
        // 分母用「开工到完工结算那一刻」的实际时长：完工只在月初结算，月中开的工要多跨一点
        // 才凑满整月。不这么算的话进度条会先顶到 100% 干等一截。
        return Math.max(0, Math.min(1, (s.month + clamp01(dayProgress) - start) / constructionSpan(s, c)));
    }

    // ───────────────────────────── 研究 / 目标 / 升级（D026，DESIGN 18、19） ─────────────────────────────

    isUnlocked(defId: string): boolean {
        if (!this._cfg.progress) return true;
        if (this.state.pendingDeal && this.state.pendingDeal.defId === defId) return true;
        return (this.state.unlocked ?? []).indexOf(defId) >= 0;
    }

    /** 这项研究的前置条件哪一条没满足（全满足返回 ''） */
    private researchBlock(r: ResearchDef): string {
        const s = this.state;
        if (LEVEL_ORDER.indexOf(s.level) < LEVEL_ORDER.indexOf(r.level)) return `${LEVEL_NAME[r.level]}才能研究`;
        if (r.needPop > 0 && s.residents.length < r.needPop) return `人口要到 ${r.needPop}（现在 ${s.residents.length}）`;
        if (r.needBuilding.length && !s.buildings.some((b) => r.needBuilding.indexOf(b.defId) >= 0)) {
            return `县里要先有${r.needBuilding.map((id) => this.buildingName(id)).join('或')}`;
        }
        if (r.needEdu) {
            const n = s.residents.filter((p) => p.education >= r.needEdu!.edu && p.age >= this._cfg.economy.residents.workMinAge).length;
            if (n < r.needEdu.count) return `要有 ${r.needEdu.count} 位${EDU_NAME[r.needEdu.edu]}以上学历的居民（现在 ${n}）`;
        }
        return '';
    }

    researchList(): ResearchStatus[] {
        const p = this._cfg.progress;
        if (!p) return [];
        const s = this.state;
        const done = new Set(s.researched ?? []);
        const running = s.research ?? [];
        return p.research.map((r) => {
            let state: ResearchStatus['state'];
            let reason = '';
            let progress = 0;
            const act = running.find((x) => x.id === r.id);
            if (done.has(r.id)) state = 'done';
            else if (act) {
                state = 'active';
                progress = (act.total - act.left) / act.total;
                reason = `还要 ${act.left} 天`;
            } else {
                reason = this.researchBlock(r);
                state = reason ? 'locked' : 'ready';
            }
            return { id: r.id, name: r.name, unlocks: r.unlocks.slice(), cost: r.cost, days: r.days, level: r.level, state, reason, progress };
        });
    }

    /** 研究位（D030）：已开通几个、最多几个、下一个多少钱 */
    researchSlots(): { used: number; total: number; nextCost: number | null } {
        const s = this.state;
        const total = Math.max(1, Math.min(MAX_SLOTS, s.researchSlots ?? 1));
        const cost = SLOT_COSTS[total] ?? null;   // 下一个位的价格
        return { used: (s.research ?? []).length, total, nextCost: cost };
    }

    /** 开通一个研究位（D030） */
    openResearchSlot(): string | null {
        const s = this.state;
        const cur = Math.max(1, Math.min(MAX_SLOTS, s.researchSlots ?? 1));
        if (cur >= MAX_SLOTS) return '研究位已开满';
        const cost = SLOT_COSTS[cur];
        if (cost === null || cost === undefined) return '研究位已开满';
        if (s.finance.funds < cost) return `建设资金不够（还差 ¥${cost - s.finance.funds}）`;
        s.finance.funds -= cost;
        this._researchSpent += cost;
        this._flows.outflow.research += cost;
        s.researchSlots = cur + 1;
        this.event(`开通了第 ${cur + 1} 个研究位，可以同时研究 ${cur + 1} 项`);
        return null;
    }

    /** 加速研究：花钱让这项立刻完成（D030），价格 = 剩余天数 × 每天研究费 */
    rushResearch(id: string): string | null {
        const p = this._cfg.progress;
        if (!p) return '没有研究';
        const s = this.state;
        const act = (s.research ?? []).find((x) => x.id === id);
        if (!act) return '这项没在研究';
        const r = p.research.find((x) => x.id === id);
        if (!r) return '没有这项研究';
        const cost = rushCost(r, act.left);
        if (s.finance.funds < cost) return `建设资金不够（还差 ¥${cost - s.finance.funds}）`;
        s.finance.funds -= cost;
        this._researchSpent += cost;
        this._flows.outflow.research += cost;
        act.left = 0;
        this.finishResearch(act, r);
        return null;
    }

    startResearch(id: string): string | null {
        const p = this._cfg.progress;
        if (!p) return '没有研究';
        const r = p.research.find((x) => x.id === id);
        const s = this.state;
        if (!r) return '没有这项研究';
        if ((s.researched ?? []).indexOf(id) >= 0) return '已经研究过了';
        if ((s.research ?? []).some((x) => x.id === id)) return '这项正在研究';
        const slots = Math.max(1, Math.min(MAX_SLOTS, s.researchSlots ?? 1));
        if ((s.research ?? []).length >= slots) {
            return slots >= MAX_SLOTS ? '研究位都占满了，等一项做完' : '研究位都占满了（可以在上面再开一个研究位）';
        }
        const block = this.researchBlock(r);
        if (block) return block;
        if (s.finance.funds < r.cost) return `建设资金不够（还差 ¥${r.cost - s.finance.funds}）`;
        s.finance.funds -= r.cost;
        this._researchSpent += r.cost;
        this._flows.outflow.research += r.cost;   // 请县外的专家，钱流出县外
        (s.research ??= []).push({ id, left: r.days, total: r.days });
        return null;
    }

    /** 新的一天：每一项研究进度 −1，到 0 解锁（D030 起可以同时跑多项） */
    private advanceResearch(): void {
        const s = this.state;
        const p = this._cfg.progress;
        if (!p || !s.research || !s.research.length) return;
        const still: NonNullable<typeof s.research> = [];
        const finished = new Set<string>();
        for (const act of s.research) {
            act.left--;
            if (act.left > 0) { still.push(act); continue; }
            const r = p.research.find((x) => x.id === act.id);
            if (r && !finished.has(r.id)) { finished.add(r.id); this.unlockResearch(r); }
        }
        s.research = still.length ? still : null;
    }

    /** 一项研究完成：记进已研究、解锁建筑、播公告。加速研究也走这里 */
    private finishResearch(act: { id: string; left: number; total: number }, r: ResearchDef): void {
        const s = this.state;
        s.research = (s.research ?? []).filter((x) => x !== act);
        if (!s.research.length) s.research = null;
        if ((s.researched ?? []).indexOf(r.id) >= 0) return;
        this.unlockResearch(r);
    }

    private unlockResearch(r: ResearchDef): void {
        const s = this.state;
        (s.researched ??= []).push(r.id);
        const un = (s.unlocked ??= []);
        for (const id of r.unlocks) if (un.indexOf(id) < 0) un.push(id);
        this.notice('research', `研究完成：${r.name}，现在可以盖了`, []);
        this.event(`研究完成：${r.name}`);
    }

    goals(): GoalStatus[] {
        const p = this._cfg.progress;
        if (!p) return [];
        const list = p.goals[this.state.level] ?? [];
        const s = this.state;
        const sum = this.summary();
        return list.map((g) => {
            let value = 0;
            switch (g.kind) {
                case 'pop': value = s.residents.length; break;
                case 'research': value = (s.researched ?? []).length; break;
                case 'wishes': value = s.wishesDone ?? 0; break;
                case 'mood': value = sum.population ? sum.avgMood : 0; break;
                case 'roads': value = this._town.allBuildings().filter((b) => b.road).length; break;
                case 'streets': value = (s.streets ?? []).length; break;
                case 'deals': value = s.dealsDone ?? 0; break;
                case 'building': value = s.buildings.filter((b) => g.of.indexOf(b.defId) >= 0).length; break;
                case 'employment': {
                    const want = s.residents.filter((r) => r.age >= this._cfg.economy.residents.workMinAge
                        && r.age < this._cfg.economy.residents.retireAge && !r.idle).length;
                    value = want ? Math.round(s.residents.filter((r) => r.jobId !== null).length / want * 100) / 100 : 0;
                    break;
                }
            }
            return { text: g.text, value, target: g.target, done: value >= g.target };
        });
    }

    upgradeLevel(): TownLevel | null {
        const s = this.state;
        const g = this.goals();
        const idx = LEVEL_ORDER.indexOf(s.level);
        if (!g.length || !g.every((x) => x.done) || idx >= LEVEL_ORDER.length - 1) return null;
        s.level = LEVEL_ORDER[idx + 1];
        const reward = this._cfg.progress?.levelReward[s.level] ?? 0;
        if (reward > 0) {
            s.finance.funds += reward;
            this._flows.inflow.grants += reward;   // 上级的发展奖励，县外来的钱
        }
        this.event(`县城升级为「${LEVEL_NAME[s.level]}」`);
        this.notice('levelUp', `咱们升级成「${LEVEL_NAME[s.level]}」了！${reward ? `上级奖励建设资金 ¥${reward}` : ''}`, []);
        return s.level;
    }

    // ───────────────────────────── 心愿（D026，DESIGN 17） ─────────────────────────────

    /** 这个人现在有哪些可以提的心愿（按优先级） */
    private wishCandidates(r: Resident, world: World): Omit<Wish, 'since' | 'until'>[] {
        const out: Omit<Wish, 'since' | 'until'>[] = [];
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        if (r.homeId === null || r.age < rt.workMinAge) return out;

        // 1. 找工作
        if (r.jobId === null && !r.idle && r.age < rt.retireAge) {
            out.push(this.jobWish(r, world));
        }
        // 2. 孩子上学
        const kid = r.childIds.map((id) => this.resident(id)).find((c) => c && c.age >= rt.schoolMinAge && c.age <= rt.schoolMaxAge);
        if (kid && !this.hasNearby(r.homeId, 'school', SCHOOL_RANGE)) {
            out.push({ kind: 'school', text: `${kid.name}到上学的年纪了，附近没有学校`, ...this.suggestFor(['school'], `在他家 ${SCHOOL_RANGE} 格内建一所学校`), radius: SCHOOL_RANGE });
        }
        // 3. 老人看病
        if (r.age >= rt.retireAge && !this.hasNearby(r.homeId, 'clinic', CLINIC_RANGE)) {
            out.push({ kind: 'clinic', text: '年纪大了，想离卫生院近一点', ...this.suggestFor(['clinic'], `在他家 ${CLINIC_RANGE} 格内盖一间卫生院`), radius: CLINIC_RANGE });
        }
        // 4. 附近缺店
        for (const d of DEMAND_ORDER) {
            if (this.hasShopInCircle(r.homeId, d, world)) continue;
            const ids = this.shopsOf(d);
            if (!ids.length) continue;
            out.push({ kind: 'shop', demand: d, text: WISH_SHOP_TEXT[d],
                hint: this.shopList(ids), suggest: ids.find((id) => this.isUnlocked(id)) ?? '', radius: this.shoppingRadius });
        }
        // 5. 上班太远
        if (r.jobId !== null) {
            const dist = this.distance(r.homeId, r.jobId);
            const comfort = cfg.commuteComfort * this.tier(r).range;
            if (isFinite(dist) && dist > comfort + 3) {
                out.push({ kind: 'commute', text: '上班太远了，每天来回走好久', hint: '在他家附近盖有岗位的店或厂，或者让他搬近一点', suggest: '', radius: Math.round(comfort) });
            }
        }
        // 6. 环境
        if (this.homeEnv(r.homeId) < 0) {
            out.push({ kind: 'env', text: '家附近有工厂，又吵又脏', ...this.suggestFor(['tree', 'plaza'], '在他家附近种树、建广场'), radius: 3 });
        }
        // 7. 想住好房子：存款够、家里房子等级低、县里没有更好的空房
        const home = world.buildingByUid.get(r.homeId);
        const he = home ? this._cfg.building(home.defId) : null;
        if (he && he.homeLevel <= 2 && ((r.moodParts ?? []).some((p) => p.value < 0 && (p.key === 'home' || p.key === 'crowd')) || (r.savings >= 20000 && !this.betterHomeFor(r, he.homeLevel, 1)))) {
            const renovation = this.housingHint(r.homeId);
            const housing = renovation ? { hint: renovation, suggest: '' } : this.suggestFor(['detached', 'apartment'], '盖一栋');
            out.push({ kind: 'house', text: '想让家里住得好一点', ...housing, radius: 0 });
        }
        // 8. 想买车
        const vc = cfg.vehicles;
        if (r.vehicle === 'walk' && r.jobId !== null && r.age <= vc.maxAge) {
            const eb = vc.tiers.ebike;
            const has = this.state.buildings.some((b) => b.defId === eb.factory);
            if (!has && r.savings >= eb.price * eb.savingsRatio) {
                out.push({ kind: 'vehicle', text: '攒够钱了，想买辆电动车，可县里没车厂', ...this.suggestFor([eb.factory], '建一座摩托车厂'), radius: 0 });
            }
        }
        return out.sort((a, b) => this.wishImpact(r, b.kind) - this.wishImpact(r, a.kind));
    }

    private wishImpact(r: Resident, kind: WishKind): number {
        const penalty = (r.moodParts ?? []).reduce((sum, part) =>
            sum + (WISH_MOOD_KEYS[kind].indexOf(part.key) >= 0 ? Math.max(0, -part.value) : 0), 0);
        // 开局还没有第一份月度幸福度明细，按同一失业扣分口径排序。
        return kind === 'job' && !penalty ? Math.min(25, 8 + r.monthsUnemployed * 2) : penalty;
    }

    /** 打开档案时提出眼下最重要的一件事；重开档案不会延长同一个心愿。 */
    openGuidance(id: number): void {
        const r = this.resident(id);
        const tuning = this._cfg.progress?.wishes;
        if (!r || !tuning) return;
        const world = this.guidanceWorld();
        if (r.wish && !this.wishUnmet(r, r.wish, world)) this.settleWish(r);
        const candidates = this.wishCandidates(r, world);
        const old = r.wish;
        let candidate = candidates[0];
        if (!candidate) { r.wish = null; return; }
        const current = old && candidates.find((w) => w.kind === old.kind && w.demand === old.demand);
        if (current && this.wishImpact(r, current.kind) === this.wishImpact(r, candidate.kind)) candidate = current;
        const same = old && old.kind === candidate.kind && old.demand === candidate.demand;
        r.wish = { ...candidate, text: same && candidate.kind === 'shop' && old.text ? old.text : candidate.text,
            since: same ? old.since : this.state.month,
            until: same ? old.until : this.state.month + tuning.days };
    }

    private guidanceWorld(): World {
        const byUid = new Map(this.state.buildings.map((b) => [b.uid, this._cfg.building(b.defId)] as const));
        return buildWorld(this.state.residents, this.state.buildings, (uid) => byUid.get(uid) ?? null);
    }

    leaveMonthsLeft(r: Resident): number {
        return r.leaving ? Math.max(0, this._cfg.economy.leaveMonths - (this.state.month - r.leaving.since)) : 0;
    }

    /** 心愿还没实现吗（true = 还缺） */
    private wishUnmet(r: Resident, w: Wish, world: World): boolean {
        if (w.kind === 'job') return r.jobId === null || !!(w.jobTarget &&
            (this.building(r.jobId)?.defId !== w.jobTarget.defId || r.jobTitle !== w.jobTarget.title));
        if (r.homeId === null) return false;
        const cfg = this._cfg.economy;
        switch (w.kind) {
            case 'school': return !this.hasNearby(r.homeId, 'school', SCHOOL_RANGE);
            case 'clinic': return !this.hasNearby(r.homeId, 'clinic', CLINIC_RANGE);
            case 'shop': return !!w.demand && !this.hasShopInCircle(r.homeId, w.demand, world);
            case 'commute': {
                if (r.jobId === null) return false;
                const d = this.distance(r.homeId, r.jobId);
                return isFinite(d) && d > cfg.commuteComfort * this.tier(r).range + 3;
            }
            case 'env': return this.homeEnv(r.homeId) < 0;
            case 'vehicle': return r.vehicle === 'walk';
            case 'house': {
                const hb = world.buildingByUid.get(r.homeId);
                return (hb ? this._cfg.building(hb.defId)?.homeLevel ?? 0 : 0) <= 2;
            }
        }
    }

    private settleWish(r: Resident): void {
        const w = r.wish;
        const s = this.state;
        const wt = this._cfg.progress?.wishes;
        if (!w || !wt) return;
        r.wish = null;
        r.mood = clamp(0, 100, r.mood + wt.doneMood);
        s.wishesDone = (s.wishesDone ?? 0) + 1;
        s.buzz = Math.min(this._cfg.economy.buzzMax, (s.buzz ?? 0) + wt.doneBuzz);
        this.notice('wishDone', `${r.name}的心愿实现了：${WISH_DONE_TEXT[w.kind] ?? w.text}`, [r.id]);
        this.log(r, `心愿实现了：${w.text}`);
        if (r.leaving && r.mood >= this._cfg.economy.stayMood) {
            r.leaving = null;
            this.notice('stay', `${r.name}决定留下来了`, [r.id]);
        }
    }

    private updateWishes(world: World): void {
        const p = this._cfg.progress;
        if (!p) return;
        const wt = p.wishes;
        const s = this.state;
        // 已有的：实现了 / 过期了
        for (const r of s.residents) {
            const w = r.wish;
            if (!w) continue;
            if (!this.wishUnmet(r, w, world)) {
                this.settleWish(r);
            } else if (s.month >= w.until) {
                r.wish = null;
                r.mood = clamp(0, 100, r.mood - wt.expireMood);
                this.log(r, `心愿没能实现：${w.text}`);
            }
        }
        // 新的：想走的人优先，然后老人、有孩子的，其余随机
        const cap = Math.max(wt.minActive, Math.floor(s.residents.length / wt.perPeople));
        let active = s.residents.filter((r) => r.wish).length;
        if (active >= cap) return;
        const pool = s.residents.filter((r) => !r.wish && r.homeId !== null && r.age >= this._cfg.economy.residents.workMinAge);
        const rank = (r: Resident) => (r.leaving ? 0 : r.age >= this._cfg.economy.residents.retireAge || r.childIds.length ? 1 : 2);
        pool.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
        // 同一个缺口（同一家人、同一类店）别一下子冒好几个
        const seen = new Set<string>();
        for (const r of s.residents) if (r.wish) seen.add(`${r.homeId}:${r.wish.kind}:${r.wish.demand ?? ''}`);
        for (const r of pool) {
            if (active >= cap) break;
            if (!r.leaving && !chance(this._rng, wt.chance)) continue;
            const c = this.wishCandidates(r, world).find((x) => !seen.has(`${r.homeId}:${x.kind}:${x.demand ?? ''}`));
            if (!c) continue;
            r.wish = { ...c, since: s.month, until: s.month + wt.days };
            seen.add(`${r.homeId}:${c.kind}:${c.demand ?? ''}`);
            active++;
            this.notice('wish', `${r.name}有个心愿：${c.text}`, [r.id], c.hint);
        }
    }

    // ───────────────────────────── 特色街道（D026，DESIGN 21） ─────────────────────────────

    /** 重新找一遍凑成的街；新凑成的发通知 */
    private detectStreets(): void {
        const p = this._cfg.progress;
        const s = this.state;
        if (!p) return;
        const range = p.streets.range;
        const old = new Set((s.streets ?? []).map((x) => `${x.kind}:${x.uids.slice().sort((a, b) => a - b).join(',')}`));
        const found: { kind: string; uids: number[] }[] = [];
        const byDef = new Map<string, number[]>();
        for (const b of s.buildings) {
            const l = byDef.get(b.defId);
            if (l) l.push(b.uid); else byDef.set(b.defId, [b.uid]);
        }
        const near = (a: number, b: number) => { const d = this._town.roadDistance(a, b); return isFinite(d) && d <= range; };
        for (const def of p.streets.list) {
            const used = new Set<number>();
            const [first, ...rest] = def.members;
            for (const a of byDef.get(first) ?? []) {
                const pick: number[] = [a];
                let ok = true;
                for (const m of rest) {
                    const c = (byDef.get(m) ?? []).find((u) => !used.has(u) && pick.indexOf(u) < 0 && pick.every((x) => near(x, u)));
                    if (c === undefined) { ok = false; break; }
                    pick.push(c);
                }
                if (!ok) continue;
                for (const u of pick) used.add(u);
                found.push({ kind: def.id, uids: pick });
            }
        }
        for (const f of found) {
            if (old.has(`${f.kind}:${f.uids.slice().sort((a, b) => a - b).join(',')}`)) continue;
            const def = p.streets.list.find((x) => x.id === f.kind)!;
            this.notice('street', `凑成了「${def.name}」！${def.effect}`, []);
            this.event(`凑成了特色街道「${def.name}」`);
        }
        s.streets = found;
        // 网红打卡街：每月口碑 +
        for (const f of found) {
            const def = p.streets.list.find((x) => x.id === f.kind);
            if (def && def.buzz) s.buzz = Math.min(this._cfg.economy.buzzMax, (s.buzz ?? 0) + def.buzz);
        }
    }

    /** 地标（老街）：每月口碑 +（新建筑第一批） */
    private landmarkBuzz(): void {
        const s = this.state;
        for (const b of s.buildings) {
            const e = this._cfg.building(b.defId);
            if (e && e.buzz) s.buzz = Math.min(this._cfg.economy.buzzMax, (s.buzz ?? 0) + e.buzz);
        }
    }

    private streetOutsideMult(uid: number): number {
        const p = this._cfg.progress;
        let m = 1;
        for (const st of p ? this.state.streets ?? [] : []) {
            if (st.uids.indexOf(uid) < 0) continue;
            const def = p!.streets.list.find((x) => x.id === st.kind);
            if (def) m = Math.max(m, def.outsideMult);
        }
        // 地标带客（老街）：半径内的店过路客再乘一次，几座地标取最大的那个
        let boost = 1;
        for (const b of this.state.buildings) {
            const e = this._cfg.building(b.defId);
            if (!e || !e.boostMult || e.boostMult <= 1 || !e.boostRadius) continue;
            if (b.uid === uid || this._town.gridDistance(uid, b.uid) <= e.boostRadius) boost = Math.max(boost, e.boostMult);
        }
        return m * boost;
    }

    /** 某栋住宅附近（radius 格内）有哪些特色街道，同一种只算一次 */
    private streetsNear(homeUid: number): StreetDef[] {
        const p = this._cfg.progress;
        if (!p || !this.state.streets?.length) return [];
        const out: StreetDef[] = [];
        for (const st of this.state.streets) {
            const def = p.streets.list.find((x) => x.id === st.kind);
            if (!def || out.indexOf(def) >= 0) continue;
            if (st.uids.some((u) => this._town.gridDistance(homeUid, u) <= p.streets.radius)) out.push(def);
        }
        return out;
    }

    streetBook(): StreetStatus[] {
        const p = this._cfg.progress;
        if (!p) return [];
        return p.streets.list.map((d) => ({
            id: d.id, name: d.name, members: d.members.slice(), effect: d.effect,
            count: (this.state.streets ?? []).filter((x) => x.kind === d.id).length,
            lockedMembers: d.members.filter((m) => !this.isUnlocked(m)),
        }));
    }

    streetHint(defId: string, col: number, row: number, w: number, h: number): string | null {
        const p = this._cfg.progress;
        const town = this._town;
        if (!p || !town.spotDistance) return null;
        const range = p.streets.range;
        const near = (u: number) => { const d = town.spotDistance!(col, row, w, h, u); return isFinite(d) && d <= range; };
        const pair = (a: number, b: number) => { const d = town.roadDistance(a, b); return isFinite(d) && d <= range; };
        let almost: string | null = null;
        for (const def of p.streets.list) {
            if (def.members.indexOf(defId) < 0) continue;
            const others = def.members.filter((m) => m !== defId);
            const pick: number[] = [];
            const missing: string[] = [];
            // 已建成的和还在施工的都算（玩家常常一口气连着盖）
            const all: { uid: number; defId: string }[] = [...this.state.buildings, ...(this.state.construction ?? [])];
            for (const m of others) {
                const c = all.find((b) => b.defId === m && pick.indexOf(b.uid) < 0 && near(b.uid) && pick.every((x) => pair(x, b.uid)));
                if (c) pick.push(c.uid); else missing.push(m);
            }
            if (!missing.length) return `盖在这里能凑成「${def.name}」！`;
            if (missing.length === 1 && !almost) almost = `再在附近盖一家${this.buildingName(missing[0])}，这里就成「${def.name}」了`;
        }
        return almost;
    }

    // ───────────────────────────── 环境（DESIGN 22） ─────────────────────────────

    buildingEnv(defId: string): number {
        const e = this._cfg.building(defId);
        return e ? e.env : defId === 'tree' ? 1 : defId === 'plaza' ? 2 : 0;
    }

    envAt(col: number, row: number): number {
        let sum = 0;
        for (const info of this._town.allBuildings()) {
            const econ = this._cfg.building(info.defId);
            const env = econ ? econ.env : info.defId === 'tree' ? 1 : info.defId === 'plaza' ? 2 : 0;
            if (env === 0) continue;
            const d = Math.max(Math.abs(col + 0.5 - (info.col + info.width / 2)), Math.abs(row + 0.5 - (info.row + info.height / 2)));
            if (d > 3 || d < 0.5) continue;
            sum += env * (1 - (d - 1) / 4);
        }
        return sum;
    }

    // ───────────────────────────── 覆盖范围（T538） ─────────────────────────────

    /** 店按步行的消费半径；学校 / 卫生院 / 派出所 / 广场按各自的范围；其他楼没有覆盖范围 */
    private reachRadius(defId: string): number {
        if (defId === 'school') return SCHOOL_RANGE;
        if (defId === 'clinic') return CLINIC_RANGE;
        if (defId === 'police') return POLICE_RANGE;
        if (defId === 'plaza') return PLAZA_RANGE;
        if (defId === 'kindergarten') return KINDERGARTEN_RANGE;
        const e = this._cfg.building(defId);
        return e && e.demand ? shopRadius(e, this._cfg) : 0;
    }

    private toServiceReach(reach: Reach, radius: number, homes: number[], byVehicle: boolean): ServiceReach {
        const w = this._town.width;
        return { radius, roads: reach.roads.map((i) => [i % w, Math.floor(i / w)] as [number, number]), homes, byVehicle };
    }

    serviceReach(defId: string, col: number, row: number, w: number, h: number): ServiceReach | null {
        const radius = this.reachRadius(defId);
        const town = this._town;
        if (!radius || !town.spotReach) return null;
        const reach = town.spotReach(col, row, w, h, radius);
        const homes: number[] = [];
        reach.near.forEach((_d, uid) => {
            const info = town.building(uid);
            const e = info ? this._cfg.building(info.defId) : null;
            if (e && e.housing > 0) homes.push(uid);
        });
        const e = this._cfg.building(defId);
        return this.toServiceReach(reach, radius, homes, !!(e && e.demand));
    }

    wishReach(residentId: number): ServiceReach | null {
        const r = this.resident(residentId);
        const w = r ? r.wish : null;
        const town = this._town;
        if (!r || !w || r.homeId === null) return null;
        if (w.kind === 'shop') {
            const circle = this.shoppingCircle(r.homeId);
            return circle ? { circle, radius: this.shoppingRadius, homes: [r.homeId], roads: [], byVehicle: false } : null;
        }
        if (!town.uidReach) return null;
        if (w.kind !== 'school' && w.kind !== 'clinic') return null;
        const radius = Math.round(w.radius);
        if (radius <= 0) return null;
        return this.toServiceReach(town.uidReach(r.homeId, radius), radius, [r.homeId], false);
    }

    // ───────────────────────────── 住房：翻盖、搬家（DESIGN 23） ─────────────────────────────

    private homeOwnerName(b: BuildingSim): string {
        const r = b.residentIds.map((id) => this.resident(id)).find((x) => x && x.age >= 18);
        return r ? r.name : '一户人';
    }

    private renovationPlan(b: BuildingSim) {
        const econ = this._cfg.building(b.defId);
        const next = econ?.upgradeTo ? this._cfg.building(econ.upgradeTo) : null;
        if (!next || !b.residentIds.length) return null;
        const cfg = this._cfg.economy;
        const people = b.residentIds.map((id) => this.resident(id)).filter((r): r is Resident => !!r);
        const adults = people.filter((r) => r.age >= cfg.residents.workMinAge);
        const savings = adults.reduce((sum, r) => sum + Math.max(0, r.savings), 0);
        const mood = people.reduce((sum, r) => sum + r.mood, 0) / Math.max(1, people.length);
        const name = this.buildingName(next.id);
        const gap = Math.ceil(next.cost * cfg.renovateSavingsRatio - savings);
        let hint = '';
        if (this.state.renovations?.some((x) => x.uid === b.uid)) hint = `正在翻盖${name}`;
        else if (!this.isUnlocked(next.id)) hint = `${name}尚未解锁`;
        else if (gap > 0) hint = `再攒 ¥${gap} 就够翻盖费`;
        else if (mood < cfg.renovateMood) hint = `住户平均幸福度需达到 ${cfg.renovateMood}`;
        return { next, adults, people, savings, hint };
    }

    housingHint(homeId: number): string {
        const b = this.building(homeId);
        const plan = b && this.renovationPlan(b);
        return plan ? plan.hint || '条件已齐，下次结算开工' : '';
    }

    private renovateHomes(): void {
        const s = this.state;
        for (const b of s.buildings) {
            const plan = this.renovationPlan(b);
            if (!plan || plan.hint) continue;
            const { next, adults, people, savings } = plan;
            // 翻盖费按存款比例分摊，付给施工队（县外）
            let left = next.cost;
            for (const a of adults) {
                const pay = Math.min(Math.max(0, a.savings), Math.round(next.cost * Math.max(0, a.savings) / savings));
                a.savings -= pay;
                left -= pay;
            }
            if (left > 0) for (const a of adults) { const pay = Math.min(left, Math.max(0, a.savings)); a.savings -= pay; left -= pay; }
            this._flows.outflow.construction += next.cost - left;
            (s.renovations ??= []).push({ uid: b.uid, to: next.id, left: Math.max(1, next.buildDays), total: Math.max(1, next.buildDays), startAt: s.month });
            this.notice('renovate', `${this.homeOwnerName(b)}家开始把${this.buildingName(b.defId)}翻盖成${this.buildingName(next.id)}`, people.map((x) => x.id));
        }
    }

    /** 有没有比 level 更好、还能住下 size 人的空房 */
    private betterHomeFor(r: Resident, level: number, size: number): BuildingSim | null {
        let best: BuildingSim | null = null, bestLv = level;
        for (const b of this.state.buildings) {
            if (b.uid === r.homeId) continue;
            const e = this._cfg.building(b.defId);
            if (!e || e.housing <= 0 || e.homeLevel <= bestLv) continue;
            if (e.housing - b.residentIds.length < size) continue;
            if (this.state.renovations?.some((x) => x.uid === b.uid)) continue;
            best = b; bestLv = e.homeLevel;
        }
        return best;
    }

    private moveToBetterHomes(): void {
        const s = this.state;
        const cfg = this._cfg.economy;
        const world = this.refreshWorld();
        for (const r of s.residents.slice()) {
            if (r.homeId === null || r.age < cfg.residents.workMinAge) continue;
            if (r.spouseId !== null && r.spouseId < r.id) continue;   // 一家只判一次（id 小的那位）
            if (r.parentIds.some((id) => { const p = this.resident(id); return !!p && p.homeId === r.homeId; })) continue;   // 跟父母住的不单独搬
            const home = world.buildingByUid.get(r.homeId);
            const he = home ? this._cfg.building(home.defId) : null;
            if (!he) continue;
            const spouse = r.spouseId !== null ? this.resident(r.spouseId) : null;
            const kids = r.childIds.map((id) => this.resident(id)).filter((c): c is Resident => !!c && c.age < cfg.residents.workMinAge && c.homeId === r.homeId);
            const family = [r, ...(spouse && spouse.homeId === r.homeId ? [spouse] : []), ...kids];
            const target = this.betterHomeFor(r, he.homeLevel, family.length);
            if (!target) continue;
            const te = this._cfg.building(target.defId)!;
            const adults = family.filter((x) => x.age >= cfg.residents.workMinAge);
            const savings = adults.reduce((a, x) => a + Math.max(0, x.savings), 0);
            if (savings < (te.rent || cfg.rentPerPerson) * adults.length * cfg.moveRentMonths) continue;
            if (!chance(this._rng, cfg.moveChance)) continue;
            for (const m of family) {
                this.detachHome(m);
                m.homeId = target.uid;
                target.residentIds.push(m.id);
            }
            this.log(r, `搬进了${this.buildingName(target.defId)}`);
            this.notice('info', `${r.name}${family.length > 1 ? '一家' : ''}搬进了${this.buildingName(target.defId)}`, family.map((x) => x.id));
        }
    }

    // ───────────────────────────── 招商引资（D026，DESIGN 20） ─────────────────────────────

    businessEnv(): { total: number; parts: { label: string; value: number; max: number }[] } {
        const s = this.state;
        const rt = this._cfg.economy.residents;
        const roads = this._town.allBuildings().filter((b) => b.road);
        const city = roads.filter((b) => b.defId === 'road').length;
        const adults = s.residents.filter((r) => r.age >= rt.workMinAge && r.age < rt.retireAge);
        const labor = this.availableLabor();
        const edu = adults.length ? adults.filter((r) => r.education >= 2).length / adults.length : 0;
        const has = (id: string) => s.buildings.some((b) => b.defId === id);
        const mood = s.residents.length ? this.summary().avgMood : 0;
        const parts = [
            { label: '城市道路', value: roads.length ? Math.round(city / roads.length * 20) : 0, max: 20 },
            { label: '能招到的工人', value: Math.min(20, labor * 4), max: 20 },
            { label: '居民学历', value: Math.min(15, Math.round(edu / 0.3 * 15)), max: 15 },
            { label: '派出所', value: has('police') ? 10 : 0, max: 10 },
            { label: '港口', value: has('port') ? 10 : 0, max: 10 },
            { label: '税率', value: clamp(0, 10, Math.round((0.3 - s.finance.taxRate.business) / 0.2 * 10)), max: 10 },
            { label: '县城幸福度', value: clamp(0, 15, Math.round((mood - 40) / 40 * 15)), max: 15 },
        ];
        return { total: parts.reduce((a, x) => a + x.value, 0), parts };
    }

    /** 能招的工人：劳动年龄、没工作、不赋闲 */
    private availableLabor(): number {
        const rt = this._cfg.economy.residents;
        return this.state.residents.filter((r) => r.age >= rt.workMinAge && r.age < rt.retireAge && r.jobId === null && !r.idle).length;
    }

    private updateOffers(): void {
        const p = this._cfg.progress;
        const s = this.state;
        if (!p) return;
        const iv = p.invest;
        const before = (s.offers ?? []).length;
        s.offers = (s.offers ?? []).filter((o) => o.until > s.month);
        if (s.month % iv.every !== 0) return;
        const pool = (iv.pool[s.level] ?? []).filter((id) => !!this._cfg.building(id));
        if (!pool.length) return;
        const lv = LEVEL_ORDER.indexOf(s.level);
        const n = Math.min(iv.max, 1 + nextInt(this._rng, 0, Math.min(2, lv + 1)));
        for (let i = 0; i < n && s.offers.length < iv.max + 1; i++) {
            const defId = pool[nextInt(this._rng, 0, pool.length - 1)];
            if (s.offers.some((o) => o.defId === defId)) continue;
            const e = this._cfg.building(defId)!;
            const jobs = e.jobs.reduce((a, j) => a + j.count, 0);
            const name = iv.companies[nextInt(this._rng, 0, iv.companies.length - 1)];
            const kind = e.demand ? '连锁' : e.jobs.length ? '实业' : '集团';
            s.offers.push({
                id: (s.nextOfferId = (s.nextOfferId ?? 1) + 1),
                company: `${name}${kind}`,
                defId,
                landFee: Math.round(e.cost * iv.landFeeRate / 100) * 100,
                subsidy: Math.round(e.cost * iv.subsidyRate / 100) * 100,
                workers: Math.max(2, Math.round(jobs * 0.6)),
                workerEdu: e.jobs.reduce((m: number, j) => Math.max(m, j.edu), 0) as 0 | 1 | 2 | 3,
                needLabor: Math.max(1, Math.round(jobs * 0.3)),
                until: s.month + iv.valid,
            });
        }
        if (s.offers.length > before) this.notice('offer', `有外地企业想来投资，去县发展中心「招商引资」看看`, []);
    }

    offerChance(offerId: number, taxBreak: boolean, mode: 'land' | 'subsidy' = 'land'): number {
        const p = this._cfg.progress;
        if (!p) return 0;
        const iv = p.invest;
        return Math.min(iv.maxChance, this.businessEnv().total / 100 * iv.envWeight
            + (taxBreak ? iv.taxBreakBonus : 0) + (mode === 'subsidy' ? iv.subsidyChanceBonus : 0));
    }

    /** 签约前检查（D032）：能签返回 ''，不能返回差什么 */
    offerBlock(offerId: number, mode: 'land' | 'subsidy'): string {
        const s = this.state;
        if (!this._cfg.progress) return '没有招商';
        const o = (s.offers ?? []).find((x) => x.id === offerId);
        if (!o) return '这份意向已经过期了';
        if (s.pendingDeal) return `先给${s.pendingDeal.company}把地交了（或者放弃那一份）`;
        if (mode === 'land') {
            const n = this.availableLabor();
            if (n < o.needLabor) return `还差 ${o.needLabor - n} 个能招的工人（对方要 ${o.needLabor} 个，现在 ${n} 个）`;
        } else if (s.finance.funds < o.subsidy) {
            return `建设资金还差 ${o.subsidy - s.finance.funds}（补贴要 ¥${o.subsidy}）`;
        }
        return '';
    }

    acceptOffer(offerId: number, mode: 'land' | 'subsidy', taxBreak: boolean): string | null {
        const s = this.state;
        const block = this.offerBlock(offerId, mode);
        if (block) return block;
        const o = s.offers!.find((x) => x.id === offerId)!;
        // 谈：失败就说最弱的一项，意向作废
        s.offers = s.offers!.filter((x) => x.id !== offerId);
        if (!chance(this._rng, this.offerChance(offerId, taxBreak, mode))) {
            const weak = this.businessEnv().parts.slice().sort((a, b) => a.value / a.max - b.value / b.max)[0];
            const why: Record<string, string> = {
                '城市道路': '对方嫌这儿没有像样的城市道路', '能招到的工人': '对方担心招不到工人', '居民学历': '对方嫌这儿有文化的人太少',
                '派出所': '对方担心治安', '港口': '对方嫌运货不方便', '税率': '对方嫌税太重', '县城幸福度': '对方听说这儿的人过得不太好',
            };
            const reason = weak ? why[weak.label] ?? '条件没谈拢' : '条件没谈拢';
            this.notice('info', `${o.company}没谈成：${reason}`, []);
            this.syncRng();
            return weak ? `没谈成：${reason}（把「${weak.label}」补上去，下次更容易谈成）` : `没谈成：${reason}`;
        }
        s.pendingDeal = mode === 'land'
            ? { offerId, defId: o.defId, company: o.company, landFee: o.landFee, taxBreak, mode }
            : { offerId, defId: o.defId, company: o.company, landFee: 0, taxBreak, mode, subsidy: o.subsidy, workers: o.workers, workerEdu: o.workerEdu };
        this.notice('deal', `和${o.company}签约了！在地图上给他们划一块地建${this.buildingName(o.defId)}`, []);
        this.syncRng();
        return null;
    }

    cancelPendingDeal(): void {
        this.state.pendingDeal = null;
    }

    /** 选址交地（D032）：供地收出让金；补贴款在 onBuilt 里已扣。解锁这个产业，返回建成后要记上的东西 */
    private closeLandDeal(deal: PendingDeal): DealOwner {
        const s = this.state;
        if (deal.landFee > 0) {
            s.finance.funds += deal.landFee;
            this._investIncome += deal.landFee;
            this._flows.inflow.investment += deal.landFee;
        }
        const un = (s.unlocked ??= []);
        if (un.indexOf(deal.defId) < 0) un.push(deal.defId);
        s.dealsDone = (s.dealsDone ?? 0) + 1;
        s.pendingDeal = null;
        const name = this.buildingName(deal.defId);
        this.notice('deal', deal.landFee > 0
            ? `${deal.company}的${name}开工了，土地出让金 ¥${deal.landFee} 已入账`
            : `${deal.company}的${name}开工了，补贴 ¥${dealCost(deal)} 已拨付，建成后对方会带工人来`, []);
        this.event(`招商：${deal.company}投资建${name}`);
        const workers = deal.mode === 'subsidy' ? deal.workers ?? 0 : 0;
        return { company: deal.company, taxBreak: deal.taxBreak, workers, workerEdu: deal.workerEdu ?? 0 };
    }

    /** 招商来的楼建成：记成私营；让税的话头 N 个月企业税减半；补贴路线对方带工人来（有空房才住得下） */
    private applyDealOwner(uid: number, owner: DealOwner | undefined): void {
        if (!owner) return;
        const s = this.state;
        const b = s.buildings.find((x) => x.uid === uid);
        if (!b) return;
        b.owner = 'private';
        if (owner.taxBreak) b.taxBreakUntil = s.month + (this._cfg.progress?.invest.taxBreakMonths ?? 12);
        if (owner.workers <= 0) return;
        const came: Resident[] = [];
        for (let i = 0; i < owner.workers; i++) {
            const r = this.createResident(null, chance(this._rng, 0.5) ? 'M' : 'F', nextInt(this._rng, 22, 40));
            r.education = Math.max(r.education, owner.workerEdu) as Education;
            s.residents.push(r);
            this.assignHomes([r]);
            if (r.homeId === null) { s.residents.pop(); break; }   // 没空房了，剩下的不来
            this._flows.inflow.immigrants += r.savings;
            came.push(r);
        }
        this.fillVacancies(this.refreshWorld());
        const short = owner.workers - came.length;
        this.notice('arrive', short > 0
            ? `${owner.company}带来了 ${came.length} 位熟练工人（还有 ${short} 位没空房，没来）`
            : `${owner.company}带来了 ${came.length} 位熟练工人`, came.map((x) => x.id), '企业介绍过来的');
    }

    /** 某类消费有哪些店（按造价从便宜到贵） */
    private shopsOf(d: Demand): string[] {
        return this._cfg.catalog.filter((e) => e.demand === d && e.capacity > 0)
            .sort((a, b) => Number(this.isUnlocked(b.id)) - Number(this.isUnlocked(a.id)) || a.cost - b.cost)
            .map((e) => e.id);
    }

    private shopList(ids: string[]): string {
        return ids.map((id) => this.buildingName(id) + (this.isUnlocked(id) ? '' : '（未解锁）')).join('、');
    }

    private get shoppingRadius(): number {
        return this._cfg.progress?.wishes.shopRadius ?? 8;
    }

    private shoppingCircle(homeId: number): { col: number; row: number } | null {
        const home = this._town.building(homeId);
        return home ? { col: home.col + home.width / 2, row: home.row + home.height / 2 } : null;
    }

    private hasShopInCircle(homeId: number, demand: Demand, world: World): boolean {
        const center = this.shoppingCircle(homeId);
        if (!center) return false;
        return (world.shopsByDemand.get(demand) ?? []).some((b) => {
            const site = this._town.building(b.uid);
            return !!site && Math.hypot(site.col + site.width / 2 - center.col,
                site.row + site.height / 2 - center.row) <= this.shoppingRadius;
        });
    }

    /** 建议：已解锁的第一个；都没解锁就提示先研究（方向 B：跨等级也指路，hint 把升级步骤说清楚） */
    private suggestFor(ids: string[], where: string): { hint: string; suggest: string } {
        const ok = ids.find((id) => this.isUnlocked(id));
        if (ok) return { hint: `${where}${this.buildingName(ok)}`.replace('盖一家盖', '盖'), suggest: ok };
        const p = this._cfg.progress;
        if (!p) return { hint: where, suggest: '' };
        // 找能解锁这类建筑的研究项，不管它的等级门槛
        const r = p.research.find((x) => x.unlocks.some((u) => ids.indexOf(u) >= 0));
        if (!r) return { hint: where, suggest: '' };
        const targetId = r.unlocks.find((u) => ids.indexOf(u) >= 0)!;
        const targetName = this.buildingName(targetId);
        // 检查当前等级能不能研究这项
        const curLvIdx = LEVEL_ORDER.indexOf(this.state.level);
        const needLvIdx = LEVEL_ORDER.indexOf(r.level);
        if (needLvIdx > curLvIdx) {
            // 需要先升级：「先把县城升到「镇上」，在县发展中心研究「连锁商超」，再盖超市」
            const needLvName = LEVEL_NAME[r.level];
            return {
                hint: `先把县城升到「${needLvName}」，在县发展中心研究「${r.name}」，再${where}${targetName}`,
                suggest: '',   // 现在盖不了，底栏不预选
            };
        }
        // 当前等级能研究：「先在县发展中心研究「奶茶店」」
        return {
            hint: `先在县发展中心研究「${r.name}」，再${where}${targetName}`.replace('盖一家盖', '盖'),
            suggest: '',
        };
    }

    private jobWish(r: Resident, world: World): Omit<Wish, 'since' | 'until'> {
        const eligible = this._cfg.catalog.filter((e) => e.jobs.some((j) => j.edu <= r.education));
        // 意向随居民稳定，旧档也能得到相同的企业和岗位。
        const preferred = r.id % 3 === 0 && eligible.length ? eligible[r.id % eligible.length] : null;
        const slot = preferred?.jobs.find((j) => j.edu <= r.education);
        const jobTarget = r.wish?.kind === 'job' ? r.wish.jobTarget :
            preferred && slot ? { defId: preferred.id, title: slot.title } : undefined;
        const ids = jobTarget ? [jobTarget.defId] : eligible.map((e) => e.id);
        const vacancy = this.bestJobFor(r, world, jobTarget);
        const guidance = vacancy ? { hint: `${this.buildingName(vacancy.building.defId)}正在招${vacancy.slot.title}`, suggest: '' }
            : this.suggestFor(ids, '建一座');
        const looking = r.monthsUnemployed > 0 ? `我已经 ${r.monthsUnemployed} 个月没找到工作了` : '我想找一份工作';
        return { kind: 'job', jobTarget, text: jobTarget ? `${looking}，想去${this.buildingName(jobTarget.defId)}做${jobTarget.title}` : looking,
            ...guidance, radius: 0 };
    }

    private referralOpening(id: number, uid?: number, title?: string): Opening | null {
        const r = this.resident(id);
        const rt = this._cfg.economy.residents;
        if (!r || r.jobId !== null || r.idle || r.age < rt.workMinAge || r.age >= rt.retireAge || r.wish?.kind !== 'job') return null;
        return this.bestJobFor(r, this.guidanceWorld(), r.wish.jobTarget, uid, title);
    }

    jobReferral(id: number): JobReferral | null {
        const o = this.referralOpening(id);
        return o ? { uid: o.building.uid, title: o.slot.title, employer: this.buildingName(o.building.defId) } : null;
    }

    introduceJob(id: number, uid: number, title: string): boolean {
        const o = this.referralOpening(id, uid, title);
        const r = this.resident(id);
        if (!r || !o) return false;
        this.takeJob(r, o);
        this.settleWish(r);
        this.openGuidance(id);
        return true;
    }

    employers(): Employer[] {
        const byId = new Map(this.state.residents.map((r) => [r.id, r] as const));
        const rows: Employer[] = [];
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.jobs.length) continue;
            rows.push({ uid: b.uid, name: this.buildingName(b.defId) + (b.branchOf === undefined ? '' : '分厂'), required: totalPositions(econ),
                staff: staffing(b, econ, byId).staff });
        }
        return rows;
    }

    branchOffer(uid: number): { cost: number; jobs: number } | null {
        const source = this.building(uid);
        if (!source || source.branchOf !== undefined) return null;
        const econ = this._cfg.building(source.defId);
        return econ?.canOpenBranch ? { cost: econ.cost, jobs: totalPositions(econ) } : null;
    }

    branchTransferCount(uid: number, col: number, row: number, w: number, h: number): number {
        const source = this.building(uid);
        if (!source || !this.branchOffer(uid)) return 0;
        const reach = this._town.spotReach?.(col, row, w, h, Infinity);
        return this.branchTransfers(source, home => reach?.near.get(home) ?? Infinity).length;
    }

    private branchTransfers(source: BuildingSim, distanceToBranch: (home: number) => number): Resident[] {
        const econ = this._cfg.building(source.defId);
        if (!econ) return [];
        const slots = positionsOf(econ);
        const transfers: Resident[] = [];
        for (const id of source.workerIds) {
            const r = this.resident(id);
            if (!r || r.homeId === null || r.jobId !== source.uid) continue;
            if (distanceToBranch(r.homeId) >= this._town.roadDistance(r.homeId, source.uid)) continue;
            const i = slots.findIndex(slot => slot.title === r.jobTitle && slot.edu <= r.education);
            if (i < 0) continue;
            slots.splice(i, 1);
            transfers.push(r);
        }
        return transfers;
    }

    private openBuilding(uid: number, defId: string, owner?: DealOwner, branch?: FactoryBranch): number {
        const building = Simulation.newBuilding(uid, defId);
        this.state.buildings.push(building);
        this.applyDealOwner(uid, owner);
        if (!branch) return 0;
        building.branchOf = branch.sourceUid;
        building.owner = branch.owner;
        const source = this.building(branch.sourceUid);
        if (!source) return 0;
        const transfers = this.branchTransfers(source, home => this._town.roadDistance(home, uid));
        for (const r of transfers) {
            source.workerIds.splice(source.workerIds.indexOf(r.id), 1);
            r.jobId = uid;
            building.workerIds.push(r.id);
            this.log(r, `调到${this.buildingName(defId)}分厂，离家更近了`);
        }
        return transfers.length;
    }

    canAfford(defId: string): boolean {
        const deal = this.state.pendingDeal;
        if (deal && deal.defId === defId) return this.state.finance.funds >= dealCost(deal);
        const econ = this._cfg.building(defId);
        if (!econ) return true;
        return this.state.finance.funds >= econ.cost;
    }

    resident(id: number): Resident | null {
        return this.state.residents.find((r) => r.id === id) ?? null;
    }

    building(uid: number): BuildingSim | null {
        return this.state.buildings.find((b) => b.uid === uid) ?? null;
    }

    /** 客单价（T219 飘字用）：只有真正按人次收钱的店才有价 */
    buildingPrice(defId: string): number {
        const e = this._cfg.building(defId);
        if (!e || e.demand === null || e.price <= 0) return 0;
        return e.price;
    }

    summary(): SimSummary {
        const ps = this.state.residents;
        const n = Math.max(1, ps.length);
        const rt = this._cfg.economy.residents;
        const working = ps.filter((p) => p.age >= rt.workMinAge && p.age < rt.retireAge);
        const paid = ps.filter((p) => p.salary > 0);
        return {
            population: ps.length,
            employed: ps.filter((p) => p.jobId !== null).length,
            workingAge: working.length,
            avgSalary: paid.length ? Math.round(paid.reduce((a, p) => a + p.salary, 0) / paid.length) : 0,
            avgSavings: Math.round(ps.reduce((a, p) => a + p.savings, 0) / n),
            avgMood: Math.round(ps.reduce((a, p) => a + p.mood, 0) / n),
            vehicles: ps.filter((p) => p.vehicle !== 'walk').length,
        };
    }

    /** 玩家调税率（界面滑条用）。范围由 economy.json 的 tuning.taxRange 定 */
    setTaxRate(key: 'business' | 'industry' | 'income', value: number): void {
        const range = this._cfg.economy.taxRange;
        this.state.finance.taxRate[key] = Math.max(range.min, Math.min(range.max, value));
    }

    // ───────────────────────────── 开局 ─────────────────────────────

    private adoptExistingBuildings(): void {
        for (const info of this._town.allBuildings()) {
            if (info.road) continue;                       // 道路不进模拟层
            if (!this._cfg.building(info.defId)) continue; // 树、桥之类没有经营数据
            if (this.state.buildings.some((b) => b.uid === info.uid)) continue;
            if (this.state.construction?.some((c) => c.uid === info.uid)) continue;   // 还在施工
            this.state.buildings.push(Simulation.newBuilding(info.uid, info.defId));
        }
    }

    static newBuilding(uid: number, defId: string): BuildingSim {
        return {
            uid, defId, residentIds: [], workerIds: [],
            lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50,
            owner: 'county', lastWages: 0, lastCost: 0, lastUpkeep: 0, lastProfit: 0, lastOutside: 0, lossMonths: 0,
        };
    }

    /** 新的一天：工地进度 −1，到 0 的完工（D026） */
    private finishConstruction(): void {
        const s = this.state;
        // 结算在月初：这一刻的绝对时间是 s.month（dayProgress = 0），和 constructionProgress 同一把尺子
        const now = s.month;
        if (s.renovations && s.renovations.length) {
            for (const r of s.renovations) r.left = constructionLeft(s, r);
            for (const r of s.renovations.filter((x) => x.left <= 0)) {
                const b = s.buildings.find((x) => x.uid === r.uid);
                if (!b) continue;
                const from = b.defId;
                b.defId = r.to;
                this.notice('renovate', `${this.homeOwnerName(b)}家把${this.buildingName(from)}翻盖成了${this.buildingName(r.to)}`, b.residentIds.slice());
                for (const id of b.residentIds) { const p = this.resident(id); if (p) this.log(p, `家里翻盖成了${this.buildingName(r.to)}`); }
            }
            s.renovations = s.renovations.filter((x) => x.left > 0);
        }
        if (!s.construction || !s.construction.length) return;
        for (const c of s.construction) c.left = constructionLeft(s, c);
        for (const c of s.construction.filter((x) => x.left <= 0)) {
            const moved = this.openBuilding(c.uid, c.defId, c.deal, c.branch);
            const message = !c.branch ? `${this.buildingName(c.defId)}完工了`
                : `${this.buildingName(c.defId)}分厂投产，${moved} 名老员工就近调岗`;
            this.notice('info', message, []);
        }
        s.construction = s.construction.filter((x) => x.left > 0);
        this._town.refresh?.();
    }

    /** 开局那几个人（DESIGN 2.7：新手期有节奏） */
    private spawnOpeningResidents(): void {
        const opening = this._cfg.names.opening;
        const created: Resident[] = [];

        if (opening && opening.length) {
            for (const p of opening) {
                const r = this.createResident(p.name, p.gender, p.age);
                created.push(r);
                this.state.residents.push(r);
            }
            for (let i = 0; i < created.length; i++) {
                const idx = opening[i].spouseOf;
                if (typeof idx !== 'number' || idx < 0 || idx >= created.length) continue;
                this.marry(created[i], created[idx], true);
            }
        } else {
            // 没配开局名单时的默认 5 人：一对老夫妻 + 一对小两口 + 一个回乡青年
            const specs: Array<{ gender: 'M' | 'F'; age: number }> = [
                { gender: 'M', age: 58 }, { gender: 'F', age: 56 },
                { gender: 'M', age: 27 }, { gender: 'F', age: 24 }, { gender: 'M', age: 31 },
            ];
            for (const sp of specs) {
                const r = this.createResident(null, sp.gender, sp.age);
                created.push(r);
                this.state.residents.push(r);
            }
            this.marry(created[0], created[1], true);
            this.marry(created[2], created[3], true);
        }

        const world = this.refreshWorld();
        this.assignHomes(this.state.residents.slice());
        this.syncRng();
    }

    // ───────────────────────────── 每月结算 ─────────────────────────────

    /** 生日那个月：长一岁、上学、退休、离世 */
    private ageEveryone(): void {
        const s = this.state;
        const monthOfYear = s.month % 12 + 1;
        const cfg = this._cfg.economy;
        const rt = cfg.residents;

        for (const r of s.residents.slice()) {
            if (r.birthMonth !== monthOfYear) continue;
            r.age++;

            // 上学：6～17 岁，村里有学校、老师够用，学历才往上走（DESIGN 2.2）
            if (r.age >= rt.schoolMinAge && r.age <= rt.schoolMaxAge && this.schoolCapacityOk()) {
                const target: number = r.age >= 17 ? cfg.maxEducationWithSchool
                    : r.age >= 15 ? Math.min(cfg.maxEducationWithSchool, 2)
                        : r.age >= 11 ? Math.min(cfg.maxEducationWithSchool, 1) : 0;
                if (target > r.education) {
                    r.education = target as 0 | 1 | 2 | 3;
                    if (r.education >= 2) this.log(r, '从学校毕业了');
                }
            }

            // 退休
            if (r.age >= rt.retireAge && r.jobId !== null) {
                const b = s.buildings.find((x) => x.uid === r.jobId) ?? null;
                clearJob(r, b);
                this.log(r, '退休了，不再上班');
            }

            // 离世：过了 deathAge 每年概率递增，最高 50%
            if (r.age >= cfg.deathAge) {
                const p = Math.min(0.5, 0.05 * (r.age - cfg.deathAge + 1));
                if (chance(this._rng, p)) this.die(r);
            }
        }
    }

    /** 学校够不够用：在读学生 ≤ 老师数 × 每老师带的人数 */
    private schoolCapacityOk(): boolean {
        const rt = this._cfg.economy.residents;
        const students = this.state.residents.filter(
            (r) => r.age >= rt.schoolMinAge && r.age <= rt.schoolMaxAge,
        ).length;
        if (students === 0) return true;
        let teachers = 0;
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.publicJob) continue;
            for (const slot of econ.jobs) {
                if (slot.title.includes('老师')) teachers += Math.min(slot.count, b.workerIds.length);
            }
        }
        return teachers * this._cfg.economy.studentsPerTeacher >= students;
    }

    /** 1. 上班领工资。公共岗位的钱由财政出，在 settleFinance 里发 */
    private payWages(world: World): void {
        for (const r of this.state.residents) {
            if (r.jobId === null) continue;
            const b = world.buildingByUid.get(r.jobId);
            if (!b) { clearJob(r, null); continue; }
            const econ = this._cfg.building(b.defId);
            if (!econ) continue;
            if (econ.publicJob) continue;
            // 工资由雇主出：记在这栋楼的账上，结算时从它的营业额里扣（D026）
            r.savings += r.salary;
            this._wages.set(b.uid, (this._wages.get(b.uid) ?? 0) + r.salary);
        }
    }

    /** 2. 消费：工资的 spendRate + 结余的 savingsSpendRate，按四类需求花掉 */
    private runConsumption(world: World): void {
        const cfg = this._cfg.economy;
        const ctx = {
            cfg: this._cfg,
            town: this._town,
            econOf: (uid: number) => this.econOfUid(uid),
            shopsByDemand: world.shopsByDemand,
            served: this._served,
            revenue: this._revenue,
            staff: this._staff,
        };

        for (const r of this.state.residents) {
            // 孩子不自己花钱（DESIGN 2.2：算进家庭开销）
            if (r.age < cfg.residents.workMinAge) continue;
            let budget = r.salary * cfg.spendRate + Math.max(0, r.savings) * cfg.savingsSpendRate;
            // 汽车油费：先从可支配收入里扣，钱流出县外，不进财政（DESIGN 11.1）
            const fuel = Math.min(this.tier(r).fuel, Math.max(0, r.savings));
            if (fuel > 0) {
                r.savings -= fuel;
                budget -= fuel;
                this._flows.outflow.fuel += fuel;
            }
            if (budget <= 0) continue;
            const res = consumeForResident(r, budget, ctx, this.tier(r).range);
            r.savings -= res.spent;
            this._missed.set(r.id, res.missed);
        }
    }

    /** 3. 交租、交税、财政支出 */
    private settleFinance(world: World): { income: MonthlyReport['income']; expense: MonthlyReport['expense'] } {
        const s = this.state;
        const cfg = this._cfg.economy;
        const rates = s.finance.taxRate;
        const income: MonthlyReport['income'] = { business: 0, industry: 0, income: 0, land: 0, investment: 0, profit: 0, rent: 0 };
        const expense: MonthlyReport['expense'] = {
            construction: this._constructionSpent, upkeep: 0, publicWages: 0, pension: 0, promotion: 0,
            research: this._researchSpent, talent: this._talentSpent,
        };
        expense.promotion += this._subsidySpent;
        income.investment += this._investIncome;
        this._constructionSpent = 0;
        this._researchSpent = 0;
        this._talentSpent = 0;
        this._subsidySpent = 0;
        this._investIncome = 0;

        // 房租：成年住户交给房东。现在的住房都是县里盖的，房租进财政（D026）
        for (const r of s.residents) {
            if (r.homeId === null || r.age < cfg.residents.workMinAge) continue;
            const home = world.buildingByUid.get(r.homeId);
            const he = home ? this._cfg.building(home.defId) : null;
            const rent = he && he.rent > 0 ? he.rent : cfg.rentPerPerson;   // 住房等级不同，房租不同（DESIGN 23）
            const paid = Math.min(rent, Math.max(0, r.savings));
            r.savings -= paid;
            income.rent += paid;
        }

        for (const b of s.buildings) if ((b.freezeMonths ?? 0) > 0) b.freezeMonths!--;

        // 店铺 / 工厂一本账：营业额 − 工资 − 成本 − 税 − 维护 = 利润（D026，DESIGN 25）
        const outside = cfg.outsideShare[s.level] ?? 0;
        for (const b of s.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ) continue;
            const isShop = econ.demand !== null && econ.capacity > 0 && econ.price > 0;
            const isFactory = econ.demand === null && econ.jobs.length > 0 && !econ.publicJob;
            if (!isShop && !isFactory) {
                b.lastRevenue = 0; b.lastCustomers = 0; b.lastTax = 0;
                b.lastWages = 0; b.lastCost = 0; b.lastUpkeep = 0; b.lastProfit = 0; b.lastOutside = 0;
                continue;
            }
            let revenue = 0;
            let customers = 0;
            let fromOutside = 0;
            if (isShop) {
                // 县里人花的钱 + 过路客（县外的钱）。过路客也要占接待能力
                const cap = shopCapacity(b, econ, this._staff.get(b.uid) ?? 0);
                const served = this._served.get(b.uid) ?? 0;
                const room = Math.max(0, cap - served);
                const outsideVisits = Math.min(room, cap * outside * this.streetOutsideMult(b.uid));
                fromOutside = Math.round(outsideVisits * econ.price);
                revenue = (this._revenue.get(b.uid) ?? 0) + fromOutside;   // 不取整：账要分毫不差
                customers = Math.round(served + outsideVisits);
                this._flows.inflow.outsideCustomers += fromOutside;
            } else {
                // 工厂：产值按在岗比例折算，产品卖到县外
                revenue = Math.round(econ.capacity * econ.price * this.staffRatio(b, econ));
                this._flows.inflow.exports += revenue;
            }
            let rate = isShop ? rates.business : rates.industry;
            if ((b.taxBreakUntil ?? 0) > s.month) rate /= 2;   // 招商让税（D026）
            const wages = this._wages.get(b.uid) ?? 0;
            const cost = Math.round(revenue * econ.costRate);
            const tax = Math.round(revenue * rate);
            const upkeep = econ.upkeep;
            const profit = revenue - wages - cost - tax - upkeep;
            b.lastRevenue = revenue; b.lastCustomers = customers; b.lastTax = tax;
            b.lastWages = wages; b.lastCost = cost; b.lastUpkeep = upkeep; b.lastProfit = profit; b.lastOutside = fromOutside;
            if (isShop) income.business += tax; else income.industry += tax;
            this._flows.outflow.goodsCost += cost;
            this._flows.outflow.upkeep += upkeep;
            if ((b.owner ?? 'county') === 'county') income.profit += profit;
            else this._flows.outflow.privateProfit += profit;
            b.lossMonths = profit < 0 ? (b.lossMonths ?? 0) + 1 : 0;
        }
        this.layOffLosers();

        // 个税：只算真的收得上来的
        for (const r of s.residents) {
            if (r.salary <= cfg.incomeTaxThreshold) continue;
            const due = Math.round((r.salary - cfg.incomeTaxThreshold) * rates.income);
            if (due <= 0) continue;
            const paid = Math.min(due, Math.max(0, r.savings));
            r.savings -= paid;
            income.income += paid;
        }

        // 公共岗位工资 + 养老金（财政出）
        for (const b of s.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.publicJob) continue;
            for (const id of b.workerIds) {
                const r = s.residents.find((x) => x.id === id);
                if (!r) continue;
                expense.publicWages += r.salary;
                r.savings += r.salary;
            }
        }
        for (const r of s.residents) {
            if (r.age < cfg.residents.retireAge) continue;
            expense.pension += cfg.pension;
            r.savings += cfg.pension;
        }

        // 维护费：经营性建筑在自己账上付了，财政只管住房、公共建筑（D026）
        for (const b of s.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ) continue;
            const business = (econ.demand !== null && econ.capacity > 0 && econ.price > 0)
                || (econ.demand === null && econ.jobs.length > 0 && !econ.publicJob);
            if (!business) expense.upkeep += econ.upkeep;
        }
        this._flows.outflow.upkeep += expense.upkeep;

        // 公共服务（T532）：环卫、治安、水电管网，按人头算，县越大越贵。没有这项时县里只进不出
        //   人越多人均越贵（交通、治安、管网的复杂度），不然县城越大越躺着赚钱
        const pop = s.residents.length;
        const svcMult = (cfg.serviceLevelMult[s.level] ?? 1) * (cfg.serviceCrowding > 0 ? 1 + pop / cfg.serviceCrowding : 1);
        expense.services = Math.round(pop * cfg.servicePerCapita * svcMult);
        this._flows.outflow.upkeep += expense.services;

        // 施工款在盖的时候已经扣过了（onBuilt），这里只记账不再扣——以前这里扣了第二遍（D026 修）
        // 招商的土地出让金 / 补贴、研究费都在发生时已经进出财政，这里只记账不再算（D026）
        const net = income.business + income.industry + income.income + income.land + income.profit + income.rent
            - expense.upkeep - expense.publicWages - expense.pension - (expense.services ?? 0);
        s.finance.funds += net;

        // 财政见底：上级拨款，不会游戏结束（DESIGN 3）
        if (s.finance.funds < 0) {
            s.finance.funds += cfg.bailout;
            this._flows.inflow.bailout += cfg.bailout;
            this.event(`财政吃紧，上级拨来 ${cfg.bailout} 元周转`);
        }
        return { income, expense };
    }

    /** 连续亏损的店 / 厂裁掉一个人（工资最高的先走），至少留 1 人（D026） */
    private layOffLosers(): void {
        const limit = this._cfg.economy.layoffMonths;
        for (const b of this.state.buildings) {
            if ((b.lossMonths ?? 0) < limit || b.workerIds.length <= 1) continue;
            let worst: Resident | null = null;
            for (const id of b.workerIds) {
                const r = this.resident(id);
                if (r && (!worst || r.salary > worst.salary)) worst = r;
            }
            if (!worst) continue;
            clearJob(worst, b);
            b.lossMonths = 0;
            b.freezeMonths = limit;   // 裁完这几个月不再招人，不然当月就被招回来了
            this.log(worst, `${this.buildingName(b.defId)}连续亏损，被裁员了`);
            this.event(`${this.buildingName(b.defId)}连续亏损，裁掉了${worst.name}`);
        }
    }

    /** 4. 居民自己的状态 */
    private updateResidents(world: World, income: MonthlyReport['income']): void {
        const s = this.state;
        const cfg = this._cfg.economy;
        const rt = cfg.residents;

        // 找工作 / 失业计时 / 跳槽
        for (const r of s.residents.slice()) {
            if (r.age < rt.workMinAge || r.age >= rt.retireAge) { r.idle = false; continue; }
            if (r.jobId === null) {
                // 赋闲（D024）：存款够多就不上班，不算失业
                r.idle = this.staysIdle(r);
                if (r.idle) { r.monthsUnemployed = 0; continue; }
                r.monthsUnemployed++;
                const job = this.bestJobFor(r, world);
                if (job) this.takeJob(r, job);
            } else {
                r.idle = false;
                r.monthsUnemployed = 0;
                if (s.month % 12 + 1 === r.birthMonth) this.maybeHopJob(r, world);
            }
        }

        // 买车（DESIGN 11.1）：放在心情前面，买了当月就有心情加成
        this.buyVehicles(income);

        // 心情
        for (const r of s.residents) r.mood = this.nextMood(r, world);

        // 结婚 / 生孩子
        for (const r of s.residents.slice()) {
            if (r.spouseId === null && r.age >= rt.marryMinAge && r.age <= rt.marryMaxAge && r.mood > 50) {
                if (chance(this._rng, rt.marryChance / 12)) {
                    const other = this.findSpouse(r);
                    if (other) { this.marry(r, other, false); this.holdWedding(r, other, income); }
                }
            }
            if (r.spouseId !== null && r.age >= rt.childMinAge && r.age <= rt.childMaxAge
                && r.id < (r.spouseId ?? 0) && s.month % 12 + 1 === r.birthMonth
                && chance(this._rng, rt.childChancePerYear * (r.homeId !== null && this.hasNearby(r.homeId, 'kindergarten', 8) ? rt.kindergartenChildMult : 1))) {
                this.haveChild(r);
            }
        }

    }

    private updateDepartures(): void {
        const s = this.state;
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        // 想走 → 挽留期 → 留下或全家搬走（D026，DESIGN 16.3）。取代「心情低 3 个月 / 失业 6 个月就走」
        const handled = new Set<number>();
        for (const r of s.residents.slice()) {
            if (handled.has(r.id) || r.homeId === null || r.age < rt.workMinAge) continue;
            if (!r.leaving) {
                if (r.mood < cfg.leaveMood) {
                    const reasons = this.complaints(r);
                    r.leaving = { since: s.month, reasons };
                    const why = reasons.length ? reasons.join('、') : '日子过得不顺心';
                    this.notice('warn', `${r.name}想离开县城：${why}`, [r.id], why);
                    this.log(r, `想离开县城：${why}`);
                }
                continue;
            }
            if (r.mood >= cfg.stayMood) {
                r.leaving = null;
                this.notice('stay', `${r.name}决定留下来了`, [r.id]);
                this.log(r, '决定留在县城');
                continue;
            }
            if (s.month - r.leaving.since >= cfg.leaveMonths) {
                const why = r.leaving.reasons.length ? r.leaving.reasons.join('、') : '日子过得不顺心';
                for (const m of this.leaveByHousehold(r, `搬离了县城（${why}）`)) handled.add(m.id);
                s.buzz = Math.max(-cfg.buzzMax, (s.buzz ?? 0) - cfg.buzzPerLeave);
            }
        }
    }

    /** 店铺口碑：上座率越高口碑越好（M4 店铺升级用） */
    private assessBuildings(world: World): void {
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || econ.demand === null) continue;
            const cap = Math.max(1, shopCapacity(b, econ, this._staff.get(b.uid) ?? 0));
            const fill = Math.min(1, (this._served.get(b.uid) ?? 0) / cap);
            const target = 45 + fill * 45;
            b.reputation = clamp(0, 100, b.reputation + (target - b.reputation) * 0.15);
        }
    }

    /** 5. 迁入：空岗位多、空房多、心情好，来的人就多（DESIGN 2.7、16.2） */
    private runImmigration(world: World): void {
        const s = this.state;
        const cfg = this._cfg.economy;
        const openJobs = this.countOpenJobs(world);
        const homeless = s.residents.filter((r) => r.homeId === null).length;
        const freeHomes = this.countFreeHousing() - homeless;
        if (freeHomes <= 0) return;

        // 县城幸福度越高、口碑越好，想来的人越多（D026，DESIGN 16.2）
        const sum = this.summary();
        const attract = curve(cfg.immigrationCurve, sum.avgMood) * Math.max(0, 1 + (s.buzz ?? 0))
            * (1 - (s.finance.taxRate.business - 0.05) * 2);
        // D030：没有空岗位时也来一点人（按空房的一半算），来了先失业、自己慢慢找活
        const capacity = openJobs > 0 ? Math.min(openJobs, freeHomes) : freeHomes * 0.5;
        const expected = capacity * cfg.immigrationRate * attract / 12;
        let n = Math.floor(expected);
        if (chance(this._rng, expected - n)) n++;

        for (let i = 0; i < n; i++) {
            const couple = chance(this._rng, 0.25);
            const age = nextInt(this._rng, 20, 35);
            const gender: 'M' | 'F' = chance(this._rng, 0.5) ? 'M' : 'F';
            const r = this.createResident(null, gender, age);
            s.residents.push(r);

            // 一个人来的先安排住处；分不到房就当没来（不制造无家可归的人）
            this.assignHomes([r]);
            if (r.homeId === null) {
                s.residents.pop();
                continue;
            }

            let partner: Resident | null = null;
            if (couple) {
                partner = this.createResident(null, gender === 'M' ? 'F' : 'M', clamp(18, 60, age + nextInt(this._rng, -4, 4)));
                s.residents.push(partner);
                this.assignHomes([partner]);
                if (partner.homeId === null) {
                    s.residents.pop();
                    partner = null;
                } else {
                    this.marry(r, partner, true);
                }
            }
            this._flows.inflow.immigrants += r.savings + (partner ? partner.savings : 0);
            this.event(`${r.name}${partner ? '一家' : ''} 来到县城定居`);
            this.notice('arrive', `${r.name}${partner ? '一家' : ''}搬到咱们县城了`, partner ? [r.id, partner.id] : [r.id], this.arriveReason(world));
            this.fillVacancies(world);
        }
    }

    /**
     * 人才引进（D030，DESIGN 16.6）：花钱从县外招一批有学历的年轻人，当场到。
     * 只要求有空房，不要求有空岗（来了自己找工作）；5 天冷却。
     * @param edu 0 初中 / 1 高中 / 2 大专，价格见 economy.json 的 talentTiers
     */
    hireTalents(edu: Education): string | null {
        const s = this.state;
        const cfg = this._cfg.economy;
        const now = s.month;
        if ((s.talentReadyAt ?? 0) > now) return `刚招过一批，还要等 ${s.talentReadyAt! - now} 天`;
        const tier = cfg.talentTiers.find((x) => x.edu === edu);
        if (!tier) return '没有这一档';
        const homeless = s.residents.filter((r) => r.homeId === null).length;
        const freeHomes = this.countFreeHousing() - homeless;
        if (freeHomes < tier.count) return `空房不够：要 ${tier.count} 间，现在只有 ${freeHomes} 间`;
        const cost = tier.price * tier.count;
        if (s.finance.funds < cost) return `建设资金不够（还差 ¥${cost - s.finance.funds}）`;

        s.finance.funds -= cost;
        this._talentSpent += cost;
        this._flows.outflow.talent += cost;      // 安家费、路费，钱流出县外

        const world = this.refreshWorld();
        const ids: number[] = [];
        for (let i = 0; i < tier.count; i++) {
            const age = nextInt(this._rng, 22, 30);
            const gender: 'M' | 'F' = chance(this._rng, 0.5) ? 'M' : 'F';
            const r = this.createResident(null, gender, age);
            r.education = edu as Education;
            r.savings += Math.round(tier.price * 0.5);   // 自带一点存款，刚来就能过日子
            s.residents.push(r);
            this.assignHomes([r]);
            if (r.homeId === null) { s.residents.pop(); continue; }
            this.log(r, '通过人才引进来到县城');
            ids.push(r.id);
        }
        if (!ids.length) return '没有空房，招来的人没地方住';
        this._flows.inflow.immigrants += ids.reduce((a, id) => a + (this.resident(id)?.savings ?? 0), 0);
        s.talentHires = (s.talentHires ?? 0) + 1;
        s.talentReadyAt = now + TALENT_COOLDOWN;
        this.fillVacancies(world);
        this.notice('arrive', `人才引进：${ids.length} 位${EDU_NAME[edu]}学历的年轻人来到了县城`, ids,
            '县里出钱招来的人');
        this.event(`人才引进：${ids.length} 位${EDU_NAME[edu]}学历的年轻人来到县城`);
        return null;
    }

    /** 人才引进现在能不能招：返回不能用时的原因，能用返回 null */
    talentStatus(): { ready: boolean; reason: string; nextCost: number[] } {
        const s = this.state;
        const cfg = this._cfg.economy;
        const nextCost = cfg.talentTiers.map((t) => t.price * t.count);
        const wait = (s.talentReadyAt ?? 0) - s.month;
        return { ready: wait <= 0, reason: wait > 0 ? `刚招过一批，还要等 ${wait} 天` : '', nextCost };
    }

    /** 城镇等级（DESIGN 6）。营商环境要等 M3，先只判人口和几栋关键建筑 */
    private updateLevel(): void {
        const pop = this.state.residents.length;
        const s = this.state;
        const hasIndustry = s.buildings.some((b) => {
            const e = this._cfg.building(b.defId);
            return !!e && e.demand === null && !e.publicJob && e.jobs.length > 0;
        });
        const hasSchool = s.buildings.some((b) => b.defId === 'school');
        const hasBank = s.buildings.some((b) => b.defId === 'bank');
        const mood = this.summary().avgMood;

        const reached = (level: TownLevel): boolean => {
            switch (level) {
                case 'village': return true;
                case 'town': return pop >= 20 && hasIndustry;
                case 'county': return pop >= 60 && hasSchool && mood >= 50;
                case 'city': return pop >= 150 && hasBank;
                case 'top100': return pop >= 500;
            }
        };
        const order: TownLevel[] = ['village', 'town', 'county', 'city', 'top100'];
        // 等级只升不降：人口掉回去不该把已经解锁的建筑又锁上
        let idx = order.indexOf(s.level);
        for (let i = idx + 1; i < order.length; i++) if (!reached(order[i])) break; else idx = i;
        if (order[idx] !== s.level) {
            s.level = order[idx];
            this.event(`县城升级为「${LEVEL_NAME[s.level]}」`);
        }
    }

    // ───────────────────────────── 居民 ─────────────────────────────

    private createResident(fixedName: string | null, gender: 'M' | 'F', age: number): Resident {
        const s = this.state;
        const taken = new Set(s.residents.map((r) => r.name));
        const name = fixedName ?? makeName(this._rng, this._cfg.names, age, gender, taken);
        // 学历按年龄给一个合理的起点
        const edu = age < 6 ? 0
            : age < 18 ? (chance(this._rng, 0.5) ? 1 : 0)
                : age < 24 ? nextInt(this._rng, 1, 2)
                    : nextInt(this._rng, 0, 2);
        const r: Resident = {
            id: s.nextResidentId++,
            name, gender, age,
            birthMonth: nextInt(this._rng, 1, 12),
            homeId: null, jobId: null, jobTitle: '', salary: 0,
            savings: Math.round(this._cfg.economy.residents.startSavings * (0.3 + nextFloat(this._rng))),
            spouseId: null, parentIds: [], childIds: [],
            mood: 60, education: edu as 0 | 1 | 2 | 3,
            monthsUnemployed: 0, arrivedMonth: s.month, vehicle: 'walk', log: [],
        };
        this.log(r, '来到县城');
        return r;
    }

    /**
     * 幸福度目标值 + 缓动（0～100）。目标 = 50 + 各分项之和，分项写进 r.moodParts（D026，DESIGN 16.1），
     * 档案里显示，想走的人也用它挑吐槽原因。
     */
    private nextMood(r: Resident, world: World): number {
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        const parts: MoodPart[] = [];
        const add = (key: string, label: string, value: number) => {
            const v = Math.round(value * 10) / 10;
            if (v !== 0) parts.push({ key, label, value: v });
        };

        // 工作
        if (r.age >= rt.workMinAge && r.age < rt.retireAge) {
            if (r.jobId !== null) add('work', '有工作', 12);
            else if (r.idle) add('idle', '不愁吃穿，悠闲', rt.idleMood);
            else add('work', r.monthsUnemployed > 2 ? '好久没找到工作' : '没有工作', -Math.min(25, 8 + r.monthsUnemployed * 2));
        }
        // 通勤：有车的人能接受的距离更远（DESIGN 11.2）
        const tier = this.tier(r);
        if (r.jobId !== null && r.homeId !== null) {
            const d = this.distance(r.homeId, r.jobId);
            const comfort = cfg.commuteComfort * tier.range;
            if (isFinite(d) && d > comfort) add('commute', '上班太远', -Math.min(15, (d - comfort) * 2.5));
        }
        // 有车心情好
        add('vehicle', '有车出门方便', tier.mood);
        // 家附近店铺齐不齐（按自己的交通工具算"附近"）
        if (r.homeId !== null) {
            const cover = this.homeCoverage(r.homeId, world, this.tier(r).range);
            if (cover.size === 0) add('shops', '家附近什么店都没有', -8);
            else add('shops', '家附近有店', cover.size * 3);
        } else {
            add('home', '没地方住', -8);
        }
        // 住房等级（DESIGN 23）
        if (r.homeId !== null) {
            const hb = world.buildingByUid.get(r.homeId);
            const he = hb ? this._cfg.building(hb.defId) : null;
            if (he && he.homeMood) add('home', he.homeMood < 0 ? `住${this.buildingName(hb!.defId)}，条件差` : `住${this.buildingName(hb!.defId)}`, he.homeMood);
            // 特色街道（DESIGN 21）
            for (const st of this.streetsNear(r.homeId)) {
                if (st.who === 'kids' && !r.childIds.some((id) => (this.resident(id)?.age ?? 99) < 18)) continue;
                if (st.who === 'young' && (r.age < 18 || r.age > 35)) continue;
                add('street', `附近有${st.name}`, st.mood);
            }
        }
        // 住房挤不挤
        if (r.homeId !== null) {
            const b = world.buildingByUid.get(r.homeId);
            const econ = b ? this._cfg.building(b.defId) : null;
            if (b && econ && econ.housing > 0 && b.residentIds.length > econ.housing * rt.crowdRatio) add('crowd', '家里太挤', -10);
        }
        // 环境
        const env = clamp(-12, 8, this.homeEnv(r.homeId));
        add('env', env < 0 ? '家附近有污染' : '家附近环境好', env);
        // 公共服务
        if (r.homeId !== null) {
            if (this.hasNearby(r.homeId, 'clinic', CLINIC_RANGE)) add('clinic', '附近有卫生院', 5);
            if (this.hasNearby(r.homeId, 'police', POLICE_RANGE)) add('police', '附近有派出所', 3);
            if (this.hasNearby(r.homeId, 'plaza', PLAZA_RANGE)) add('plaza', '附近有广场', 4);
            const smallKid = r.childIds.some((id) => (this.resident(id)?.age ?? 99) < 7);
            if (smallKid && this.hasNearby(r.homeId, 'kindergarten', KINDERGARTEN_RANGE)) add('kindergarten', '孩子上幼儿园方便', rt.kindergartenMood);
        }
        // 想买的东西买不到
        add('missed', '想买的东西买不到', -(this._missed.get(r.id) ?? 0) * 4);
        // 税重
        add('tax', '税太重', -(this.state.finance.taxRate.business - 0.1) * 100);

        r.moodParts = parts;
        const target = 50 + parts.reduce((a, p) => a + p.value, 0);
        return clamp(0, 100, r.mood + (target - r.mood) * 0.3);
    }

    /** 吐槽原因：扣分最多的两项 */
    private complaints(r: Resident): string[] {
        return (r.moodParts ?? []).filter((p) => p.value < 0).sort((a, b) => a.value - b.value).slice(0, 2).map((p) => p.label);
    }

    /** 家附近有哪几类店：每家店按自己的半径 × 这个人的交通倍率 range 算 */
    private homeCoverage(homeUid: number, world: World, range: number): Set<Demand> {
        const key = `${homeUid}:${range}`;
        const cached = this._homeCoverage.get(key);
        if (cached) return cached;
        const set = new Set<Demand>();
        for (const demand of ['food', 'daily', 'fun', 'other'] as Demand[]) {
            const shops = world.shopsByDemand.get(demand);
            if (!shops) continue;
            for (const b of shops) {
                const d = this.distance(homeUid, b.uid);
                if (isFinite(d) && d <= this.shopRadiusOf(b.defId) * range) { set.add(demand); break; }
            }
        }
        this._homeCoverage.set(key, set);
        return set;
    }

    /** 家周围 3 格内的环境分：树 / 广场 +，工厂 / 矿场 - */
    private homeEnv(uid: number | null): number {
        if (uid === null) return 0;
        const cached = this._homeEnv.get(uid);
        if (cached !== undefined) return cached;
        let sum = 0;
        for (const info of this._town.allBuildings()) {
            const d = this._town.gridDistance(uid, info.uid);
            if (!isFinite(d) || d > 3 || d < 0.5) continue;
            const econ = this._cfg.building(info.defId);
            const env = econ ? econ.env : info.defId === 'tree' ? 1 : info.defId === 'plaza' ? 2 : 0;
            if (env === 0) continue;
            sum += env * (1 - (d - 1) / 4);
        }
        this._homeEnv.set(uid, sum);
        return sum;
    }

    private hasNearby(homeUid: number, defId: string, radius: number): boolean {
        for (const info of this._town.allBuildings()) {
            if (info.defId !== defId) continue;
            const d = this.distance(homeUid, info.uid);
            if (isFinite(d) && d <= radius) return true;
        }
        return false;
    }

    private findSpouse(r: Resident): Resident | null {
        const rt = this._cfg.economy.residents;
        let best: Resident | null = null;
        let bestMood = -1;
        for (const o of this.state.residents) {
            if (o.id === r.id || o.spouseId !== null || o.gender === r.gender) continue;
            if (o.age < rt.marryMinAge || o.age > rt.marryMaxAge) continue;
            if (Math.abs(o.age - r.age) > rt.marryMaxAgeGap) continue;
            if (o.mood <= 50) continue;
            if (o.mood > bestMood) { best = o; bestMood = o.mood; }
        }
        return best;
    }

    /**
     * 婚宴（新建筑第一批）：县里有开着的大酒楼（econ.wedding > 0、有员工）就去最近那家办酒。
     * 两人各出一半，最多花掉两人存款的一半；连一桌酒席的 30% 都凑不出来就不办。
     * 这笔钱当月直接记进酒楼的账（营业额 / 成本 / 税 / 利润），和平常的账一样守恒。
     */
    private holdWedding(a: Resident, b: Resident, income: MonthlyReport['income']): void {
        if (a.spouseId !== b.id) return;
        const home = a.homeId ?? b.homeId;
        let best: BuildingSim | null = null;
        let bestD = Infinity;
        for (const x of this.state.buildings) {
            const e = this._cfg.building(x.defId);
            if (!e || !e.wedding || x.workerIds.length === 0) continue;
            const d = home !== null ? this.distance(home, x.uid) : 0;
            const dd = isFinite(d) ? d : 1e6;
            if (dd < bestD) { best = x; bestD = dd; }
        }
        if (!best) return;
        const econ = this._cfg.building(best.defId)!;
        const pot = Math.max(0, a.savings) + Math.max(0, b.savings);
        const spend = Math.min(econ.wedding!, Math.floor(pot / 2));
        if (spend < econ.wedding! * 0.3) return;
        const fromA = Math.min(Math.max(0, a.savings), Math.ceil(spend / 2));
        const fromB = spend - fromA;
        a.savings -= fromA;
        b.savings -= fromB;
        let rate = this.state.finance.taxRate.business;
        if ((best.taxBreakUntil ?? 0) > this.state.month) rate /= 2;
        const cost = Math.round(spend * econ.costRate);
        const tax = Math.round(spend * rate);
        const profit = spend - cost - tax;
        best.lastRevenue += spend;
        best.lastCustomers += 1;
        best.lastTax += tax;
        best.lastCost = (best.lastCost ?? 0) + cost;
        best.lastProfit = (best.lastProfit ?? 0) + profit;
        // 财政这个月已经结过账，税和县属利润直接进资金（同买车，见 buyVehicles）
        income.business += tax;
        this.state.finance.funds += tax;
        this._flows.outflow.goodsCost += cost;
        if ((best.owner ?? 'county') === 'county') { income.profit += profit; this.state.finance.funds += profit; }
        else this._flows.outflow.privateProfit += profit;
        if ((best.lossMonths ?? 0) > 0 && (best.lastProfit ?? 0) >= 0) best.lossMonths = 0;
        const where = this.buildingName(best.defId);
        this.event(`${a.name} 和 ${b.name} 在${where}办了婚宴，花了 ¥${spend}`);
        this.log(a, `在${where}办婚宴`);
        this.log(b, `在${where}办婚宴`);
    }

    private marry(a: Resident, b: Resident, silent: boolean): void {
        if (a.spouseId !== null || b.spouseId !== null || a.gender === b.gender) return;
        a.spouseId = b.id;
        b.spouseId = a.id;
        if (!silent) this.event(`${a.name} 和 ${b.name} 结婚了`);
        this.log(a, `和 ${b.name} 结婚`);
        this.log(b, `和 ${a.name} 结婚`);

        // 搬进两人里条件好的那家（住房容量大的）
        const homeA = a.homeId !== null ? (this.state.buildings.find((x) => x.uid === a.homeId) ?? null) : null;
        const homeB = b.homeId !== null ? (this.state.buildings.find((x) => x.uid === b.homeId) ?? null) : null;
        const capOf = (h: BuildingSim | null) => {
            const e = h ? this._cfg.building(h.defId) : null;
            return e && h ? e.housing - h.residentIds.length : -1;
        };
        const best = capOf(homeA) >= capOf(homeB) ? homeA : homeB;
        // 两边都住满了就先分开住，等下个月有人搬走 / 有空房再说（不能硬塞）
        if (best && capOf(best) > 0) {
            for (const p of [a, b]) {
                if (p.homeId === best.uid) continue;
                this.detachHome(p);
                p.homeId = best.uid;
                if (best.residentIds.indexOf(p.id) < 0) best.residentIds.push(p.id);
            }
        }
    }

    private haveChild(parent: Resident): void {
        const home = parent.homeId !== null ? this.state.buildings.find((b) => b.uid === parent.homeId) : null;
        const econ = home ? this._cfg.building(home.defId) : null;
        if (!home || !econ) return;
        if (home.residentIds.length >= econ.housing) return;   // 住不下就不生
        const spouse = parent.spouseId !== null ? this.resident(parent.spouseId) : null;
        const child = this.createResident(null, chance(this._rng, 0.5) ? 'M' : 'F', 0);
        child.parentIds = spouse ? [parent.id, spouse.id] : [parent.id];
        child.homeId = home.uid;
        child.savings = 0;
        home.residentIds.push(child.id);
        parent.childIds.push(child.id);
        if (spouse) spouse.childIds.push(child.id);
        this.state.residents.push(child);
        this.event(`${parent.name} 家添了一个孩子`);
        this.log(parent, `孩子 ${child.name} 出生`);
    }

    private die(r: Resident): void {
        const s = this.state;
        this.event(`${r.name} 去世了`);
        // 遗产：给配偶，没有就给第一个还在县里的孩子，都没有就流出县外（D026）
        const heir = (r.spouseId !== null ? this.resident(r.spouseId) : null)
            ?? r.childIds.map((id) => this.resident(id)).find((x): x is Resident => !!x) ?? null;
        if (heir) heir.savings += r.savings;
        else this._flows.outflow.leavers += r.savings;
        for (const b of s.buildings) {
            b.residentIds = b.residentIds.filter((id) => id !== r.id);
            b.workerIds = b.workerIds.filter((id) => id !== r.id);
        }
        for (const o of s.residents) {
            if (o.spouseId === r.id) o.spouseId = null;
            o.parentIds = o.parentIds.filter((id) => id !== r.id);
            o.childIds = o.childIds.filter((id) => id !== r.id);
        }
        s.residents = s.residents.filter((x) => x.id !== r.id);
        this._missed.delete(r.id);
    }

    /** 全家搬走：本人 + 配偶 + 未成年子女（DESIGN 2.6） */
    private leaveByHousehold(r: Resident, reason: string): Resident[] {
        const s = this.state;
        const family: Resident[] = [r];
        if (r.spouseId !== null) {
            const sp = this.resident(r.spouseId);
            if (sp) family.push(sp);
        }
        for (const id of r.childIds) {
            const c = this.resident(id);
            if (c && c.age < this._cfg.economy.residents.workMinAge) family.push(c);
        }
        this.event(`${family.map((x) => x.name).join('、')} ${reason}`);
        this.notice('leave', `${r.name}${family.length > 1 ? '一家' : ''}搬离了县城`, family.map((x) => x.id),
            r.leaving && r.leaving.reasons.length ? r.leaving.reasons.join('、') : undefined);
        for (const member of family) {
            this._flows.outflow.leavers += member.savings;   // 存款带走
            for (const b of s.buildings) {
                b.residentIds = b.residentIds.filter((id) => id !== member.id);
                b.workerIds = b.workerIds.filter((id) => id !== member.id);
            }
            s.residents = s.residents.filter((x) => x.id !== member.id);
            this._missed.delete(member.id);
        }
        return family;
    }

    /** 找工作：工资 − 通勤距离 × 惩罚，挑最高的（DESIGN 2.4） */
    private bestJobFor(r: Resident, world: World,
        target = r.wish?.kind === 'job' ? r.wish.jobTarget : undefined, uid?: number, title?: string): Opening | null {
        const openings = openingsFor(r, this.state.buildings, world.econOf, world.residentsById);
        if (!openings.length) return null;
        // 有车的人不怕远：通勤惩罚 ÷ 交通倍率（DESIGN 11.2）
        const penalty = this._cfg.economy.residents.commutePenalty / this.tier(r).range;
        let best: Opening | null = null;
        let bestScore = -Infinity;
        for (const o of openings) {
            if (uid !== undefined && (o.building.uid !== uid || o.slot.title !== title)) continue;
            if (target && (o.building.defId !== target.defId || o.slot.title !== target.title)) continue;
            const d = r.homeId === null ? 0 : this.distance(r.homeId, o.building.uid);
            const dist = isFinite(d) ? d : this._cfg.economy.serviceRadius * 2;
            const score = o.slot.salary - dist * penalty;
            if (score > bestScore) { best = o; bestScore = score; }
        }
        return best;
    }

    private takeJob(r: Resident, o: Opening): void {
        const econ = this._cfg.building(o.building.defId);
        if (!econ) return;
        assignJob(r, o.building, econ, o.index);
        this.log(r, `入职 ${this.buildingName(o.building.defId)}·${o.slot.title}`);
    }

    /**
     * 这个月要不要继续赋闲（D024）。门槛 = idleSavingsMonths × (房租 + idleLivingCost)；
     * 已经在赋闲的，存款跌到门槛 × idleExitRatio 以下才出来找工作。
     */
    private staysIdle(r: Resident): boolean {
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        const line = rt.idleSavingsMonths * (cfg.rentPerPerson + rt.idleLivingCost);
        if (line <= 0) return false;
        return r.savings >= (r.idle ? line * rt.idleExitRatio : line);
    }

    private fillVacancies(world: World): void {
        for (const r of this.state.residents) {
            if (r.idle || this.staysIdle(r)) continue;   // 有钱的人不被塞岗位（D024）
            if (r.jobId !== null || r.age < this._cfg.economy.residents.workMinAge || r.age >= this._cfg.economy.residents.retireAge) continue;
            const job = this.bestJobFor(r, world);
            if (job) this.takeJob(r, job);
        }
    }

    /** 在职的人每年生日那个月看看有没有工资高出一截的地方（DESIGN 2.4） */
    private maybeHopJob(r: Resident, world: World): void {
        if (r.jobId === null) return;
        if (!chance(this._rng, this._cfg.economy.residents.jobHopChance)) return;
        const needs = this._cfg.economy.residents.jobHopRaise;
        const openings = openingsFor(r, this.state.buildings, world.econOf, world.residentsById);
        let best: Opening | null = null;
        for (const o of openings) {
            if (o.building.uid === r.jobId) continue;
            if (o.slot.salary <= r.salary * needs) continue;
            if (!best || o.slot.salary > best.slot.salary) best = o;
        }
        if (!best) return;
        const old = world.buildingByUid.get(r.jobId) ?? null;
        this.log(r, `离开 ${old ? this.buildingName(old.defId) : '原来的工作'}`);
        clearJob(r, old);
        this.takeJob(r, best);
    }

    // ───────────────────────────── 交通工具（DESIGN 11） ─────────────────────────────

    private tier(r: Resident): VehicleTier {
        const tiers = this._cfg.economy.vehicles.tiers;
        return tiers[r.vehicle] ?? tiers.walk;
    }

    /** 某种店的辐射半径（步行沿路格数；没配就是 serviceRadius） */
    private shopRadiusOf(defId: string): number {
        const e = this._cfg.building(defId);
        return e ? shopRadius(e, this._cfg) : this._cfg.economy.serviceRadius;
    }

    /**
     * 每月买车：18～65 岁、有工作；县里有对应工厂；储蓄、月薪够；只往上换。
     * 同时满足几档只看最好的那档，按那档的概率掷一次。
     * 车钱从储蓄扣，算进最近一座对应工厂的产值，企业税当月入账。
     */
    private buyVehicles(income: MonthlyReport['income']): void {
        const s = this.state;
        const vc = this._cfg.economy.vehicles;
        const factories = new Map<string, BuildingSim[]>();
        for (const b of s.buildings) {
            const list = factories.get(b.defId);
            if (list) list.push(b); else factories.set(b.defId, [b]);
        }
        const hasFactory = (v: Vehicle) => {
            const id = vc.tiers[v].factory;
            return !!id && (factories.get(id)?.length ?? 0) > 0;
        };
        if (!VEHICLE_ORDER.some((v) => v !== 'walk' && hasFactory(v))) return;

        for (const r of s.residents) {
            if (r.age < vc.minAge || r.age > vc.maxAge || r.jobId === null) continue;
            const current = VEHICLE_ORDER.indexOf(r.vehicle);
            let pick: Vehicle | null = null;
            for (let i = VEHICLE_ORDER.length - 1; i > current; i--) {
                const v = VEHICLE_ORDER[i];
                const t = vc.tiers[v];
                if (!hasFactory(v)) continue;
                if (r.savings < t.price * t.savingsRatio) continue;
                if (r.salary < t.minSalary) continue;
                pick = v;
                break;
            }
            if (!pick) continue;
            const t = vc.tiers[pick];
            if (!chance(this._rng, t.chance)) continue;

            const factory = this.nearestOf(r.homeId, factories.get(t.factory)!);
            const fEcon = this._cfg.building(factory.defId);
            r.savings -= t.price;
            r.vehicle = pick;
            // 车款进工厂的账：成本流出县外，税和利润照常（D026）
            const tax = Math.round(t.price * s.finance.taxRate.industry);
            const cost = Math.round(t.price * (fEcon ? fEcon.costRate : 0));
            const profit = t.price - tax - cost;
            factory.lastRevenue += t.price;
            factory.lastTax += tax;
            factory.lastCost = (factory.lastCost ?? 0) + cost;
            factory.lastProfit = (factory.lastProfit ?? 0) + profit;
            income.industry += tax;
            this._flows.outflow.goodsCost += cost;
            s.finance.funds += tax;
            if ((factory.owner ?? 'county') === 'county') { income.profit += profit; s.finance.funds += profit; }
            else this._flows.outflow.privateProfit += profit;
            const name = VEHICLE_NAME[pick];
            this.log(r, `买了一辆${name}`);
            this.event(`${r.name}买了一辆${name}`);
        }
    }

    /** 离家沿路最近的一座；都走不到（或没家）就取 uid 最小的那座 */
    private nearestOf(homeUid: number | null, list: BuildingSim[]): BuildingSim {
        let best = list[0];
        let bestD = Infinity;
        for (const b of list) {
            const d = homeUid === null ? Infinity : this.distance(homeUid, b.uid);
            if (d < bestD || (d === bestD && b.uid < best.uid)) { best = b; bestD = d; }
        }
        return best;
    }

    // ───────────────────────────── 住房 / 岗位 ─────────────────────────────

    private assignHomes(list: Resident[]): void {
        const supply = this.housingSupply();
        for (const r of list) {
            if (r.homeId !== null) continue;
            // 挑还有空位、且空位最多的（先填满一栋，少占地方）
            let target: BuildingSim | null = null;
            let bestSpace = 0;
            for (const { b, econ } of supply) {
                const space = econ.housing - b.residentIds.length;
                if (space <= bestSpace) continue;
                bestSpace = space;
                target = b;
            }
            if (!target) continue;
            r.homeId = target.uid;
            if (target.residentIds.indexOf(r.id) < 0) target.residentIds.push(r.id);
            this.log(r, `住进了 ${this.buildingName(target.defId)}`);
        }
    }

    private detachHome(r: Resident): void {
        if (r.homeId === null) return;
        const home = this.state.buildings.find((b) => b.uid === r.homeId);
        if (home) home.residentIds = home.residentIds.filter((id) => id !== r.id);
        r.homeId = null;
    }

    private housingSupply(): Array<{ b: BuildingSim; econ: BuildingEcon }> {
        const out: Array<{ b: BuildingSim; econ: BuildingEcon }> = [];
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (econ && econ.housing > 0) out.push({ b, econ });
        }
        return out;
    }

    private countFreeHousing(): number {
        let free = 0;
        for (const { b, econ } of this.housingSupply()) free += Math.max(0, econ.housing - b.residentIds.length);
        return free;
    }

    private countOpenJobs(world: World): number {
        let n = 0;
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.jobs.length) continue;
            n += staffing(b, econ, world.residentsById).open.length;
        }
        return n;
    }

    private measureStaff(world: World): void {
        this._staff.clear();
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ) continue;
            this._staff.set(b.uid, staffing(b, econ, world.residentsById).staff);
        }
    }

    private staffRatio(b: BuildingSim, econ: BuildingEcon): number {
        const required = totalPositions(econ);
        if (required <= 0) return 1;
        return Math.min(1, (this._staff.get(b.uid) ?? 0) / required);
    }

    // ───────────────────────────── 小工具 ─────────────────────────────

    private refreshWorld(): World {
        this._town.refresh?.();
        const world = buildWorld(this.state.residents, this.state.buildings, (uid) => this.econOfUid(uid));
        // 两头对不上的引用顺手修掉（地图被外面改过、或者读档后不一致）
        for (const b of this.state.buildings) {
            b.residentIds = b.residentIds.filter((id) => world.residentsById.has(id));
            b.workerIds = b.workerIds.filter((id) => world.residentsById.has(id));
        }
        for (const r of this.state.residents) {
            if (r.homeId !== null && !world.buildingByUid.has(r.homeId)) r.homeId = null;
            if (r.jobId !== null && !world.buildingByUid.has(r.jobId)) { r.jobId = null; r.jobTitle = ''; r.salary = 0; }
        }
        return world;
    }

    private econOfUid(uid: number): BuildingEcon | null {
        const b = this.state.buildings.find((x) => x.uid === uid);
        return b ? this._cfg.building(b.defId) : null;
    }

    private distance(a: number, b: number): number {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const cached = this._distCache.get(key);
        if (cached !== undefined) return cached;
        const d = this._town.roadDistance(a, b);
        this._distCache.set(key, d);
        return d;
    }

    private buildingName(defId: string): string {
        return DEF_NAMES[defId] ?? defId;
    }

    private log(r: Resident, text: string): void {
        r.log.push({ month: this.state.month, text });
        const limit = this._cfg.economy.logLimit;
        if (r.log.length > limit) r.log.splice(0, r.log.length - limit);
    }

    private notice(kind: Notice['kind'], text: string, residentIds: number[], reason?: string): void {
        this._notices.push({ kind, text, residentIds, reason });
    }

    /** 来的人的理由：挑县里最突出的优点（DESIGN 16.2） */
    private arriveReason(world: World): string {
        const s = this.state;
        const has = (id: string) => s.buildings.some((b) => b.defId === id);
        const opts: string[] = [];
        if (this.countOpenJobs(world) > 3) opts.push('听亲戚说这儿好找工作');
        if (this.summary().avgMood >= 65) opts.push('听说这儿的人日子过得舒心');
        if (has('plaza')) opts.push('听说这儿有个热闹的广场');
        if (has('school')) opts.push('想让孩子在这儿上学');
        if (has('hotpot') || has('bbq')) opts.push('听说这儿吃的不错');
        if (has('clinic')) opts.push('这儿看病方便');
        if (!opts.length) opts.push('想换个地方重新开始');
        return opts[nextInt(this._rng, 0, opts.length - 1)];
    }

    private event(text: string): void {
        this._events.push({ month: this.state.month, text });
    }

    private syncRng(): void {
        this.state.rngState = this._rng.state;
    }
}

function clamp(min: number, max: number, v: number): number {
    return v < min ? min : v > max ? max : v;
}

/** 日志里用的建筑名。模拟层不读 buildings.json，这里留一份小表 */
/** 和 buildings.json 的 name 保持一致（模拟层不读那个表）；测试会对一遍 */
export const DEF_NAMES: Record<string, string> = {
    hut: '土坯农房', brick: '砖瓦房', house: '自建小楼', apartment: '商品房小区', detached: '独栋', villa: '别墅', 'school-house': '学区房',
    breakfast: '早餐铺', 'milk-tea': '奶茶店', bbq: '烧烤摊', hotpot: '火锅店',
    parcel: '快递驿站', supermarket: '超市', 'net-cafe': '网吧', 'phone-shop': '手机店',
    barber: '理发店', tutoring: '补习班',
    noodle: '面馆', restaurant: '家常菜馆', banquet: '大酒楼', store: '小卖部', market: '菜市场', pharmacy: '药店',
    teahouse: '茶馆', 'old-street': '老街', dorm: '工人宿舍', kindergarten: '幼儿园', farm: '农田',
    workshop: '小作坊', textile: '纺织厂', 'food-factory': '食品厂', electronics: '电子厂',
    center: '县发展中心', school: '学校', clinic: '卫生院', police: '派出所', bank: '银行',
    bridge: '桥', port: '港口', mine: '矿场', plaza: '广场', tree: '行道树',
    'moto-factory': '摩托车厂', 'car-factory': '汽车厂',
    'dirt-road': '土路', road: '城市道路', 'dirt-tile': '泥土地', flagstone: '石板路', 'flower-bed': '花坛',
};

/** 交地时我们要出的钱：补贴路线 = 补贴款，供地 = 0 */
function dealCost(d: PendingDeal): number {
    return d.mode === 'subsidy' ? d.subsidy ?? 0 : 0;
}

const VEHICLE_NAME: Record<Vehicle, string> = {
    walk: '', ebike: '电动车', moto: '摩托车', car: '汽车',
};

const VEHICLES: Vehicle[] = ['walk', 'ebike', 'moto', 'car'];

/**
 * 读档时把旧存档补齐（原地改，返回同一份对象）。不改 SaveGame.ts，迁移放在进模拟层的这一步：
 *   - 居民缺 `vehicle`（D022 之前的存档）或者是认不得的值 → 'walk'
 *   - 缺 log / parentIds / childIds 的补空数组
 */
/** 0..1 夹一下（画面层传进来的本月进度偶尔会有浮点越界） */
function clamp01(v: number): number {
    return !isFinite(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 工地 / 翻盖的开工时刻（绝对：month + 当天进度）。老存档没 startAt 就按已干的整月数倒推 */
function constructionStart(
    s: SimState,
    c: { left: number; total: number; startAt?: number },
): number {
    if (typeof c.startAt === 'number') return c.startAt;
    return s.month - (c.total - c.left);
}

/**
 * 到月初结算这一刻还剩多少天（可以不是整数：月中开的工，本月只干了一部分）。
 * 月末跨过「开工时刻 + 工期」那一下才算完工，所以完工总落在某个月初。
 */
function constructionLeft(s: SimState, c: { left: number; total: number; startAt?: number }): number {
    return Math.max(0, constructionStart(s, c) + c.total - s.month);
}

/** 开工到完工结算那一刻的实际时长（月）：完工是第一个 ≥ 开工时刻 + 工期的月初 */
function constructionSpan(s: SimState, c: { left: number; total: number; startAt?: number }): number {
    const start = constructionStart(s, c);
    return Math.max(0.001, Math.ceil(start + c.total) - start);
}

export function normalizeSimState(state: SimState, cfg?: SimConfig): SimState {
    if (!Array.isArray(state.residents)) state.residents = [];
    if (!Array.isArray(state.buildings)) state.buildings = [];
    for (const r of state.residents) {
        if (VEHICLES.indexOf(r.vehicle) < 0) r.vehicle = 'walk';
        if (!Array.isArray(r.log)) r.log = [];
        if (!Array.isArray(r.parentIds)) r.parentIds = [];
        if (!Array.isArray(r.childIds)) r.childIds = [];
    }
    if (typeof state.nextResidentId !== 'number') {
        state.nextResidentId = state.residents.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    }
    if (typeof state.rngState !== 'number') state.rngState = (state.seed >>> 0) || 1;
    // 施工记录补 startAt（老存档只有 left/total，按「已干完 total-left 天」倒推开工时刻）
    for (const c of state.construction ?? []) if (typeof c.startAt !== 'number') c.startAt = state.month - (c.total - c.left);
    for (const r of state.renovations ?? []) if (typeof r.startAt !== 'number') r.startAt = state.month - (r.total - r.left);
    if (cfg && state.finance && !state.finance.taxRate) state.finance.taxRate = { ...cfg.economy.taxRate };
    // D030 以前的存档：research 是单个对象（一次一项），转成数组；研究位 1 个
    if (state.research && !Array.isArray(state.research)) state.research = [state.research as any];
    // D026 以前的存档：没有研究记录 → 按当前城镇等级把该等级及以下的研究都算完成，地图上已有的楼也算解锁
    if (cfg && cfg.progress && !Array.isArray(state.unlocked)) {
        const lv = LEVEL_ORDER.indexOf(state.level);
        const done = cfg.progress.research.filter((r) => LEVEL_ORDER.indexOf(r.level) <= lv);
        state.researched = done.map((r) => r.id);
        const un = new Set<string>(cfg.progress.initialUnlocked);
        for (const r of done) for (const id of r.unlocks) un.add(id);
        for (const b of state.buildings) un.add(b.defId);
        state.unlocked = Array.from(un);
        state.research = null;
        state.wishesDone = state.wishesDone ?? 0;
    }
    // 老存档可能缺初始解锁（比如土坯农房没进 unlocked，底栏就把它当「没有研究能解锁」藏掉）
    if (cfg && cfg.progress && Array.isArray(state.unlocked)) {
        for (const id of cfg.progress.initialUnlocked) if (state.unlocked.indexOf(id) < 0) state.unlocked.push(id);
    }
    return state;
}

const LEVEL_ORDER: TownLevel[] = ['village', 'town', 'county', 'city', 'top100'];
/** 研究位（D030）：最多 3 个；SLOT_COSTS[n] = 开第 n+1 个位的价钱 */
const MAX_SLOTS = 3;
const SLOT_COSTS: Record<number, number> = { 1: 25000, 2: 60000 };
/** 人才引进冷却：几天内只能招一次（D030） */
const TALENT_COOLDOWN = 5;
/** 加速研究：剩余每天折多少钱（至少收这么多） */
const RUSH_MIN = 500;
function rushCost(r: ResearchDef, left: number): number {
    const perDay = r.days > 0 ? r.cost / r.days : r.cost;
    return Math.max(RUSH_MIN, Math.ceil(left * perDay));
}
const EDU_NAME = ['没上过学', '初中', '高中', '大专'];
const DEMAND_ORDER: Demand[] = ['food', 'daily', 'fun', 'other'];
const WISH_MOOD_KEYS: Record<WishKind, string[]> = {
    job: ['work'], shop: ['shops', 'missed'], house: ['home', 'crowd'], commute: ['commute'],
    env: ['env'], vehicle: ['vehicle'], school: ['school'], clinic: ['clinic'],
};
const WISH_SHOP_TEXT: Record<Demand, string> = {
    food: '家附近没地方吃饭', daily: '家附近买不到日用品', fun: '家附近没地方玩', other: '家附近没有理发、修手机的地方',
};
const WISH_DONE_TEXT: Partial<Record<WishKind, string>> = {
    house: '住上好房子了', job: '找到工作了', school: '孩子能上学了', clinic: '附近有卫生院了', commute: '上班不远了', env: '家附近环境好了', vehicle: '买上车了',
};

const LEVEL_NAME: Record<TownLevel, string> = {
    village: '村口', town: '镇上', county: '县城', city: '县级市', top100: '百强县',
};

/** 折线插值：points 按 x 升序 */
function curve(points: [number, number][], x: number): number {
    if (!points.length) return 1;
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i];
        if (x <= x1) {
            const [x0, y0] = points[i - 1];
            return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
    }
    return points[points.length - 1][1];
}

