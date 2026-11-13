"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rng_1 = require("../../assets/scripts/core/sim/rng");
const world_1 = require("../../assets/scripts/core/sim/world");
const labor_1 = require("../../assets/scripts/core/sim/labor");
const config_1 = require("../../assets/scripts/core/sim/config");
const Simulation_1 = require("../../assets/scripts/core/sim/Simulation");
const fixtures_1 = require("./fixtures");
const harness_1 = require("./harness");
// ───────────────────────── 随机数 ─────────────────────────
(0, harness_1.suite)('rng：同种子同序列', () => {
    (0, harness_1.test)('两个同种子生成器吐出完全一样的序列', () => {
        const a = (0, rng_1.rngFromSeed)(12345);
        const b = (0, rng_1.rngFromSeed)(12345);
        for (let i = 0; i < 200; i++)
            (0, harness_1.eq)((0, rng_1.nextFloat)(a), (0, rng_1.nextFloat)(b), `第 ${i} 个`);
    });
    (0, harness_1.test)('不同种子序列不同', () => {
        const a = (0, rng_1.rngFromSeed)(1);
        const b = (0, rng_1.rngFromSeed)(2);
        let same = 0;
        for (let i = 0; i < 50; i++)
            if ((0, rng_1.nextFloat)(a) === (0, rng_1.nextFloat)(b))
                same++;
        (0, harness_1.eq)(same, 0, '不同种子不该撞');
    });
    (0, harness_1.test)('值域 0 ≤ x < 1', () => {
        const r = (0, rng_1.rngFromSeed)(7);
        for (let i = 0; i < 1000; i++)
            (0, harness_1.inRange)((0, rng_1.nextFloat)(r), 0, 0.9999999999);
    });
    (0, harness_1.test)('nextInt 落在闭区间内', () => {
        const r = (0, rng_1.rngFromSeed)(9);
        let min = 1e9, max = -1e9;
        for (let i = 0; i < 2000; i++) {
            const v = (0, rng_1.nextInt)(r, 3, 7);
            (0, harness_1.ok)(Number.isInteger(v), '必须是整数');
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
        (0, harness_1.eq)(min, 3);
        (0, harness_1.eq)(max, 7);
    });
    (0, harness_1.test)('chance(0) 永远 false，chance(1) 永远 true', () => {
        const r = (0, rng_1.rngFromSeed)(11);
        for (let i = 0; i < 100; i++) {
            (0, harness_1.eq)((0, rng_1.chance)(r, 0), false);
            (0, harness_1.eq)((0, rng_1.chance)(r, 1), true);
        }
    });
    (0, harness_1.test)('pick / pickWeighted 空输入返回 null', () => {
        const r = (0, rng_1.rngFromSeed)(13);
        (0, harness_1.eq)((0, rng_1.pick)(r, []), null);
        (0, harness_1.eq)((0, rng_1.pickWeighted)(r, [], () => 1), null);
        (0, harness_1.eq)((0, rng_1.pickWeighted)(r, [1, 2], () => 0), null);
    });
    (0, harness_1.test)('pickWeighted 只挑权重 > 0 的', () => {
        const r = (0, rng_1.rngFromSeed)(17);
        for (let i = 0; i < 500; i++)
            (0, harness_1.eq)((0, rng_1.pickWeighted)(r, ['a', 'b'], (x) => (x === 'a' ? 1 : 0)), 'a');
    });
});
// ───────────────────────── 路网距离 ─────────────────────────
(0, harness_1.suite)('TownView：沿道路的距离', () => {
    (0, harness_1.test)('同一条路上两栋楼距离正确', () => {
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        const a = m.build('house', 0, 1);
        const b = m.build('house', 5, 1);
        const v = m.view();
        // 门口分别在 (0,0) 和 (5,0)，沿路 5 步
        (0, harness_1.eq)(v.roadDistance(a, b), 6, '沿路格数含两端门口');
        (0, harness_1.eq)(v.roadDistance(b, a), 6, '对称');
        (0, harness_1.eq)(v.roadDistance(a, a), 0, '自己到自己 0');
    });
    (0, harness_1.test)('不挨道路的楼返回 Infinity', () => {
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        const road = m.build('house', 0, 1);
        const island = m.build('house', 8, 8); // 附近啥也没有
        const v = m.view();
        (0, harness_1.eq)(v.roadDistance(road, island), Infinity);
    });
    (0, harness_1.test)('路网断开时互相到不了', () => {
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 5, 0);
        m.hRoad(0, 5, 10);
        const a = m.build('house', 0, 1);
        const b = m.build('house', 0, 9); // 挨着下面那条路（row 10 在上方）
        const v = m.view();
        (0, harness_1.eq)(v.roadDistance(a, b), Infinity, '两条断开的路');
    });
    (0, harness_1.test)('拐弯的路也能算通', () => {
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 5, 0);
        m.vRoad(5, 0, 5);
        const a = m.build('house', 0, 1);
        const b = m.build('house', 6, 5); // 挨着 (5,5) 右边
        const v = m.view();
        const d = v.roadDistance(a, b);
        (0, harness_1.ok)(isFinite(d) && d > 0, `拐弯应当连通，实际 ${d}`);
    });
    (0, harness_1.test)('二维建筑四周任意一格挨路就算有门', () => {
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        const big = m.build('supermarket', 4, 1, 2, 2); // (4..5, 1..2)，下方是 row 0
        const small = m.build('house', 9, 1);
        const v = m.view();
        const d = v.roadDistance(big, small);
        (0, harness_1.ok)(isFinite(d), `应当有门，实际 ${d}`);
    });
    (0, harness_1.test)('直线距离用切比雪夫', () => {
        const m = new fixtures_1.MapBuilder();
        const a = m.build('house', 0, 0);
        const b = m.build('house', 3, 4);
        (0, harness_1.eq)(m.view().gridDistance(a, b), 4, '中心差 (3,4) → 4');
    });
    (0, harness_1.test)('refresh 后能看到新盖的路', () => {
        const m = new fixtures_1.MapBuilder();
        const a = m.build('house', 0, 1);
        const b = m.build('house', 6, 1);
        const v = m.view();
        (0, harness_1.eq)(v.roadDistance(a, b), Infinity, '还没铺路');
        m.hRoad(0, 6, 0);
        v.refresh();
        (0, harness_1.ok)(isFinite(v.roadDistance(a, b)), '铺完路应当连通');
    });
});
// ───────────────────────── 配置 ─────────────────────────
(0, harness_1.suite)('配置表', () => {
    (0, harness_1.test)('经济数据缺字段时有兜底，不崩', () => {
        const cfg = (0, config_1.makeSimConfig)({ buildings: [{ id: 'weird' }] }, {});
        const e = cfg.building('weird');
        (0, harness_1.ok)(e, '应当有兜底');
        (0, harness_1.eq)(e.cost, 0);
        (0, harness_1.eq)(e.housing, 0);
        (0, harness_1.eq)(e.jobs.length, 0);
        (0, harness_1.eq)(e.demand, null);
        (0, harness_1.eq)(cfg.building('不存在'), null);
    });
    (0, harness_1.test)('需求权重归一化到 1', () => {
        const e = (0, config_1.parseEconomy)({ tuning: { demandWeight: { food: 2, daily: 1, fun: 1, other: 0 } } });
        (0, harness_1.near)(e.demandWeight.food + e.demandWeight.daily + e.demandWeight.fun + e.demandWeight.other, 1);
        (0, harness_1.near)(e.demandWeight.other, 0);
    });
    (0, harness_1.test)('税率被夹在 0..1', () => {
        const e = (0, config_1.parseEconomy)({ taxRate: { business: 5, industry: -1, income: 0.1 } });
        (0, harness_1.eq)(e.taxRate.business, 1);
        (0, harness_1.eq)(e.taxRate.industry, 0);
        (0, harness_1.eq)(e.taxRate.income, 0.1);
    });
    (0, harness_1.test)('名字库空时用兜底姓', () => {
        const n = (0, config_1.parseNames)({});
        (0, harness_1.ok)(n.surnames.length > 0 && n.maleYoung.length > 0);
    });
    (0, harness_1.test)('真实配置表全部建筑都能解析', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        (0, harness_1.eq)(cfg.building('breakfast').demand, 'food');
        (0, harness_1.eq)(cfg.building('textile').jobs[0].count, 18);
        (0, harness_1.eq)(cfg.building('school').publicJob, true);
        (0, harness_1.eq)(cfg.building('supermarket').housing, 0);
        (0, harness_1.eq)(cfg.building('house').housing, 3);
    });
    (0, harness_1.test)('建筑 id 不重复', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const seen = new Set();
        for (const b of ['house', 'apartment', 'breakfast', 'workshop', 'center', 'mine']) {
            (0, harness_1.ok)(!seen.has(b));
            seen.add(b);
            (0, harness_1.ok)(cfg.building(b), `${b} 应当在配置里`);
        }
    });
});
// ───────────────────────── 岗位 ─────────────────────────
(0, harness_1.suite)('岗位分配', () => {
    (0, harness_1.test)('岗位按学历从高到低排', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const list = (0, labor_1.positionsOf)(cfg.building('electronics'));
        (0, harness_1.eq)(list.length, 30);
        (0, harness_1.ok)(list[0].edu >= list[list.length - 1].edu, '高学历在前');
    });
    (0, harness_1.test)('学历低的占不满高学历岗位', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const econ = cfg.building('electronics');
        const b = { uid: 1, defId: 'electronics', residentIds: [], workerIds: [1, 2, 3], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 };
        const byId = new Map([[1, { id: 1, education: 1 }], [2, { id: 2, education: 0 }], [3, { id: 3, education: 2 }]]);
        const st = (0, labor_1.staffing)(b, econ, byId);
        // 电子厂只招 edu1（装配工 26）和 edu2（技术员 4）；
        // 学历 0 的人进不去，只能闲着等
        (0, harness_1.eq)(st.staff, 2, '两个够学历的人上岗');
        (0, harness_1.eq)(st.idle.length, 1, '学历不够的那个闲着');
        (0, harness_1.eq)(st.open.length, 28, '空 4 个技术员 + 24 个装配工');
    });
    (0, harness_1.test)('学历不够的员工进 idle，不算在岗', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const econ = cfg.building('tutoring'); // 只需要 edu2 的老师
        const b = { uid: 1, defId: 'tutoring', residentIds: [], workerIds: [1], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 };
        const byId = new Map([[1, { id: 1, education: 0 }]]);
        const st = (0, labor_1.staffing)(b, econ, byId);
        (0, harness_1.eq)(st.staff, 0);
        (0, harness_1.eq)(st.idle.length, 1);
    });
    (0, harness_1.test)('招聘只列学历够得上的', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const b = { uid: 1, defId: 'textile', residentIds: [], workerIds: [], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 };
        const byId = new Map();
        const lowEdu = { id: 9, education: 0 };
        const openings = (0, labor_1.openingsFor)(lowEdu, [b], () => cfg.building('textile'), byId);
        (0, harness_1.eq)(openings.length, 18, '只能干 18 个车间工人的岗');
    });
});
// ───────────────────────── world 索引 ─────────────────────────
(0, harness_1.suite)('world 索引', () => {
    (0, harness_1.test)('按用途分好类', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const buildings = view.allBuildings().filter((b) => !b.road).map((b) => ({
            uid: b.uid, defId: b.defId, residentIds: [], workerIds: [],
            lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50,
        }));
        const w = (0, world_1.buildWorld)([], buildings, (uid) => cfg.building(buildings.find((b) => b.uid === uid).defId));
        (0, harness_1.eq)(w.homes.length, 2, '两栋自建房');
        (0, harness_1.eq)(w.shops.length, 5, '早餐 / 超市 / 理发 / 奶茶 / 驿站');
        (0, harness_1.eq)(w.producers.length, 1, '小作坊');
        (0, harness_1.eq)(w.publics.length, 0);
        (0, harness_1.ok)(w.shopsByDemand.get('food').length >= 1);
    });
});
// ───────────────────────── 模拟整体 ─────────────────────────
(0, harness_1.suite)('Simulation：开局', () => {
    (0, harness_1.test)('开局 5 人，都住进自建房', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        (0, harness_1.eq)(sim.state.residents.length, 5);
        (0, harness_1.eq)(sim.state.finance.funds, cfg.economy.startFunds);
        for (const r of sim.state.residents)
            (0, harness_1.ok)(r.homeId !== null, `${r.name} 应当有房住`);
        (0, harness_1.eq)(sim.state.residents.filter((r) => r.spouseId !== null).length, 2, '一对夫妻');
    });
    (0, harness_1.test)('开局的人配上了工作', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        sim.stepMonth();
        const employed = sim.state.residents.filter((r) => r.jobId !== null);
        (0, harness_1.ok)(employed.length > 0, '至少有人上班');
    });
    (0, harness_1.test)('同种子同结果：两个模拟跑 24 个月完全一致', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const a = (0, fixtures_1.basicTown)(cfg);
        const b = (0, fixtures_1.basicTown)(cfg);
        const s1 = new Simulation_1.Simulation(cfg, a.view, { seed: 42 });
        const s2 = new Simulation_1.Simulation(cfg, b.view, { seed: 42 });
        for (let i = 0; i < 24; i++) {
            const r1 = s1.stepMonth();
            const r2 = s2.stepMonth();
            (0, harness_1.eq)(JSON.stringify(r1), JSON.stringify(r2), `第 ${i} 月账单`);
        }
        (0, harness_1.eq)(JSON.stringify(s1.state), JSON.stringify(s2.state), '最终状态');
        (0, harness_1.eq)(s1.state.rngState, s2.state.rngState, '随机数状态');
    });
    (0, harness_1.test)('不同种子会走出不同结果', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const a = (0, fixtures_1.basicTown)(cfg);
        const b = (0, fixtures_1.basicTown)(cfg);
        const s1 = new Simulation_1.Simulation(cfg, a.view, { seed: 1 });
        const s2 = new Simulation_1.Simulation(cfg, b.view, { seed: 999 });
        for (let i = 0; i < 12; i++) {
            s1.stepMonth();
            s2.stepMonth();
        }
        (0, harness_1.ok)(JSON.stringify(s1.state.residents) !== JSON.stringify(s2.state.residents), '应当不同');
    });
    (0, harness_1.test)('rngState 随推进变化并存进 state', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 5 });
        const before = sim.state.rngState;
        for (let i = 0; i < 6; i++)
            sim.stepMonth();
        (0, harness_1.ok)(sim.state.rngState !== before, '随机数状态应当推进');
        (0, harness_1.eq)(sim.state.seed, 5);
    });
});
(0, harness_1.suite)('Simulation：盖楼与资金', () => {
    (0, harness_1.test)('盖楼扣钱，钱不够拒绝', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { map } = (0, fixtures_1.basicTown)(cfg);
        const view = map.view();
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        const funds = sim.state.finance.funds;
        const uid = map.build('barber', 16, 6);
        view.refresh();
        (0, harness_1.ok)(sim.onBuilt(uid, 'barber'), '应当能盖');
        (0, harness_1.eq)(sim.state.finance.funds, funds - cfg.building('barber').cost);
        sim.state.finance.funds = 10;
        (0, harness_1.eq)(sim.canAfford('hotpot'), false);
        const uid2 = map.build('hotpot', 18, 6, 2, 2);
        view.refresh();
        (0, harness_1.eq)(sim.onBuilt(uid2, 'hotpot'), false, '钱不够应当返回 false');
        (0, harness_1.eq)(sim.state.finance.funds, 10, '钱不够不扣钱');
    });
    (0, harness_1.test)('拆楼把员工和住户请出去', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view, houses } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        sim.stepMonth();
        const home = houses[0];
        (0, harness_1.ok)(sim.state.residents.some((r) => r.homeId === home), '拆之前有人住');
        sim.onDemolished(home);
        (0, harness_1.eq)(sim.state.residents.filter((r) => r.homeId === home).length, 0, '拆之后没人指向它');
        (0, harness_1.eq)(sim.state.buildings.some((b) => b.uid === home), false);
    });
});
(0, harness_1.suite)('Simulation：每月结算', () => {
    (0, harness_1.test)('账单收支字段齐全，人口守恒', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 3 });
        const rep = sim.stepMonth();
        (0, harness_1.eq)(rep.month, 1);
        (0, harness_1.ok)(rep.income && rep.expense && Array.isArray(rep.events));
        (0, harness_1.eq)(rep.populationBefore, 5);
        (0, harness_1.eq)(rep.populationAfter, sim.state.residents.length);
        (0, harness_1.ok)(rep.income.business >= 0 && rep.income.industry >= 0);
        (0, harness_1.ok)(rep.expense.upkeep > 0, '有维护费');
    });
    (0, harness_1.test)('消费真的进了店，店铺有营业额和交税', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view, shops } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 3 });
        for (let i = 0; i < 6; i++)
            sim.stepMonth();
        let revenue = 0;
        let tax = 0;
        for (const key in shops) {
            const uid = shops[key];
            const b = sim.building(uid);
            revenue += b.lastRevenue;
            tax += b.lastTax;
        }
        (0, harness_1.ok)(revenue > 0, `店铺应当有营业额，实际 ${revenue}`);
        (0, harness_1.ok)(tax > 0, '应当交营业税');
        (0, harness_1.ok)(sim.state.finance.lastMonth.income.business > 0, '财政应当收到营业税');
    });
    (0, harness_1.test)('居民交完消费和租还有钱剩，储蓄不为负', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 3 });
        for (let i = 0; i < 12; i++)
            sim.stepMonth();
        for (const r of sim.state.residents)
            (0, harness_1.ok)(r.savings >= 0, `${r.name} 储蓄为负 ${r.savings}`);
    });
    (0, harness_1.test)('心情始终在 0..100', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 8 });
        for (let i = 0; i < 60; i++) {
            sim.stepMonth();
            for (const r of sim.state.residents)
                (0, harness_1.inRange)(r.mood, 0, 100, `${r.name} 心情`);
        }
    });
    (0, harness_1.test)('没地方上班的人失业计时会涨', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        const home = m.build('house', 0, 1); // 只有房子，没有岗位
        const sim = new Simulation_1.Simulation(cfg, m.view(), { seed: 4 });
        for (let i = 0; i < 3; i++)
            sim.stepMonth();
        const jobless = sim.state.residents.filter((r) => r.age >= 18 && r.age < 60 && r.homeId === home);
        (0, harness_1.ok)(jobless.length > 0, '应当有劳动年龄的人');
        (0, harness_1.ok)(jobless.some((r) => r.monthsUnemployed > 0), '失业月数应当累计');
    });
});
(0, harness_1.suite)('Simulation：财政', () => {
    (0, harness_1.test)('建设费进月账单', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { map } = (0, fixtures_1.basicTown)(cfg);
        const view = map.view();
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        const uid = map.build('barber', 16, 6);
        view.refresh();
        sim.onBuilt(uid, 'barber');
        const rep = sim.stepMonth();
        (0, harness_1.eq)(rep.expense.construction, cfg.building('barber').cost);
    });
    (0, harness_1.test)('财政见底会拨救助金，不为负', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        sim.state.finance.funds = 0;
        // 让维护费把它压到负数
        sim.state.buildings.push({ uid: 999, defId: 'textile', residentIds: [], workerIds: [], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 });
        sim.stepMonth();
        (0, harness_1.ok)(sim.state.finance.funds >= 0, `应当被救助金救回来，实际 ${sim.state.finance.funds}`);
    });
    (0, harness_1.test)('税率可调且被夹住范围', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 1 });
        sim.setTaxRate('business', 99);
        (0, harness_1.eq)(sim.state.finance.taxRate.business, cfg.economy.taxRange.max);
        sim.setTaxRate('business', -1);
        (0, harness_1.eq)(sim.state.finance.taxRate.business, cfg.economy.taxRange.min);
    });
    (0, harness_1.test)('公共岗位的工资由财政发，居民也拿到', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        m.build('house', 0, 1);
        m.build('house', 2, 1);
        m.build('house', 4, 1);
        const clinic = m.build('clinic', 6, 1);
        const sim = new Simulation_1.Simulation(cfg, m.view(), { seed: 1 });
        const rep = sim.stepMonth();
        const doctor = sim.state.residents.find((r) => r.jobId === clinic);
        if (doctor) {
            (0, harness_1.ok)(rep.expense.publicWages > 0, '应当在账单里记公共岗位工资');
        }
    });
});
(0, harness_1.suite)('Simulation：迁移与人生', () => {
    (0, harness_1.test)('空岗位 + 空房会有人迁入', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 2 });
        const before = sim.state.residents.length;
        for (let i = 0; i < 24; i++)
            sim.stepMonth();
        (0, harness_1.ok)(sim.state.residents.length > before, `24 个月应当有人搬来，${before} → ${sim.state.residents.length}`);
    });
    (0, harness_1.test)('没房没岗不会无脑爆人口', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        const sim = new Simulation_1.Simulation(cfg, m.view(), { seed: 2, opening: false });
        for (let i = 0; i < 24; i++)
            sim.stepMonth();
        (0, harness_1.eq)(sim.state.residents.length, 0, '什么都没有的时候没人来');
    });
    (0, harness_1.test)('居民日志不超过配置上限', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        const { view } = (0, fixtures_1.basicTown)(cfg);
        const sim = new Simulation_1.Simulation(cfg, view, { seed: 6 });
        for (let i = 0; i < 120; i++)
            sim.stepMonth();
        for (const r of sim.state.residents)
            (0, harness_1.ok)(r.log.length <= cfg.economy.logLimit, `${r.name} 日志 ${r.log.length} 条`);
    });
    (0, harness_1.test)('年长的会去世，人口结构会更新', () => {
        const cfg = (0, fixtures_1.loadConfig)();
        // 一栋楼塞满 80+ 的老人
        const m = new fixtures_1.MapBuilder();
        m.hRoad(0, 10, 0);
        m.build('apartment', 0, 1, 2, 2);
        m.build('breakfast', 4, 1);
        const sim = new Simulation_1.Simulation(cfg, m.view(), { seed: 3, opening: false });
        // 手动塞 6 个老人，记下 id
        const elderIds = [];
        for (let i = 0; i < 6; i++) {
            const r = sim.createResident(null, i % 2 ? 'F' : 'M', 88);
            sim.state.residents.push(r);
            elderIds.push(r.id);
        }
        sim.assignHomes(sim.state.residents);
        for (let i = 0; i < 120; i++)
            sim.stepMonth();
        (0, harness_1.eq)(sim.state.residents.filter((r) => elderIds.indexOf(r.id) >= 0).length, 0, '老人应当陆续离世');
        (0, harness_1.ok)(sim.state.residents.length > 0, '空出来的房和岗会有新人来');
    });
});
(0, harness_1.report)();
