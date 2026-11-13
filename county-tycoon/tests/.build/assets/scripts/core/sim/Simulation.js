"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Simulation = void 0;
const rng_1 = require("./rng");
const labor_1 = require("./labor");
const consumption_1 = require("./consumption");
const world_1 = require("./world");
const names_1 = require("./names");
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
class Simulation {
    constructor(cfg, town, opts) {
        this.onMonth = null;
        /** 本月盖楼花掉的钱（进月账单的 expense.construction） */
        this._constructionSpent = 0;
        /** 本月每家店服务人次 / 营业额 / 在岗人数 */
        this._served = new Map();
        this._revenue = new Map();
        this._staff = new Map();
        /** 本月每人没买到东西的需求类数（心情用） */
        this._missed = new Map();
        /** 每人心情低于线的连续月数 */
        this._badMoodMonths = new Map();
        this._events = [];
        /** 沿路距离缓存，每月清一次 */
        this._distCache = new Map();
        /** 每个家能覆盖到哪几类消费，每月清一次 */
        this._homeCoverage = new Map();
        /** 每个家周围的环境分，每月清一次 */
        this._homeEnv = new Map();
        this._cfg = cfg;
        this._town = town;
        const seed = opts?.seed ?? 20260101;
        this._rng = (0, rng_1.rngFromSeed)(seed);
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
        // 地图上已经有的建筑（开局自带的自建房等）先登记，等人搬进来
        this.adoptExistingBuildings();
        if (opts?.opening !== false)
            this.spawnOpeningResidents();
        this.syncRng();
    }
    // ───────────────────────────── 对外接口（SimApi） ─────────────────────────────
    stepMonth() {
        const s = this.state;
        s.month++;
        this._served.clear();
        this._revenue.clear();
        this._staff.clear();
        this._missed.clear();
        this._events = [];
        this._distCache.clear();
        this._homeCoverage.clear();
        this._homeEnv.clear();
        const populationBefore = s.residents.length;
        this.ageEveryone(); // 生日：长一岁、上学、退休、离世
        const world = this.refreshWorld();
        this.assignHomes(s.residents.filter((r) => r.homeId === null));
        this.fillVacancies(world); // 月初先把空岗填上（新盖的楼、新来的人）
        this.measureStaff(world);
        this.payWages(world); // 1. 上班领工资
        this.runConsumption(world); // 2. 消费
        const { income, expense } = this.settleFinance(world); // 3. 交租交税、财政支出
        this.updateResidents(world); // 4. 心情、找工作、结婚生子、搬走
        this.assessBuildings(world); //    店铺口碑
        this.runImmigration(world); // 5. 迁入
        this.updateLevel(); //    城镇等级
        const report = {
            month: s.month,
            income,
            expense,
            populationBefore,
            populationAfter: s.residents.length,
            events: this._events.slice(),
        };
        s.finance.lastMonth = report;
        this.syncRng();
        if (this.onMonth)
            this.onMonth(report);
        return report;
    }
    onBuilt(uid, defId) {
        const econ = this._cfg.building(defId);
        const s = this.state;
        if (s.buildings.some((b) => b.uid === uid))
            return true;
        const cost = econ ? econ.cost : 0;
        if (cost > s.finance.funds)
            return false;
        s.finance.funds -= cost;
        this._constructionSpent += cost;
        s.buildings.push({
            uid, defId, residentIds: [], workerIds: [],
            lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50,
        });
        this._town.refresh?.();
        // 有了新楼，先把没工作的人配上去（不等下个月）
        const world = this.refreshWorld();
        this.fillVacancies(world);
        this.syncRng();
        return true;
    }
    onDemolished(uid) {
        const s = this.state;
        const b = s.buildings.find((x) => x.uid === uid);
        if (!b)
            return;
        for (const id of b.workerIds.slice()) {
            const r = s.residents.find((x) => x.id === id);
            if (r && r.jobId === uid)
                (0, labor_1.clearJob)(r, null);
        }
        for (const id of b.residentIds.slice()) {
            const r = s.residents.find((x) => x.id === id);
            if (r && r.homeId === uid)
                r.homeId = null;
        }
        s.buildings = s.buildings.filter((x) => x.uid !== uid);
        this._town.refresh?.();
        // 被拆掉的楼里的人另找房子
        const world = this.refreshWorld();
        this.assignHomes(s.residents.filter((r) => r.homeId === null));
        this.syncRng();
    }
    canAfford(defId) {
        const econ = this._cfg.building(defId);
        if (!econ)
            return true;
        return this.state.finance.funds >= econ.cost;
    }
    resident(id) {
        return this.state.residents.find((r) => r.id === id) ?? null;
    }
    building(uid) {
        return this.state.buildings.find((b) => b.uid === uid) ?? null;
    }
    summary() {
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
        };
    }
    /** 玩家调税率（界面滑条用）。范围由 economy.json 的 tuning.taxRange 定 */
    setTaxRate(key, value) {
        const range = this._cfg.economy.taxRange;
        this.state.finance.taxRate[key] = Math.max(range.min, Math.min(range.max, value));
    }
    // ───────────────────────────── 开局 ─────────────────────────────
    adoptExistingBuildings() {
        for (const info of this._town.allBuildings()) {
            if (info.road)
                continue; // 道路不进模拟层
            if (!this._cfg.building(info.defId))
                continue; // 树、桥之类没有经营数据
            if (this.state.buildings.some((b) => b.uid === info.uid))
                continue;
            this.state.buildings.push({
                uid: info.uid, defId: info.defId, residentIds: [], workerIds: [],
                lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50,
            });
        }
    }
    /** 开局那几个人（DESIGN 2.7：新手期有节奏） */
    spawnOpeningResidents() {
        const opening = this._cfg.names.opening;
        const created = [];
        if (opening && opening.length) {
            for (const p of opening) {
                const r = this.createResident(p.name, p.gender, p.age);
                created.push(r);
                this.state.residents.push(r);
            }
            for (let i = 0; i < created.length; i++) {
                const idx = opening[i].spouseOf;
                if (typeof idx !== 'number' || idx < 0 || idx >= created.length)
                    continue;
                this.marry(created[i], created[idx], true);
            }
        }
        else {
            // 没配开局名单时的默认 5 人：一对老夫妻 + 一对小两口 + 一个回乡青年
            const specs = [
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
    ageEveryone() {
        const s = this.state;
        const monthOfYear = s.month % 12 + 1;
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        for (const r of s.residents.slice()) {
            if (r.birthMonth !== monthOfYear)
                continue;
            r.age++;
            // 上学：6～17 岁，村里有学校、老师够用，学历才往上走（DESIGN 2.2）
            if (r.age >= rt.schoolMinAge && r.age <= rt.schoolMaxAge && this.schoolCapacityOk()) {
                const target = r.age >= 17 ? cfg.maxEducationWithSchool
                    : r.age >= 15 ? Math.min(cfg.maxEducationWithSchool, 2)
                        : r.age >= 11 ? Math.min(cfg.maxEducationWithSchool, 1) : 0;
                if (target > r.education) {
                    r.education = target;
                    if (r.education >= 2)
                        this.log(r, '从学校毕业了');
                }
            }
            // 退休
            if (r.age >= rt.retireAge && r.jobId !== null) {
                const b = s.buildings.find((x) => x.uid === r.jobId) ?? null;
                (0, labor_1.clearJob)(r, b);
                this.log(r, '退休了，不再上班');
            }
            // 离世：过了 deathAge 每年概率递增，最高 50%
            if (r.age >= cfg.deathAge) {
                const p = Math.min(0.5, 0.05 * (r.age - cfg.deathAge + 1));
                if ((0, rng_1.chance)(this._rng, p))
                    this.die(r);
            }
        }
    }
    /** 学校够不够用：在读学生 ≤ 老师数 × 每老师带的人数 */
    schoolCapacityOk() {
        const rt = this._cfg.economy.residents;
        const students = this.state.residents.filter((r) => r.age >= rt.schoolMinAge && r.age <= rt.schoolMaxAge).length;
        if (students === 0)
            return true;
        let teachers = 0;
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.publicJob)
                continue;
            for (const slot of econ.jobs) {
                if (slot.title.includes('老师'))
                    teachers += Math.min(slot.count, b.workerIds.length);
            }
        }
        return teachers * this._cfg.economy.studentsPerTeacher >= students;
    }
    /** 1. 上班领工资。公共岗位的钱由财政出，在 settleFinance 里发 */
    payWages(world) {
        for (const r of this.state.residents) {
            if (r.jobId === null)
                continue;
            const b = world.buildingByUid.get(r.jobId);
            if (!b) {
                (0, labor_1.clearJob)(r, null);
                continue;
            }
            const econ = this._cfg.building(b.defId);
            if (!econ)
                continue;
            if (!econ.publicJob)
                r.savings += r.salary;
        }
    }
    /** 2. 消费：工资的 spendRate + 结余的 savingsSpendRate，按四类需求花掉 */
    runConsumption(world) {
        const cfg = this._cfg.economy;
        const ctx = {
            cfg: this._cfg,
            town: this._town,
            econOf: (uid) => this.econOfUid(uid),
            shopsByDemand: world.shopsByDemand,
            served: this._served,
            revenue: this._revenue,
            staff: this._staff,
        };
        for (const r of this.state.residents) {
            // 孩子不自己花钱（DESIGN 2.2：算进家庭开销）
            if (r.age < cfg.residents.workMinAge)
                continue;
            const budget = r.salary * cfg.spendRate + Math.max(0, r.savings) * cfg.savingsSpendRate;
            if (budget <= 0)
                continue;
            const res = (0, consumption_1.consumeForResident)(r, budget, ctx);
            r.savings -= res.spent;
            this._missed.set(r.id, res.missed);
        }
    }
    /** 3. 交租、交税、财政支出 */
    settleFinance(world) {
        const s = this.state;
        const cfg = this._cfg.economy;
        const rates = s.finance.taxRate;
        const income = { business: 0, industry: 0, income: 0, land: 0, investment: 0 };
        const expense = {
            construction: this._constructionSpent, upkeep: 0, publicWages: 0, pension: 0, promotion: 0,
        };
        this._constructionSpent = 0;
        // 房租：住户交租，钱流出本地（M4 前固定金额，见 DESIGN 2.3）
        for (const r of s.residents) {
            if (r.homeId === null)
                continue;
            r.savings -= Math.min(cfg.rentPerPerson, Math.max(0, r.savings));
        }
        // 营业税 / 企业税，同时刷新每栋楼的"上月营业额 / 人次 / 交税"
        for (const b of s.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ)
                continue;
            if (econ.demand !== null && econ.capacity > 0) {
                const revenue = Math.round(this._revenue.get(b.uid) ?? 0);
                b.lastRevenue = revenue;
                b.lastCustomers = this._served.get(b.uid) ?? 0;
                b.lastTax = Math.round(revenue * rates.business);
                income.business += b.lastTax;
            }
            else if (econ.jobs.length && !econ.publicJob) {
                // 工厂：产值按在岗比例折算，产品卖到县外
                const output = Math.round(econ.capacity * econ.price * this.staffRatio(b, econ));
                b.lastRevenue = output;
                b.lastCustomers = 0;
                b.lastTax = Math.round(output * rates.industry);
                income.industry += b.lastTax;
            }
            else {
                b.lastRevenue = 0;
                b.lastCustomers = 0;
                b.lastTax = 0;
            }
        }
        // 个税：只算真的收得上来的
        for (const r of s.residents) {
            if (r.salary <= cfg.incomeTaxThreshold)
                continue;
            const due = Math.round((r.salary - cfg.incomeTaxThreshold) * rates.income);
            if (due <= 0)
                continue;
            const paid = Math.min(due, Math.max(0, r.savings));
            r.savings -= paid;
            income.income += paid;
        }
        // 公共岗位工资 + 养老金（财政出）
        for (const b of s.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.publicJob)
                continue;
            for (const id of b.workerIds) {
                const r = s.residents.find((x) => x.id === id);
                if (!r)
                    continue;
                expense.publicWages += r.salary;
                r.savings += r.salary;
            }
        }
        for (const r of s.residents) {
            if (r.age < cfg.residents.retireAge)
                continue;
            expense.pension += cfg.pension;
            r.savings += cfg.pension;
        }
        // 维护费
        for (const b of s.buildings) {
            const econ = this._cfg.building(b.defId);
            if (econ)
                expense.upkeep += econ.upkeep;
        }
        const net = income.business + income.industry + income.income + income.land + income.investment
            - expense.construction - expense.upkeep - expense.publicWages - expense.pension - expense.promotion;
        s.finance.funds += net;
        // 财政见底：上级拨款，不会游戏结束（DESIGN 3）
        if (s.finance.funds < 0) {
            s.finance.funds += cfg.bailout;
            this.event(`财政吃紧，上级拨来 ${cfg.bailout} 元周转`);
        }
        return { income, expense };
    }
    /** 4. 居民自己的状态 */
    updateResidents(world) {
        const s = this.state;
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        // 找工作 / 失业计时 / 跳槽
        for (const r of s.residents.slice()) {
            if (r.age < rt.workMinAge || r.age >= rt.retireAge)
                continue;
            if (r.jobId === null) {
                r.monthsUnemployed++;
                const job = this.bestJobFor(r, world);
                if (job)
                    this.takeJob(r, job);
            }
            else {
                r.monthsUnemployed = 0;
                if (s.month % 12 + 1 === r.birthMonth)
                    this.maybeHopJob(r, world);
            }
        }
        // 心情
        for (const r of s.residents)
            r.mood = this.nextMood(r, world);
        // 结婚 / 生孩子
        for (const r of s.residents.slice()) {
            if (r.spouseId === null && r.age >= rt.marryMinAge && r.age <= rt.marryMaxAge && r.mood > 50) {
                if ((0, rng_1.chance)(this._rng, rt.marryChance / 12)) {
                    const other = this.findSpouse(r);
                    if (other)
                        this.marry(r, other, false);
                }
            }
            if (r.spouseId !== null && r.age >= rt.childMinAge && r.age <= rt.childMaxAge
                && r.id < (r.spouseId ?? 0) && s.month % 12 + 1 === r.birthMonth
                && (0, rng_1.chance)(this._rng, rt.childChancePerYear)) {
                this.haveChild(r);
            }
        }
        // 搬走：心情长期低落，或者长期没工作（DESIGN 2.6）
        for (const r of s.residents.slice()) {
            if (r.homeId === null)
                continue;
            const bad = r.mood < cfg.leaveMood;
            const months = bad ? (this._badMoodMonths.get(r.id) ?? 0) + 1 : 0;
            this._badMoodMonths.set(r.id, months);
            if (months >= cfg.leaveMonths) {
                this.leaveByHousehold(r, '觉得日子过不下去，搬走了');
            }
            else if (r.monthsUnemployed >= cfg.unemployedLeaveMonths) {
                this.leaveByHousehold(r, '找不到工作，搬走了');
            }
        }
    }
    /** 店铺口碑：上座率越高口碑越好（M4 店铺升级用） */
    assessBuildings(world) {
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || econ.demand === null)
                continue;
            const cap = Math.max(1, (0, consumption_1.shopCapacity)(b, econ, this._staff.get(b.uid) ?? 0));
            const fill = Math.min(1, (this._served.get(b.uid) ?? 0) / cap);
            const target = 45 + fill * 45;
            b.reputation = clamp(0, 100, b.reputation + (target - b.reputation) * 0.15);
        }
    }
    /** 5. 迁入：空岗位多、空房多、心情好，来的人就多（DESIGN 2.7） */
    runImmigration(world) {
        const s = this.state;
        const cfg = this._cfg.economy;
        const openJobs = this.countOpenJobs(world);
        const homeless = s.residents.filter((r) => r.homeId === null).length;
        const freeHomes = this.countFreeHousing() - homeless;
        if (openJobs <= 0 || freeHomes <= 0)
            return;
        const sum = this.summary();
        const attract = clamp(0.2, 2, 0.4 + sum.avgMood / 60) * (1 - (s.finance.taxRate.business - 0.05) * 2);
        const expected = Math.min(openJobs, freeHomes) * cfg.immigrationRate * attract / 12;
        let n = Math.floor(expected);
        if ((0, rng_1.chance)(this._rng, expected - n))
            n++;
        for (let i = 0; i < n; i++) {
            const couple = (0, rng_1.chance)(this._rng, 0.25);
            const age = (0, rng_1.nextInt)(this._rng, 20, 35);
            const gender = (0, rng_1.chance)(this._rng, 0.5) ? 'M' : 'F';
            const r = this.createResident(null, gender, age);
            s.residents.push(r);
            // 一个人来的先安排住处；分不到房就当没来（不制造无家可归的人）
            this.assignHomes([r]);
            if (r.homeId === null) {
                s.residents.pop();
                continue;
            }
            let partner = null;
            if (couple) {
                partner = this.createResident(null, gender === 'M' ? 'F' : 'M', clamp(18, 60, age + (0, rng_1.nextInt)(this._rng, -4, 4)));
                s.residents.push(partner);
                this.assignHomes([partner]);
                if (partner.homeId === null) {
                    s.residents.pop();
                    partner = null;
                }
                else {
                    this.marry(r, partner, true);
                }
            }
            this.event(`${r.name}${partner ? '一家' : ''} 来到县城定居`);
            this.fillVacancies(world);
        }
    }
    /** 城镇等级（DESIGN 6）。营商环境要等 M3，先只判人口和几栋关键建筑 */
    updateLevel() {
        const pop = this.state.residents.length;
        const s = this.state;
        const hasIndustry = s.buildings.some((b) => {
            const e = this._cfg.building(b.defId);
            return !!e && e.demand === null && !e.publicJob && e.jobs.length > 0;
        });
        const hasSchool = s.buildings.some((b) => b.defId === 'school');
        const hasBank = s.buildings.some((b) => b.defId === 'bank');
        const mood = this.summary().avgMood;
        const reached = (level) => {
            switch (level) {
                case 'village': return true;
                case 'town': return pop >= 20 && hasIndustry;
                case 'county': return pop >= 60 && hasSchool && mood >= 50;
                case 'city': return pop >= 150 && hasBank;
                case 'top100': return pop >= 500;
            }
        };
        const order = ['village', 'town', 'county', 'city', 'top100'];
        // 等级只升不降：人口掉回去不该把已经解锁的建筑又锁上
        let idx = order.indexOf(s.level);
        for (let i = idx + 1; i < order.length; i++)
            if (!reached(order[i]))
                break;
            else
                idx = i;
        if (order[idx] !== s.level) {
            s.level = order[idx];
            this.event(`县城升级为「${LEVEL_NAME[s.level]}」`);
        }
    }
    // ───────────────────────────── 居民 ─────────────────────────────
    createResident(fixedName, gender, age) {
        const s = this.state;
        const taken = new Set(s.residents.map((r) => r.name));
        const name = fixedName ?? (0, names_1.makeName)(this._rng, this._cfg.names, age, gender, taken);
        // 学历按年龄给一个合理的起点
        const edu = age < 6 ? 0
            : age < 18 ? ((0, rng_1.chance)(this._rng, 0.5) ? 1 : 0)
                : age < 24 ? (0, rng_1.nextInt)(this._rng, 1, 2)
                    : (0, rng_1.nextInt)(this._rng, 0, 2);
        const r = {
            id: s.nextResidentId++,
            name, gender, age,
            birthMonth: (0, rng_1.nextInt)(this._rng, 1, 12),
            homeId: null, jobId: null, jobTitle: '', salary: 0,
            savings: Math.round(this._cfg.economy.residents.startSavings * (0.3 + (0, rng_1.nextFloat)(this._rng))),
            spouseId: null, parentIds: [], childIds: [],
            mood: 60, education: edu,
            monthsUnemployed: 0, arrivedMonth: s.month, log: [],
        };
        this.log(r, '来到县城');
        return r;
    }
    /** 心情目标值 + 缓动（0～100） */
    nextMood(r, world) {
        const cfg = this._cfg.economy;
        const rt = cfg.residents;
        let target = 50;
        // 工作
        if (r.age >= rt.workMinAge && r.age < rt.retireAge) {
            if (r.jobId !== null)
                target += 12;
            else
                target -= Math.min(25, 8 + r.monthsUnemployed * 2);
        }
        // 通勤
        if (r.jobId !== null && r.homeId !== null) {
            const d = this.distance(r.homeId, r.jobId);
            if (isFinite(d) && d > cfg.commuteComfort)
                target -= Math.min(15, (d - cfg.commuteComfort) * 2.5);
        }
        // 家附近店铺齐不齐
        if (r.homeId !== null) {
            const cover = this.homeCoverage(r.homeId, world);
            target += cover.size * 3;
            if (cover.size === 0)
                target -= 8;
        }
        else {
            target -= 8;
        }
        // 住房挤不挤
        if (r.homeId !== null) {
            const b = world.buildingByUid.get(r.homeId);
            const econ = b ? this._cfg.building(b.defId) : null;
            if (b && econ && econ.housing > 0 && b.residentIds.length > econ.housing * rt.crowdRatio)
                target -= 10;
        }
        // 环境
        target += clamp(-12, 8, this.homeEnv(r.homeId));
        // 公共服务
        if (r.homeId !== null) {
            if (this.hasNearby(r.homeId, 'clinic', 8))
                target += 5;
            if (this.hasNearby(r.homeId, 'police', 10))
                target += 3;
            if (this.hasNearby(r.homeId, 'plaza', 6))
                target += 4;
        }
        // 想买的东西买不到
        target -= (this._missed.get(r.id) ?? 0) * 4;
        // 税重
        target -= (this.state.finance.taxRate.business - 0.1) * 100;
        return clamp(0, 100, r.mood + (target - r.mood) * 0.3);
    }
    homeCoverage(homeUid, world) {
        const cached = this._homeCoverage.get(homeUid);
        if (cached)
            return cached;
        const set = new Set();
        const radius = this._cfg.economy.serviceRadius;
        for (const demand of ['food', 'daily', 'fun', 'other']) {
            const shops = world.shopsByDemand.get(demand);
            if (!shops)
                continue;
            for (const b of shops) {
                const d = this.distance(homeUid, b.uid);
                if (isFinite(d) && d <= radius) {
                    set.add(demand);
                    break;
                }
            }
        }
        this._homeCoverage.set(homeUid, set);
        return set;
    }
    /** 家周围 3 格内的环境分：树 / 广场 +，工厂 / 矿场 - */
    homeEnv(uid) {
        if (uid === null)
            return 0;
        const cached = this._homeEnv.get(uid);
        if (cached !== undefined)
            return cached;
        let sum = 0;
        for (const info of this._town.allBuildings()) {
            const d = this._town.gridDistance(uid, info.uid);
            if (!isFinite(d) || d > 3 || d < 0.5)
                continue;
            const econ = this._cfg.building(info.defId);
            const env = econ ? econ.env : info.defId === 'tree' ? 1 : info.defId === 'plaza' ? 2 : 0;
            if (env === 0)
                continue;
            sum += env * (1 - (d - 1) / 4);
        }
        this._homeEnv.set(uid, sum);
        return sum;
    }
    hasNearby(homeUid, defId, radius) {
        for (const info of this._town.allBuildings()) {
            if (info.defId !== defId)
                continue;
            const d = this.distance(homeUid, info.uid);
            if (isFinite(d) && d <= radius)
                return true;
        }
        return false;
    }
    findSpouse(r) {
        const rt = this._cfg.economy.residents;
        let best = null;
        let bestMood = -1;
        for (const o of this.state.residents) {
            if (o.id === r.id || o.spouseId !== null || o.gender === r.gender)
                continue;
            if (o.age < rt.marryMinAge || o.age > rt.marryMaxAge)
                continue;
            if (Math.abs(o.age - r.age) > rt.marryMaxAgeGap)
                continue;
            if (o.mood <= 50)
                continue;
            if (o.mood > bestMood) {
                best = o;
                bestMood = o.mood;
            }
        }
        return best;
    }
    marry(a, b, silent) {
        if (a.spouseId !== null || b.spouseId !== null || a.gender === b.gender)
            return;
        a.spouseId = b.id;
        b.spouseId = a.id;
        if (!silent)
            this.event(`${a.name} 和 ${b.name} 结婚了`);
        this.log(a, `和 ${b.name} 结婚`);
        this.log(b, `和 ${a.name} 结婚`);
        // 搬进两人里条件好的那家（住房容量大的）
        const homeA = a.homeId !== null ? (this.state.buildings.find((x) => x.uid === a.homeId) ?? null) : null;
        const homeB = b.homeId !== null ? (this.state.buildings.find((x) => x.uid === b.homeId) ?? null) : null;
        const capOf = (h) => {
            const e = h ? this._cfg.building(h.defId) : null;
            return e && h ? e.housing - h.residentIds.length : -1;
        };
        const best = capOf(homeA) >= capOf(homeB) ? homeA : homeB;
        // 两边都住满了就先分开住，等下个月有人搬走 / 有空房再说（不能硬塞）
        if (best && capOf(best) > 0) {
            for (const p of [a, b]) {
                if (p.homeId === best.uid)
                    continue;
                this.detachHome(p);
                p.homeId = best.uid;
                if (best.residentIds.indexOf(p.id) < 0)
                    best.residentIds.push(p.id);
            }
        }
    }
    haveChild(parent) {
        const home = parent.homeId !== null ? this.state.buildings.find((b) => b.uid === parent.homeId) : null;
        const econ = home ? this._cfg.building(home.defId) : null;
        if (!home || !econ)
            return;
        if (home.residentIds.length >= econ.housing)
            return; // 住不下就不生
        const spouse = parent.spouseId !== null ? this.resident(parent.spouseId) : null;
        const child = this.createResident(null, (0, rng_1.chance)(this._rng, 0.5) ? 'M' : 'F', 0);
        child.parentIds = spouse ? [parent.id, spouse.id] : [parent.id];
        child.homeId = home.uid;
        child.savings = 0;
        home.residentIds.push(child.id);
        parent.childIds.push(child.id);
        if (spouse)
            spouse.childIds.push(child.id);
        this.state.residents.push(child);
        this.event(`${parent.name} 家添了一个孩子`);
        this.log(parent, `孩子 ${child.name} 出生`);
    }
    die(r) {
        const s = this.state;
        this.event(`${r.name} 去世了`);
        for (const b of s.buildings) {
            b.residentIds = b.residentIds.filter((id) => id !== r.id);
            b.workerIds = b.workerIds.filter((id) => id !== r.id);
        }
        for (const o of s.residents) {
            if (o.spouseId === r.id)
                o.spouseId = null;
            o.parentIds = o.parentIds.filter((id) => id !== r.id);
            o.childIds = o.childIds.filter((id) => id !== r.id);
        }
        s.residents = s.residents.filter((x) => x.id !== r.id);
        this._badMoodMonths.delete(r.id);
        this._missed.delete(r.id);
    }
    /** 全家搬走：本人 + 配偶 + 未成年子女（DESIGN 2.6） */
    leaveByHousehold(r, reason) {
        const s = this.state;
        const family = [r];
        if (r.spouseId !== null) {
            const sp = this.resident(r.spouseId);
            if (sp)
                family.push(sp);
        }
        for (const id of r.childIds) {
            const c = this.resident(id);
            if (c && c.age < this._cfg.economy.residents.workMinAge)
                family.push(c);
        }
        this.event(`${family.map((x) => x.name).join('、')} ${reason}`);
        for (const member of family) {
            for (const b of s.buildings) {
                b.residentIds = b.residentIds.filter((id) => id !== member.id);
                b.workerIds = b.workerIds.filter((id) => id !== member.id);
            }
            s.residents = s.residents.filter((x) => x.id !== member.id);
            this._badMoodMonths.delete(member.id);
            this._missed.delete(member.id);
        }
    }
    /** 找工作：工资 − 通勤距离 × 惩罚，挑最高的（DESIGN 2.4） */
    bestJobFor(r, world) {
        const openings = (0, labor_1.openingsFor)(r, this.state.buildings, (uid) => this.econOfUid(uid), world.residentsById);
        if (!openings.length)
            return null;
        const penalty = this._cfg.economy.residents.commutePenalty;
        let best = null;
        let bestScore = -Infinity;
        for (const o of openings) {
            const d = r.homeId === null ? 0 : this.distance(r.homeId, o.building.uid);
            const dist = isFinite(d) ? d : this._cfg.economy.serviceRadius * 2;
            const score = o.slot.salary - dist * penalty;
            if (score > bestScore) {
                best = o;
                bestScore = score;
            }
        }
        return best;
    }
    takeJob(r, o) {
        const econ = this._cfg.building(o.building.defId);
        if (!econ)
            return;
        (0, labor_1.assignJob)(r, o.building, econ, o.index);
        this.log(r, `入职 ${this.buildingName(o.building.defId)}·${o.slot.title}`);
    }
    fillVacancies(world) {
        for (const r of this.state.residents) {
            if (r.jobId !== null || r.age < this._cfg.economy.residents.workMinAge || r.age >= this._cfg.economy.residents.retireAge)
                continue;
            const job = this.bestJobFor(r, world);
            if (job)
                this.takeJob(r, job);
        }
    }
    /** 在职的人每年生日那个月看看有没有工资高出一截的地方（DESIGN 2.4） */
    maybeHopJob(r, world) {
        if (r.jobId === null)
            return;
        if (!(0, rng_1.chance)(this._rng, this._cfg.economy.residents.jobHopChance))
            return;
        const needs = this._cfg.economy.residents.jobHopRaise;
        const openings = (0, labor_1.openingsFor)(r, this.state.buildings, (uid) => this.econOfUid(uid), world.residentsById);
        let best = null;
        for (const o of openings) {
            if (o.building.uid === r.jobId)
                continue;
            if (o.slot.salary <= r.salary * needs)
                continue;
            if (!best || o.slot.salary > best.slot.salary)
                best = o;
        }
        if (!best)
            return;
        const old = world.buildingByUid.get(r.jobId) ?? null;
        this.log(r, `离开 ${old ? this.buildingName(old.defId) : '原来的工作'}`);
        (0, labor_1.clearJob)(r, old);
        this.takeJob(r, best);
    }
    // ───────────────────────────── 住房 / 岗位 ─────────────────────────────
    assignHomes(list) {
        const supply = this.housingSupply();
        for (const r of list) {
            if (r.homeId !== null)
                continue;
            // 挑还有空位、且空位最多的（先填满一栋，少占地方）
            let target = null;
            let bestSpace = 0;
            for (const { b, econ } of supply) {
                const space = econ.housing - b.residentIds.length;
                if (space <= bestSpace)
                    continue;
                bestSpace = space;
                target = b;
            }
            if (!target)
                continue;
            r.homeId = target.uid;
            if (target.residentIds.indexOf(r.id) < 0)
                target.residentIds.push(r.id);
            this.log(r, `住进了 ${this.buildingName(target.defId)}`);
        }
    }
    detachHome(r) {
        if (r.homeId === null)
            return;
        const home = this.state.buildings.find((b) => b.uid === r.homeId);
        if (home)
            home.residentIds = home.residentIds.filter((id) => id !== r.id);
        r.homeId = null;
    }
    housingSupply() {
        const out = [];
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (econ && econ.housing > 0)
                out.push({ b, econ });
        }
        return out;
    }
    countFreeHousing() {
        let free = 0;
        for (const { b, econ } of this.housingSupply())
            free += Math.max(0, econ.housing - b.residentIds.length);
        return free;
    }
    countOpenJobs(world) {
        let n = 0;
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ || !econ.jobs.length)
                continue;
            n += (0, labor_1.staffing)(b, econ, world.residentsById).open.length;
        }
        return n;
    }
    measureStaff(world) {
        this._staff.clear();
        for (const b of this.state.buildings) {
            const econ = this._cfg.building(b.defId);
            if (!econ)
                continue;
            this._staff.set(b.uid, (0, labor_1.staffing)(b, econ, world.residentsById).staff);
        }
    }
    staffRatio(b, econ) {
        const required = (0, labor_1.totalPositions)(econ);
        if (required <= 0)
            return 1;
        return Math.min(1, (this._staff.get(b.uid) ?? 0) / required);
    }
    // ───────────────────────────── 小工具 ─────────────────────────────
    refreshWorld() {
        this._town.refresh?.();
        const world = (0, world_1.buildWorld)(this.state.residents, this.state.buildings, (uid) => this.econOfUid(uid));
        // 两头对不上的引用顺手修掉（地图被外面改过、或者读档后不一致）
        for (const b of this.state.buildings) {
            b.residentIds = b.residentIds.filter((id) => world.residentsById.has(id));
            b.workerIds = b.workerIds.filter((id) => world.residentsById.has(id));
        }
        for (const r of this.state.residents) {
            if (r.homeId !== null && !world.buildingByUid.has(r.homeId))
                r.homeId = null;
            if (r.jobId !== null && !world.buildingByUid.has(r.jobId)) {
                r.jobId = null;
                r.jobTitle = '';
                r.salary = 0;
            }
        }
        return world;
    }
    econOfUid(uid) {
        const b = this.state.buildings.find((x) => x.uid === uid);
        return b ? this._cfg.building(b.defId) : null;
    }
    distance(a, b) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const cached = this._distCache.get(key);
        if (cached !== undefined)
            return cached;
        const d = this._town.roadDistance(a, b);
        this._distCache.set(key, d);
        return d;
    }
    buildingName(defId) {
        return DEF_NAMES[defId] ?? defId;
    }
    log(r, text) {
        r.log.push({ month: this.state.month, text });
        const limit = this._cfg.economy.logLimit;
        if (r.log.length > limit)
            r.log.splice(0, r.log.length - limit);
    }
    event(text) {
        this._events.push({ month: this.state.month, text });
    }
    syncRng() {
        this.state.rngState = this._rng.state;
    }
}
exports.Simulation = Simulation;
function clamp(min, max, v) {
    return v < min ? min : v > max ? max : v;
}
/** 日志里用的建筑名。模拟层不读 buildings.json，这里留一份小表 */
const DEF_NAMES = {
    house: '自建房', apartment: '商品房小区', 'school-house': '学区房',
    breakfast: '早餐铺', 'milk-tea': '奶茶店', bbq: '烧烤摊', hotpot: '火锅店',
    parcel: '快递驿站', supermarket: '超市', 'net-cafe': '网吧', 'phone-shop': '手机店',
    barber: '理发店', tutoring: '补习班',
    workshop: '小作坊', textile: '纺织厂', 'food-factory': '食品厂', electronics: '电子厂',
    center: '发展中心', school: '学校', clinic: '卫生院', police: '派出所', bank: '银行',
    bridge: '桥', port: '港口', mine: '矿场', plaza: '广场', tree: '行道树',
};
const LEVEL_NAME = {
    village: '村口', town: '镇上', county: '县城', city: '县级市', top100: '百强县',
};
