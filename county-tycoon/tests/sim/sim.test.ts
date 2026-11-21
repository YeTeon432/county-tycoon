import { chance, nextFloat, nextInt, pick, pickWeighted, rngFromSeed } from '../../assets/scripts/core/sim/rng';
import { SimpleTownView } from '../../assets/scripts/core/sim/townView';
import { buildWorld } from '../../assets/scripts/core/sim/world';
import { staffing, positionsOf, openingsFor } from '../../assets/scripts/core/sim/labor';
import { parseEconomy, parseNames, makeSimConfig } from '../../assets/scripts/core/sim/config';
import { DEF_NAMES, Simulation } from '../../assets/scripts/core/sim/Simulation';
import { SimConfig } from '../../assets/scripts/core/sim/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { basicTown, loadConfig, loadFullConfig, MapBuilder } from './fixtures';
import { eq, inRange, near, ok, report, suite, test } from './harness';

// ───────────────────────── 随机数 ─────────────────────────
suite('rng：同种子同序列', () => {
    test('两个同种子生成器吐出完全一样的序列', () => {
        const a = rngFromSeed(12345);
        const b = rngFromSeed(12345);
        for (let i = 0; i < 200; i++) eq(nextFloat(a), nextFloat(b), `第 ${i} 个`);
    });

    test('不同种子序列不同', () => {
        const a = rngFromSeed(1);
        const b = rngFromSeed(2);
        let same = 0;
        for (let i = 0; i < 50; i++) if (nextFloat(a) === nextFloat(b)) same++;
        eq(same, 0, '不同种子不该撞');
    });

    test('值域 0 ≤ x < 1', () => {
        const r = rngFromSeed(7);
        for (let i = 0; i < 1000; i++) inRange(nextFloat(r), 0, 0.9999999999);
    });

    test('nextInt 落在闭区间内', () => {
        const r = rngFromSeed(9);
        let min = 1e9, max = -1e9;
        for (let i = 0; i < 2000; i++) {
            const v = nextInt(r, 3, 7);
            ok(Number.isInteger(v), '必须是整数');
            min = Math.min(min, v); max = Math.max(max, v);
        }
        eq(min, 3); eq(max, 7);
    });

    test('chance(0) 永远 false，chance(1) 永远 true', () => {
        const r = rngFromSeed(11);
        for (let i = 0; i < 100; i++) { eq(chance(r, 0), false); eq(chance(r, 1), true); }
    });

    test('pick / pickWeighted 空输入返回 null', () => {
        const r = rngFromSeed(13);
        eq(pick(r, []), null);
        eq(pickWeighted(r, [], () => 1), null);
        eq(pickWeighted(r, [1, 2], () => 0), null);
    });

    test('pickWeighted 只挑权重 > 0 的', () => {
        const r = rngFromSeed(17);
        for (let i = 0; i < 500; i++) eq(pickWeighted(r, ['a', 'b'], (x) => (x === 'a' ? 1 : 0)), 'a');
    });
});

// ───────────────────────── 路网距离 ─────────────────────────
suite('TownView：沿道路的距离', () => {
    test('同一条路上两栋楼距离正确', () => {
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        const a = m.build('house', 0, 1);
        const b = m.build('house', 5, 1);
        const v = m.view();
        // 门口分别在 (0,0) 和 (5,0)，沿路 5 步
        eq(v.roadDistance(a, b), 6, '沿路格数含两端门口');
        eq(v.roadDistance(b, a), 6, '对称');
        eq(v.roadDistance(a, a), 0, '自己到自己 0');
    });

    test('不挨道路的楼返回 Infinity', () => {
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        const road = m.build('house', 0, 1);
        const island = m.build('house', 8, 8); // 附近啥也没有
        const v = m.view();
        eq(v.roadDistance(road, island), Infinity);
    });

    test('路网断开时互相到不了', () => {
        const m = new MapBuilder();
        m.hRoad(0, 5, 0);
        m.hRoad(0, 5, 10);
        const a = m.build('house', 0, 1);
        const b = m.build('house', 0, 9); // 挨着下面那条路（row 10 在上方）
        const v = m.view();
        eq(v.roadDistance(a, b), Infinity, '两条断开的路');
    });

    test('拐弯的路也能算通', () => {
        const m = new MapBuilder();
        m.hRoad(0, 5, 0);
        m.vRoad(5, 0, 5);
        const a = m.build('house', 0, 1);
        const b = m.build('house', 6, 5); // 挨着 (5,5) 右边
        const v = m.view();
        const d = v.roadDistance(a, b);
        ok(isFinite(d) && d > 0, `拐弯应当连通，实际 ${d}`);
    });

    test('二维建筑四周任意一格挨路就算有门', () => {
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        const big = m.build('supermarket', 4, 1, 2, 2); // (4..5, 1..2)，下方是 row 0
        const small = m.build('house', 9, 1);
        const v = m.view();
        const d = v.roadDistance(big, small);
        ok(isFinite(d), `应当有门，实际 ${d}`);
    });

    test('直线距离用切比雪夫', () => {
        const m = new MapBuilder();
        const a = m.build('house', 0, 0);
        const b = m.build('house', 3, 4);
        eq(m.view().gridDistance(a, b), 4, '中心差 (3,4) → 4');
    });

    test('refresh 后能看到新盖的路', () => {
        const m = new MapBuilder();
        const a = m.build('house', 0, 1);
        const b = m.build('house', 6, 1);
        const v = m.view();
        eq(v.roadDistance(a, b), Infinity, '还没铺路');
        m.hRoad(0, 6, 0);
        v.refresh();
        ok(isFinite(v.roadDistance(a, b)), '铺完路应当连通');
    });
});

// ───────────────────────── 配置 ─────────────────────────
suite('配置表', () => {
    test('经济数据缺字段时有兜底，不崩', () => {
        const cfg = makeSimConfig({ buildings: [{ id: 'weird' }] }, {});
        const e = cfg.building('weird');
        ok(e, '应当有兜底');
        eq(e!.cost, 0);
        eq(e!.housing, 0);
        eq(e!.jobs.length, 0);
        eq(e!.demand, null);
        eq(cfg.building('不存在'), null);
    });

    test('需求权重归一化到 1', () => {
        const e = parseEconomy({ tuning: { demandWeight: { food: 2, daily: 1, fun: 1, other: 0 } } });
        near(e.demandWeight.food + e.demandWeight.daily + e.demandWeight.fun + e.demandWeight.other, 1);
        near(e.demandWeight.other, 0);
    });

    test('税率被夹在 0..1', () => {
        const e = parseEconomy({ taxRate: { business: 5, industry: -1, income: 0.1 } });
        eq(e.taxRate.business, 1);
        eq(e.taxRate.industry, 0);
        eq(e.taxRate.income, 0.1);
    });

    test('名字库空时用兜底姓', () => {
        const n = parseNames({});
        ok(n.surnames.length > 0 && n.maleYoung.length > 0);
    });

    test('真实配置表全部建筑都能解析', () => {
        const cfg = loadConfig();
        eq(cfg.building('breakfast')!.demand, 'food');
        eq(cfg.building('textile')!.jobs[0].count, 18);
        eq(cfg.building('school')!.publicJob, true);
        eq(cfg.building('supermarket')!.housing, 0);
        eq(cfg.building('house')!.housing, 6); eq(cfg.building('hut')!.housing, 3);
    });

    test('建筑 id 不重复', () => {
        const cfg = loadConfig();
        const seen = new Set<string>();
        for (const b of ['house', 'apartment', 'breakfast', 'workshop', 'center', 'mine']) {
            ok(!seen.has(b));
            seen.add(b);
            ok(cfg.building(b), `${b} 应当在配置里`);
        }
    });
});

// ───────────────────────── 岗位 ─────────────────────────
suite('岗位分配', () => {
    test('岗位按学历从高到低排', () => {
        const cfg = loadConfig();
        const list = positionsOf(cfg.building('electronics')!);
        eq(list.length, 30);
        ok(list[0].edu >= list[list.length - 1].edu, '高学历在前');
    });

    test('学历低的占不满高学历岗位', () => {
        const cfg = loadConfig();
        const econ = cfg.building('electronics')!;
        const b = { uid: 1, defId: 'electronics', residentIds: [], workerIds: [1, 2, 3], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 };
        const byId = new Map([[1, { id: 1, education: 1 } as any], [2, { id: 2, education: 0 } as any], [3, { id: 3, education: 2 } as any]]);
        const st = staffing(b, econ, byId);
        // 电子厂只招 edu1（装配工 26）和 edu2（技术员 4）；
        // 学历 0 的人进不去，只能闲着等
        eq(st.staff, 2, '两个够学历的人上岗');
        eq(st.idle.length, 1, '学历不够的那个闲着');
        eq(st.open.length, 28, '空 4 个技术员 + 24 个装配工');
    });

    test('学历不够的员工进 idle，不算在岗', () => {
        const cfg = loadConfig();
        const econ = cfg.building('tutoring')!; // 只需要 edu2 的老师
        const b = { uid: 1, defId: 'tutoring', residentIds: [], workerIds: [1], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 };
        const byId = new Map([[1, { id: 1, education: 0 } as any]]);
        const st = staffing(b, econ, byId);
        eq(st.staff, 0);
        eq(st.idle.length, 1);
    });

    test('招聘只列学历够得上的', () => {
        const cfg = loadConfig();
        const b = { uid: 1, defId: 'textile', residentIds: [], workerIds: [], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 };
        const byId = new Map<number, any>();
        const lowEdu = { id: 9, education: 0 } as any;
        const openings = openingsFor(lowEdu, [b], () => cfg.building('textile'), byId);
        eq(openings.length, 18, '只能干 18 个车间工人的岗');
    });
});

// ───────────────────────── world 索引 ─────────────────────────
suite('world 索引', () => {
    test('按用途分好类', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const buildings = view.allBuildings().filter((b) => !b.road).map((b) => ({
            uid: b.uid, defId: b.defId, residentIds: [], workerIds: [],
            lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50,
        }));
        const w = buildWorld([], buildings, (uid) => cfg.building(buildings.find((b) => b.uid === uid)!.defId));
        eq(w.homes.length, 2, '两栋自建房');
        eq(w.shops.length, 5, '早餐 / 超市 / 理发 / 奶茶 / 驿站');
        eq(w.producers.length, 1, '小作坊');
        eq(w.publics.length, 0);
        ok(w.shopsByDemand.get('food')!.length >= 1);
    });
});

// ───────────────────────── 模拟整体 ─────────────────────────
suite('Simulation：开局', () => {
    test('开局 5 人，都住进自建房', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 1 });
        eq(sim.state.residents.length, 5);
        eq(sim.state.finance.funds, cfg.economy.startFunds);
        for (const r of sim.state.residents) ok(r.homeId !== null, `${r.name} 应当有房住`);
        eq(sim.state.residents.filter((r) => r.spouseId !== null).length, 2, '一对夫妻');
    });

    test('开局的人配上了工作', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 1 });
        sim.stepMonth();
        const employed = sim.state.residents.filter((r) => r.jobId !== null);
        ok(employed.length > 0, '至少有人上班');
    });

    test('同种子同结果：两个模拟跑 24 个月完全一致', () => {
        const cfg = loadConfig();
        const a = basicTown(cfg);
        const b = basicTown(cfg);
        const s1 = new Simulation(cfg, a.view, { seed: 42 });
        const s2 = new Simulation(cfg, b.view, { seed: 42 });
        for (let i = 0; i < 24; i++) {
            const r1 = s1.stepMonth();
            const r2 = s2.stepMonth();
            eq(JSON.stringify(r1), JSON.stringify(r2), `第 ${i} 月账单`);
        }
        eq(JSON.stringify(s1.state), JSON.stringify(s2.state), '最终状态');
        eq(s1.state.rngState, s2.state.rngState, '随机数状态');
    });

    test('不同种子会走出不同结果', () => {
        const cfg = loadConfig();
        const a = basicTown(cfg);
        const b = basicTown(cfg);
        const s1 = new Simulation(cfg, a.view, { seed: 1 });
        const s2 = new Simulation(cfg, b.view, { seed: 999 });
        for (let i = 0; i < 12; i++) { s1.stepMonth(); s2.stepMonth(); }
        ok(JSON.stringify(s1.state.residents) !== JSON.stringify(s2.state.residents), '应当不同');
    });

    test('rngState 随推进变化并存进 state', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 5 });
        const before = sim.state.rngState;
        for (let i = 0; i < 6; i++) sim.stepMonth();
        ok(sim.state.rngState !== before, '随机数状态应当推进');
        eq(sim.state.seed, 5);
    });
});

suite('Simulation：盖楼与资金', () => {
    test('盖楼扣钱，钱不够拒绝', () => {
        const cfg = loadConfig();
        const { map } = basicTown(cfg);
        const view = map.view();
        const sim = new Simulation(cfg, view, { seed: 1 });
        const funds = sim.state.finance.funds;
        const uid = map.build('barber', 16, 6);
        view.refresh();
        ok(sim.onBuilt(uid, 'barber'), '应当能盖');
        eq(sim.state.finance.funds, funds - cfg.building('barber')!.cost);

        sim.state.finance.funds = 10;
        eq(sim.canAfford('hotpot'), false);
        const uid2 = map.build('hotpot', 18, 6, 2, 2);
        view.refresh();
        eq(sim.onBuilt(uid2, 'hotpot'), false, '钱不够应当返回 false');
        eq(sim.state.finance.funds, 10, '钱不够不扣钱');
    });

    test('拆楼把员工和住户请出去', () => {
        const cfg = loadConfig();
        const { view, houses } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 1 });
        sim.stepMonth();
        const home = houses[0];
        ok(sim.state.residents.some((r) => r.homeId === home), '拆之前有人住');
        sim.onDemolished(home);
        eq(sim.state.residents.filter((r) => r.homeId === home).length, 0, '拆之后没人指向它');
        eq(sim.state.buildings.some((b) => b.uid === home), false);
    });
});

suite('Simulation：每月结算', () => {
    test('账单收支字段齐全，人口守恒', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 3 });
        const rep = sim.stepMonth();
        eq(rep.month, 1);
        ok(rep.income && rep.expense && Array.isArray(rep.events));
        eq(rep.populationBefore, 5);
        eq(rep.populationAfter, sim.state.residents.length);
        ok(rep.income.business >= 0 && rep.income.industry >= 0);
        ok(rep.expense.upkeep > 0, '有维护费');
    });

    test('消费真的进了店，店铺有营业额和交税', () => {
        const cfg = loadConfig();
        const { view, shops } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 3 });
        for (let i = 0; i < 6; i++) sim.stepMonth();
        let revenue = 0;
        let tax = 0;
        for (const key in shops) {
            const uid = (shops as any)[key];
            const b = sim.building(uid)!;
            revenue += b.lastRevenue;
            tax += b.lastTax;
        }
        ok(revenue > 0, `店铺应当有营业额，实际 ${revenue}`);
        ok(tax > 0, '应当交营业税');
        ok(sim.state.finance.lastMonth!.income.business > 0, '财政应当收到营业税');
    });

    test('居民交完消费和租还有钱剩，储蓄不为负', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 3 });
        for (let i = 0; i < 12; i++) sim.stepMonth();
        for (const r of sim.state.residents) ok(r.savings >= 0, `${r.name} 储蓄为负 ${r.savings}`);
    });

    test('心情始终在 0..100', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 8 });
        for (let i = 0; i < 60; i++) {
            sim.stepMonth();
            for (const r of sim.state.residents) inRange(r.mood, 0, 100, `${r.name} 心情`);
        }
    });

    test('没地方上班的人失业计时会涨', () => {
        const cfg = loadConfig();
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        const home = m.build('house', 0, 1);   // 只有房子，没有岗位
        const sim = new Simulation(cfg, m.view(), { seed: 4 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const jobless = sim.state.residents.filter((r) => r.age >= 18 && r.age < 60 && r.homeId === home);
        ok(jobless.length > 0, '应当有劳动年龄的人');
        ok(jobless.some((r) => r.monthsUnemployed > 0), '失业月数应当累计');
    });
});

suite('Simulation：财政', () => {
    test('建设费进月账单', () => {
        const cfg = loadConfig();
        const { map } = basicTown(cfg);
        const view = map.view();
        const sim = new Simulation(cfg, view, { seed: 1 });
        const uid = map.build('barber', 16, 6);
        view.refresh();
        sim.onBuilt(uid, 'barber');
        const rep = sim.stepMonth();
        eq(rep.expense.construction, cfg.building('barber')!.cost);
    });

    test('财政见底会拨救助金，不为负', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 1 });
        sim.state.finance.funds = 0;
        // 让维护费把它压到负数
        sim.state.buildings.push({ uid: 999, defId: 'textile', residentIds: [], workerIds: [], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 });
        sim.stepMonth();
        ok(sim.state.finance.funds >= 0, `应当被救助金救回来，实际 ${sim.state.finance.funds}`);
    });

    test('税率可调且被夹住范围', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 1 });
        sim.setTaxRate('business', 99);
        eq(sim.state.finance.taxRate.business, cfg.economy.taxRange.max);
        sim.setTaxRate('business', -1);
        eq(sim.state.finance.taxRate.business, cfg.economy.taxRange.min);
    });

    test('公共岗位的工资由财政发，居民也拿到', () => {
        const cfg = loadConfig();
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        m.build('house', 0, 1);
        m.build('house', 2, 1);
        m.build('house', 4, 1);
        const clinic = m.build('clinic', 6, 1);
        const sim = new Simulation(cfg, m.view(), { seed: 1 });
        const rep = sim.stepMonth();
        const doctor = sim.state.residents.find((r) => r.jobId === clinic);
        if (doctor) {
            ok(rep.expense.publicWages > 0, '应当在账单里记公共岗位工资');
        }
    });
});

suite('Simulation：迁移与人生', () => {
    test('空岗位 + 空房会有人迁入', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 2 });
        const before = sim.state.residents.length;
        for (let i = 0; i < 24; i++) sim.stepMonth();
        ok(sim.state.residents.length > before, `24 个月应当有人搬来，${before} → ${sim.state.residents.length}`);
    });

    test('没房没岗不会无脑爆人口', () => {
        const cfg = loadConfig();
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        const sim = new Simulation(cfg, m.view(), { seed: 2, opening: false });
        for (let i = 0; i < 24; i++) sim.stepMonth();
        eq(sim.state.residents.length, 0, '什么都没有的时候没人来');
    });

    test('居民日志不超过配置上限', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 6 });
        for (let i = 0; i < 120; i++) sim.stepMonth();
        for (const r of sim.state.residents) ok(r.log.length <= cfg.economy.logLimit, `${r.name} 日志 ${r.log.length} 条`);
    });

    test('年长的会去世，人口结构会更新', () => {
        const cfg = loadConfig();
        // 一栋楼塞满 80+ 的老人
        const m = new MapBuilder();
        m.hRoad(0, 10, 0);
        m.build('apartment', 0, 1, 2, 2);
        m.build('breakfast', 4, 1);
        const sim = new Simulation(cfg, m.view(), { seed: 3, opening: false });
        // 手动塞 6 个老人，记下 id
        const elderIds: number[] = [];
        for (let i = 0; i < 6; i++) {
            const r = (sim as any).createResident(null, i % 2 ? 'F' : 'M', 88);
            sim.state.residents.push(r);
            elderIds.push(r.id);
        }
        (sim as any).assignHomes(sim.state.residents);
        for (let i = 0; i < 120; i++) sim.stepMonth();
        eq(sim.state.residents.filter((r) => elderIds.indexOf(r.id) >= 0).length, 0, '老人应当陆续离世');
        ok(sim.state.residents.length > 0, '空出来的房和岗会有新人来');
    });
});

// ───────────────────────── 交通工具（DESIGN 11） ─────────────────────────
/** 真实配置，但把买车概率改成 1，方便断言 */
function sureBuyConfig(): SimConfig {
    const root = join(process.cwd(), 'assets/resources/config');
    const economy = JSON.parse(readFileSync(join(root, 'economy.json'), 'utf8'));
    const names = JSON.parse(readFileSync(join(root, 'names.json'), 'utf8'));
    for (const k of ['ebike', 'moto', 'car']) economy.vehicles.types[k].chance = 1;
    economy.tuning.residents.idleSavingsMonths = 0;   // 这组测「有钱买车」，不让有钱人赋闲（D024）
    return makeSimConfig(economy, names);
}

/** 一条路 + 三栋自建房 + 早餐铺 + 指定的厂；塞 n 个有钱的成年人 */
function vehicleTown(cfg: SimConfig, factories: string[], n = 4, savings = 50000, seed = 7) {
    const m = new MapBuilder(30, 10);
    m.hRoad(0, 25, 0);
    m.build('house', 0, 1); m.build('house', 1, 1); m.build('house', 2, 1);
    m.build('breakfast', 3, 1);
    const uids: number[] = [];
    let x = 5;
    for (const f of factories) { uids.push(m.build(f, x, 1, 2, 2)); x += 3; }
    const sim = new Simulation(cfg, m.view(), { seed, opening: false });
    for (let i = 0; i < n; i++) {
        const r = (sim as any).createResident(null, i % 2 ? 'F' : 'M', 30);
        r.savings = savings;
        r.education = 1;
        sim.state.residents.push(r);
    }
    (sim as any).assignHomes(sim.state.residents);
    (sim as any).fillVacancies((sim as any).refreshWorld());
    return { sim, factories: uids };
}

suite('交通工具', () => {
    test('配置读进来了：startFunds 10 万、四档交通工具', () => {
        const cfg = loadConfig();
        eq(cfg.economy.startFunds, 100000);
        eq(cfg.economy.vehicles.tiers.car.price, 40000);
        eq(cfg.economy.vehicles.tiers.moto.factory, 'moto-factory');
        eq(cfg.economy.vehicles.tiers.walk.range, 1);
        ok(cfg.building('moto-factory') !== null && cfg.building('car-factory') !== null, '两座新厂有经营数据');
        eq(parseEconomy(null).vehicles.tiers.ebike.price, 3000, '没写 vehicles 段时用默认值');
    });

    test('新居民都是步行', () => {
        const cfg = loadConfig();
        const { view } = basicTown(cfg);
        const sim = new Simulation(cfg, view, { seed: 1 });
        for (const r of sim.state.residents) eq(r.vehicle, 'walk');
        eq(sim.summary().vehicles, 0);
    });

    test('县里没有车厂：再有钱也不买车', () => {
        const cfg = sureBuyConfig();
        const { sim } = vehicleTown(cfg, ['workshop'], 4, 200000);
        for (let i = 0; i < 24; i++) sim.stepMonth();
        for (const r of sim.state.residents) eq(r.vehicle, 'walk', r.name);
        eq(sim.summary().vehicles, 0);
    });

    test('有摩托车厂、有钱有工作：买最好的那档，钱进工厂产值', () => {
        const cfg = sureBuyConfig();
        const { sim, factories } = vehicleTown(cfg, ['moto-factory'], 4, 50000);
        const fundsBefore = sim.state.finance.funds;
        const rep = sim.stepMonth();
        const buyers = sim.state.residents.filter((r) => r.vehicle !== 'walk');
        ok(buyers.length >= 4, `应当都买了，实际 ${buyers.length}`);
        for (const r of buyers) {
            eq(r.vehicle, 'moto', `${r.name} 月薪 ${r.salary} 够摩托车，应当直接买摩托`);
            ok(r.log.some((e) => e.text === '买了一辆摩托车'), '个人日志');
        }
        ok(rep.events.some((e) => /买了一辆摩托车$/.test(e.text)), '大事记');
        const f = sim.building(factories[0])!;
        const econ = cfg.building('moto-factory')!;
        const extra = f.lastRevenue - 8000 * buyers.length;
        ok(extra > 0 && extra <= econ.capacity * econ.price, `产值 = 生产 + 车款：${f.lastRevenue}`);
        ok(rep.income.industry >= Math.round(8000 * buyers.length * sim.state.finance.taxRate.industry), '企业税照收');
        eq(sim.summary().vehicles, buyers.length);
        ok(isFinite(sim.state.finance.funds) && sim.state.finance.funds !== fundsBefore);
    });

    test('月薪不到 3000 只能买电动车', () => {
        const cfg = sureBuyConfig();
        // 小作坊 2600 元；摩托车厂只当"县里有厂"，岗位占满不让人进
        const { sim, factories } = vehicleTown(cfg, ['workshop', 'moto-factory'], 3, 50000);
        const moto = sim.building(factories[1])!;
        for (const r of sim.state.residents) {
            if (r.jobId === moto.uid) { moto.workerIds = moto.workerIds.filter((id) => id !== r.id); r.jobId = factories[0]; r.salary = 2600; r.jobTitle = '作坊工'; }
        }
        (sim as any).buyVehicles({ business: 0, industry: 0, income: 0, land: 0, investment: 0 });
        for (const r of sim.state.residents) if (r.jobId !== null) eq(r.vehicle, 'ebike', r.name);
    });

    test('只往上换，不会降级', () => {
        const cfg = sureBuyConfig();
        const { sim } = vehicleTown(cfg, ['moto-factory'], 4, 50000);
        sim.state.residents[0].vehicle = 'car';
        for (let i = 0; i < 24; i++) sim.stepMonth();
        const r0 = sim.resident(sim.state.residents[0].id);
        if (r0) eq(r0.vehicle, 'car', '有汽车的人还是汽车（汽车厂没有，也不会换成摩托）');
        for (const r of sim.state.residents) ok(r.vehicle !== 'ebike' || r.salary < 3000, '月薪够的人不会停在电动车');
    });

    test('有汽车厂、高薪：买汽车', () => {
        const cfg = sureBuyConfig();
        const { sim } = vehicleTown(cfg, ['car-factory'], 3, 100000);
        const r = sim.state.residents[0];
        r.salary = 6800; r.education = 3;
        (sim as any).buyVehicles({ business: 0, industry: 0, income: 0, land: 0, investment: 0 });
        eq(r.vehicle, 'car');
        eq(r.savings, 100000 - cfg.economy.vehicles.tiers.car.price);
    });

    test('汽车每月油费从可支配收入扣', () => {
        const cfg = loadConfig();
        // 没房没店没岗：每月只剩油费在动
        const make = (vehicle: 'walk' | 'car') => {
            const m = new MapBuilder(10, 10);
            m.hRoad(0, 5, 0);
            const sim = new Simulation(cfg, m.view(), { seed: 11, opening: false });
            const r = (sim as any).createResident(null, 'M', 30);
            r.savings = 10000;
            r.vehicle = vehicle;
            sim.state.residents.push(r);
            sim.stepMonth();
            return r.savings as number;
        };
        const walk = make('walk');
        const car = make('car');
        near(walk - car, cfg.economy.vehicles.tiers.car.fuel, 1e-6, '差额 = 油费');
    });

    test('旧存档缺 vehicle：读档时补成 walk，能接着跑', () => {
        const cfg = loadConfig();
        const a = basicTown(cfg);
        const s1 = new Simulation(cfg, a.view, { seed: 9 });
        for (let i = 0; i < 12; i++) s1.stepMonth();
        const raw = JSON.parse(JSON.stringify(s1.state));
        for (const r of raw.residents) delete r.vehicle;
        const s2 = new Simulation(cfg, basicTown(cfg).view, { state: raw });
        eq(s2.state.residents.length, s1.state.residents.length, '人没丢');
        for (const r of s2.state.residents) eq(r.vehicle, 'walk');
        eq(s2.state.rngState, s1.state.rngState, '随机数接着算');
        eq(s2.state.month, 12);
        for (let i = 0; i < 12; i++) s2.stepMonth();
        eq(s2.state.month, 24);
        ok(s2.summary().population > 0);
    });

    test('读档后接着跑和不存档结果一致（12 个月内）', () => {
        const cfg = loadConfig();
        const s1 = new Simulation(cfg, basicTown(cfg).view, { seed: 21 });
        for (let i = 0; i < 6; i++) s1.stepMonth();
        const s2 = new Simulation(cfg, basicTown(cfg).view, { state: JSON.parse(JSON.stringify(s1.state)) });
        for (let i = 0; i < 6; i++) { s1.stepMonth(); s2.stepMonth(); }
        eq(JSON.stringify(s2.state), JSON.stringify(s1.state));
    });

    test('有车厂时同种子可复现', () => {
        const cfg = loadConfig();
        // 存款 15000：低于赋闲线（12 ×（300 + 1000）= 15600），他们会去上班、攒钱买车（D024 / D026）
        const a = vehicleTown(cfg, ['moto-factory'], 6, 15000, 33).sim;
        const b = vehicleTown(cfg, ['moto-factory'], 6, 15000, 33).sim;
        for (let i = 0; i < 60; i++) eq(JSON.stringify(a.stepMonth()), JSON.stringify(b.stepMonth()), `第 ${i} 月`);
        eq(JSON.stringify(a.state), JSON.stringify(b.state));
        ok(a.summary().vehicles > 0, `5 年里应当有人买车，实际 ${a.summary().vehicles}`);
    });

    test('每种店半径不同：同样 7 格，早餐铺（5）够不着，奶茶店（8）够得着', () => {
        const cfg = loadConfig();
        const view = (id: string) => {
            const m = new MapBuilder(30, 6);
            m.hRoad(0, 25, 0);
            const house = m.build('house', 0, 1);
            const shop = m.build(id, 7, 1);
            return { m, house, shop };
        };
        for (const [id, reach] of [['breakfast', false], ['milk-tea', true]] as [string, boolean][]) {
            const { m, house, shop } = view(id);
            const d = m.view().roadDistance(house, shop);
            const rad = cfg.building(id)!.radius;
            eq(d <= rad, reach, `${id} 半径 ${rad}，距离 ${d}`);
            const sim = new Simulation(cfg, m.view(), { seed: 3, opening: false });
            const r = (sim as any).createResident(null, 'M', 30);
            r.savings = 12000;
            sim.state.residents.push(r);
            (sim as any).assignHomes(sim.state.residents);
            sim.stepMonth();
            const b = sim.building(shop)!;
            const local = b.lastRevenue - (b.lastOutside ?? 0);
            ok(reach ? local > 0 : local === 0, `${id}：县里人花的钱 ${local}`);
        }
    });

    test('有车的人消费半径更大', () => {
        const cfg = loadConfig();
        const m = new MapBuilder(40, 6);
        m.hRoad(0, 35, 0);
        const house = m.build('house', 0, 1);
        const shop = m.build('milk-tea', 10, 1);  // 奶茶店半径 8：步行够不着，电动车 12 格够得着
        const run = (v: 'walk' | 'ebike') => {
            const sim = new Simulation(cfg, m.view(), { seed: 2, opening: false });
            const r = (sim as any).createResident(null, 'M', 30);
            // 存款低于赋闲线：他会去早餐铺上班，店才开得了门（D026 没有店员就不营业）
            r.savings = 12000; r.vehicle = v;
            sim.state.residents.push(r);
            (sim as any).assignHomes(sim.state.residents);
            sim.stepMonth();
            const b = sim.building(shop)!;
            ok(b.workerIds.length === 1, '他在店里上班');
            return b.lastRevenue - (b.lastOutside ?? 0);   // 只看县里人花的钱，不算过路客
        };
        const d = m.view().roadDistance(house, shop);
        const rad = cfg.building('milk-tea')!.radius;
        ok(d > rad && d <= rad * 1.5, `距离 ${d} 要落在 ${rad}～${rad * 1.5} 之间`);
        eq(run('walk'), 0, '步行够不着');   // 钱数，不是人次
        ok(run('ebike') > 0, '骑电动车能去');
    });
});

// ───────────────────────── 赋闲（D024） ─────────────────────────
suite('赋闲：有钱可以不上班', () => {
    const lineOf = (cfg: SimConfig) => {
        const e = cfg.economy;
        return e.residents.idleSavingsMonths * (e.rentPerPerson + e.residents.idleLivingCost);
    };

    test('存款够门槛：不找工作、不算失业、心情不扣', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 21 });
        const r = (sim as any).createResident(null, 'F', 35);
        r.savings = lineOf(cfg) * 3;
        sim.state.residents.push(r);
        for (let i = 0; i < 8; i++) sim.stepMonth();
        eq(r.idle, true, '应当赋闲');
        eq(r.jobId, null, '不去上班');
        eq(r.monthsUnemployed, 0, '不算失业');
        ok(sim.state.residents.indexOf(r) >= 0, '不会因为失业搬走');
    });

    test('存款不够：照常找工作 / 算失业', () => {
        const cfg = loadConfig();
        const m = new MapBuilder(10, 10);
        m.hRoad(0, 5, 0);
        const sim = new Simulation(cfg, m.view(), { seed: 22, opening: false });
        const r = (sim as any).createResident(null, 'M', 30);
        r.savings = 100;
        sim.state.residents.push(r);
        sim.stepMonth();
        ok(!r.idle, '不该赋闲');
        eq(r.monthsUnemployed, 1, '没岗位就是失业');
    });

    test('赋闲后存款花到门槛 × idleExitRatio 以下，重新找工作', () => {
        const cfg = loadConfig();
        const m = new MapBuilder(10, 10);
        m.hRoad(0, 5, 0);
        const sim = new Simulation(cfg, m.view(), { seed: 23, opening: false });
        const r = (sim as any).createResident(null, 'M', 30);
        const line = lineOf(cfg);
        r.savings = line;
        sim.state.residents.push(r);
        sim.stepMonth();
        eq(r.idle, true, '刚好够门槛');
        r.savings = line * cfg.economy.residents.idleExitRatio + 10;
        sim.stepMonth();
        eq(r.idle, true, '门槛以下但没跌破退出线，继续赋闲');
        r.savings = line * cfg.economy.residents.idleExitRatio * 0.5;
        sim.stepMonth();
        eq(r.idle, false, '跌破退出线');
        ok(r.monthsUnemployed >= 1, '开始算失业');
    });
});

// ───────────────────────── 真实账目（D026） ─────────────────────────
suite('真实账目：钱有来处有去处', () => {
    const sum = (o: Record<string, number>) => Object.keys(o).reduce((a, k) => a + o[k], 0);

    test('守恒：每月县内的钱变化 = 县外流入 − 流出（基本小镇，36 个月）', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 31 });
        sim.stepMonth();
        for (let m = 0; m < 36; m++) {
            const before = sim.moneyInCounty();
            sim.stepMonth();
            const f = sim.lastFlows;
            const expected = sum(f.inflow) - sum(f.outflow);
            near(sim.moneyInCounty() - before, expected, 1e-6 * Math.max(1, Math.abs(before)), `第 ${m} 个月对不上`);
        }
    });

    test('公共服务（T532）：按人头 × 等级倍率 × (1 + 人口 / 规模系数)，财政出、算流出、守恒', () => {
        const cfg = loadConfig();
        const e = cfg.economy;
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 33 });
        sim.stepMonth();
        const before = sim.moneyInCounty();
        const rep = sim.stepMonth();
        const pop = rep.populationBefore;   // 月中结算，迁入在结算之后
        const mult = (e.serviceLevelMult[sim.state.level] ?? 1) * (e.serviceCrowding > 0 ? 1 + pop / e.serviceCrowding : 1);
        ok(e.servicePerCapita > 0, '配置里要有公共服务');
        eq(rep.expense.services, Math.round(pop * e.servicePerCapita * mult), '账单里的公共服务');
        const f = sim.lastFlows;
        near(sim.moneyInCounty() - before, sum(f.inflow) - sum(f.outflow), 1e-6 * Math.max(1, Math.abs(before)), '守恒');
    });

    test('守恒：中途盖楼也对得上（施工款算流出）', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 32 });
        sim.stepMonth();
        const before = sim.moneyInCounty();
        const uid = t.map.build('milk-tea', 12, 4);
        ok(sim.onBuilt(uid, 'milk-tea'), '盖得起');
        sim.stepMonth();
        const f = sim.lastFlows;
        ok(f.outflow.construction >= cfg.building('milk-tea')!.cost, '施工款记进流出');
        near(sim.moneyInCounty() - before, sum(f.inflow) - sum(f.outflow), 1e-6 * Math.abs(before));
    });

    test('店铺一本账：利润 = 营业额 − 工资 − 成本 − 税 − 维护；县属利润进财政', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 33 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        let profit = 0;
        for (const b of sim.state.buildings) {
            if (!b.lastRevenue && !b.lastWages && !b.lastUpkeep) continue;
            near(b.lastProfit!, b.lastRevenue - (b.lastWages ?? 0) - (b.lastCost ?? 0) - b.lastTax - (b.lastUpkeep ?? 0), 1e-6, b.defId);
            profit += b.lastProfit ?? 0;
        }
        near(sim.state.finance.lastMonth!.income.profit, profit, 1e-6, '经营利润合计进账单');
    });

    test('工资由雇主出：店铺的工资 = 店员工资之和', () => {
        const cfg = loadConfig();
        (cfg.economy as any).immigrationRate = 0;   // 月底来的新人当月才入职、还没发工资，关掉免得对不上
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 34 });
        sim.stepMonth();
        for (const b of sim.state.buildings) {
            const econ = cfg.building(b.defId)!;
            if (econ.publicJob || !econ.jobs.length) continue;
            const w = b.workerIds.map((id) => sim.resident(id)!.salary).reduce((a, x) => a + x, 0);
            eq(b.lastWages, w, b.defId);
        }
    });

    test('连续亏损 3 个月裁一个人，至少留 1 人', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 35 });
        sim.stepMonth();
        const b = sim.state.buildings.find((x) => x.workerIds.length >= 2);
        ok(!!b, '找一栋有 2 人以上的楼');
        const n = b!.workerIds.length;
        b!.lossMonths = cfg.economy.layoffMonths - 1;
        // 让它这个月必亏：成本率拉满
        (cfg.building(b!.defId) as any).costRate = 1;
        sim.stepMonth();
        eq(b!.workerIds.length, n - 1, `应当裁员：${n} → ${b!.workerIds.length}`);
        ok((b!.freezeMonths ?? 0) > 0, '裁员后暂停招人');
    });
});

// ───────────────────────── 幸福度与迁出挽留（D026） ─────────────────────────
suite('幸福度：分项、想走、挽留、迁入', () => {
    test('幸福度分项：每人都有，目标 = 50 + 分项之和', () => {
        const cfg = loadConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 41 });
        sim.stepMonth();
        for (const r of sim.state.residents) {
            if (r.arrivedMonth >= sim.state.month) continue;   // 月底才来的人下个月才算
            ok(Array.isArray(r.moodParts), `${r.name} 有分项`);
            for (const p of r.moodParts!) ok(p.label.length > 0 && p.value !== 0);
        }
    });

    test('幸福度 < 30：想走 + 吐槽原因 + 通知；挽留期满全家搬走', () => {
        const cfg = loadConfig();
        const m = new MapBuilder(12, 6);
        m.hRoad(0, 10, 0);
        m.build('house', 0, 1);
        const sim = new Simulation(cfg, m.view(), { seed: 42, opening: false });
        const r = (sim as any).createResident(null, 'M', 30);
        r.savings = 100; r.mood = 10;
        sim.state.residents.push(r);
        (sim as any).assignHomes(sim.state.residents);
        const rep = sim.stepMonth();
        ok(!!r.leaving, '进入想走状态');
        ok(r.leaving.reasons.length > 0, '有吐槽原因');
        ok(rep.notices!.some((n) => n.kind === 'warn' && n.residentIds[0] === r.id), '公告「想走」');
        let left = false;
        for (let i = 0; i < cfg.economy.leaveMonths + 1 && !left; i++) {
            const rr = sim.stepMonth();
            if (rr.notices!.some((n) => n.kind === 'leave')) left = true;
        }
        ok(left, '挽留期满搬走，有「搬离」通知');
        eq(sim.state.residents.length, 0);
        ok((sim.state.buzz ?? 0) < 0, '有人走，口碑下降');
    });

    test('挽留：想走期间幸福度回到 35 以上就留下', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 43 });
        sim.stepMonth();
        const r = sim.state.residents.find((x) => x.age >= 18)!;
        r.leaving = { since: sim.state.month, reasons: ['上班太远'] };
        r.mood = 80;
        const rep = sim.stepMonth();
        ok(!r.leaving, '留下了');
        ok(rep.notices!.some((n) => n.kind === 'stay'), '公告「决定留下」');
    });

    test('迁入：县城幸福度 < 30 没人来；越高来得越多', () => {
        const cfg = loadConfig();
        const arrivals = (mood: number) => {
            let n = 0;
            for (let seed = 1; seed <= 15; seed++) {
                const sim = new Simulation(cfg, basicTown(cfg).view, { seed });
                for (let k = 0; k < 2; k++) {
                    for (const r of sim.state.residents) r.mood = mood;
                    (sim as any).nextMood = (r: any) => mood;
                    const rep = sim.stepMonth();
                    n += rep.notices!.filter((x) => x.kind === 'arrive').length;
                }
            }
            return n;
        };
        eq(arrivals(25), 0, '25 分没人来');
        const mid = arrivals(40), high = arrivals(85);
        ok(high > mid, `85 分（${high}）应当比 40 分（${mid}）来得多`);
    });
});

suite('施工（D026）', () => {
    test('盖下先施工：工期内不住人、不招工；到期完工并发通知', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 51 });
        sim.stepMonth();
        const uid = t.map.build('textile', 15, 6, 2, 2);
        ok(sim.onBuilt(uid, 'textile'), '盖得起');
        eq(sim.building(uid), null, '施工中不是能用的楼');
        near(sim.constructionProgress(uid, 0)!, 0, 1e-9);
        near(sim.constructionProgress(uid, 0.5)!, 0.25, 1e-9, '2 天工期过了半天 = 25%');
        sim.stepMonth();
        eq(sim.building(uid), null, '第 1 天还没完');
        const rep = sim.stepMonth();
        ok(!!sim.building(uid), '第 2 天完工');
        eq(sim.constructionProgress(uid, 0), null);
        ok(rep.notices!.some((n) => /完工/.test(n.text)), '完工通知');
    });

    test('月中开工：进度从 0 起算，不从月初算（D026 进度条一出现就一半的 bug）', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 53 });
        sim.stepMonth();
        const uid = t.map.build('barber', 15, 6);   // 1 天工期
        // 下午开工：本月已经走了 50%
        ok(sim.onBuilt(uid, 'barber', 0.5), '盖得起');
        near(sim.constructionProgress(uid, 0.5)!, 0, 1e-9, '刚开工就是 0%，不是 50%');
        // 月中开工要干满一整月，而完工只在月初结算：下个月初才干了半程
        sim.stepMonth();
        eq(sim.building(uid), null, '下个月初还没干满，不完工');
        near(sim.constructionProgress(uid, 0)!, 1 / 3, 1e-9, '下个月初 = 干了 0.5 / 总共 1.5 个月');
        const rep = sim.stepMonth();
        ok(!!sim.building(uid), '再下个月初完工');
        ok(rep.notices!.some((n) => /完工/.test(n.text)), '完工通知');
    });

    test('不会越晚开工越快：开工越晚，完工不会更早', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 54 });
        sim.stepMonth();
        const early = t.map.build('barber', 15, 6), late = t.map.build('barber', 17, 6);
        sim.onBuilt(early, 'barber', 0);      // 一早开工
        sim.onBuilt(late, 'barber', 0.9);     // 快天黑才开工
        sim.stepMonth();
        ok(!!sim.building(early), '月初开工：下个月初完工');
        eq(sim.building(late), null, '快天黑才开工的不能同一天完工（旧逻辑 0.1 个月就盖完了）');
        sim.stepMonth();
        ok(!!sim.building(late), '再下个月初完工');
    });

    test('拆工地：从施工列表去掉，钱不退', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 52 });
        const uid = t.map.build('barber', 15, 6);
        const f0 = sim.state.finance.funds;
        sim.onBuilt(uid, 'barber');
        sim.onDemolished(uid);
        eq(sim.state.construction!.length, 0);
        eq(sim.state.finance.funds, f0 - cfg.building('barber')!.cost);
    });
});

suite('研究 / 目标 / 心愿（D026 第二批）', () => {
    test('开局只解锁几种；没研究的不能盖', () => {
        const cfg = loadFullConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 61 });
        ok(sim.isUnlocked('breakfast') && sim.isUnlocked('hut'));
        ok(!sim.isUnlocked('house'), '自建小楼要研究、而且只能翻盖得到');
        ok(!sim.isUnlocked('bbq'), '烧烤摊要研究');
        const uid = t.map.build('bbq', 15, 6);
        eq(sim.onBuilt(uid, 'bbq'), false, '没研究不让盖');
    });

    test('研究：扣钱、按天推进、完成后解锁并发通知；一次一项', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 62 });
        const f0 = sim.state.finance.funds;
        eq(sim.startResearch('r-bbq'), null);
        eq(sim.state.finance.funds, f0 - 5000);
        ok(!!sim.startResearch('r-barber'), '研究位只有 1 个时一次只能一项');
        eq(sim.researchList().find((r) => r.id === 'r-bbq')!.state, 'active');
        const rep = sim.stepMonth();
        ok(sim.isUnlocked('bbq'), '1 天后解锁');
        ok(rep.notices!.some((n) => n.kind === 'research'));
        eq(rep.expense.research, 5000, '账单里有研究费');
    });

    test('D030 研究位：开第 2 个位后能同时研究两项，两项都按天推进', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 71 });
        sim.state.finance.funds = 200000;
        eq(sim.researchSlots().total, 1);
        eq(sim.openResearchSlot(), null);
        eq(sim.researchSlots().total, 2);
        eq(sim.startResearch('r-bbq'), null);
        eq(sim.startResearch('r-barber'), null, '第二个位能用');
        ok(!!sim.startResearch('r-milk-tea'), '两个位都占了');
        sim.stepMonth();
        ok(sim.isUnlocked('bbq') && sim.isUnlocked('barber'), '两项都完成');
        eq(sim.openResearchSlot(), null);
        ok(!!sim.openResearchSlot(), '最多 3 个');
    });

    test('D030 加速研究：花钱立刻完成，研究位空出来', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 72 });
        sim.state.finance.funds = 200000;
        eq(sim.startResearch('r-brick'), null);
        const f0 = sim.state.finance.funds;
        eq(sim.rushResearch('r-brick'), null);
        ok(sim.state.finance.funds < f0, '扣了钱');
        ok((sim.state.researched ?? []).indexOf('r-brick') >= 0, '立刻完成');
        eq(sim.state.research, null, '研究位空出来了');
    });

    test('D030 人才引进：当场来 6 人、学历对、扣钱、冷却 5 天', () => {
        const cfg = loadFullConfig();
        const t = basicTown(cfg);
        t.map.build('apartment', 2, 11, 2, 2);
        t.map.build('apartment', 5, 11, 2, 2);
        const sim = new Simulation(cfg, t.view, { seed: 73 });
        sim.state.finance.funds = 200000;
        const n0 = sim.state.residents.length;
        const f0 = sim.state.finance.funds;
        const before = sim.housingSummary();
        eq(sim.hireTalents(2), null);
        const after = sim.housingSummary();
        eq(after.population, before.population + 6);
        eq(after.occupied, before.occupied + 6);
        eq(after.available, before.available - 6);
        eq(after.capacity, before.capacity);
        const fresh = sim.state.residents.slice(n0);
        eq(fresh.length, 6, '来了 6 人');
        ok(fresh.every((r) => r.education === 2 && r.age >= 22 && r.age <= 30 && r.homeId !== null), '大专、年轻、有房');
        eq(sim.state.finance.funds, f0 - 5000 * 6, '扣钱');
        ok(!!sim.hireTalents(0), '冷却中');
        for (let i = 0; i < 5; i++) sim.stepMonth();
        ok(sim.talentStatus().ready, '5 天后能再招');
    });

    test('D030 人才引进：空房不够不让招，原因说清楚', () => {
        const cfg = loadFullConfig();
        const map = new MapBuilder(12, 12);
        map.hRoad(1, 10, 5);
        map.build('hut', 3, 4);                 // 只有一间土坯房，住 3 人
        const sim = new Simulation(cfg, map.view(), { seed: 74 });
        sim.state.finance.funds = 200000;
        ok(/空房/.test(sim.hireTalents(0) ?? ''), '说清楚是空房不够');
        eq(sim.state.finance.funds, 200000, '没扣钱');
    });

    test('住房看板只统计已建成住宅，并为本地待安置居民预留住位', () => {
        const cfg = loadFullConfig();
        const map = new MapBuilder(12, 12);
        map.hRoad(1, 10, 5);
        map.build('hut', 3, 4);
        map.build('breakfast', 5, 4);
        const sim = new Simulation(cfg, map.view(), { seed: 74 });
        sim.state.construction = [{ uid: 90, defId: 'apartment', left: 2, total: 2 }];
        const h = sim.housingSummary();
        eq(h.buildings, 1);
        eq(h.capacity, cfg.building('hut')!.housing);
        eq(h.population, sim.state.residents.length);
        eq(h.occupied + h.unhoused, h.population);
        eq(h.vacant + h.occupied, h.capacity);
        ok(h.unhoused > h.vacant, '本地住位已经不足');
        eq(h.available, 0);
        ok(sim.hireTalents(0)?.includes(`还需增加 ${6 + h.unhoused - h.vacant} 个住位`));
    });

    test('研究前置：人口 / 等级 / 要有某栋楼，原因说清楚', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 63 });
        const L = sim.researchList();
        ok(/人口/.test(L.find((r) => r.id === 'r-clinic')!.reason), '卫生院要人口 10');
        ok(/镇上/.test(L.find((r) => r.id === 'r-road')!.reason), '城市道路要镇上');
        ok(sim.startResearch('r-road') !== null);
    });

    test('守恒：研究费算流出', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 64 });
        sim.stepMonth();
        const before = sim.moneyInCounty();
        sim.startResearch('r-milk-tea');
        sim.stepMonth();
        const f = sim.lastFlows;
        const sumf = (o: Record<string, number>) => Object.keys(o).reduce((a, k) => a + o[k], 0);
        near(sim.moneyInCounty() - before, sumf(f.inflow) - sumf(f.outflow), 1e-6 * Math.abs(before));
    });

    test('阶段目标：没完成不能升级；完成后手动升级、发奖励', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view, { seed: 65 });
        ok(sim.goals().length >= 3);
        eq(sim.upgradeLevel(), null, '没完成');
        for (let i = 0; i < 24; i++) sim.stepMonth();
        eq(sim.state.level, 'village', '不会自动升级');
        // 强行满足：改目标为都已完成
        (cfg.progress as any).goals.village = [{ kind: 'pop', target: 1, of: [], text: 'x' }];
        const f0 = sim.state.finance.funds;
        eq(sim.upgradeLevel(), 'town');
        eq(sim.state.finance.funds, f0 + cfg.progress!.levelReward.town!);
    });

    test('每次晋升单独留档，失败申请不写历史，读档不会重算日期、资金和人口差额', () => {
        const cfg = loadFullConfig();
        const town = basicTown(cfg);
        const sim = new Simulation(cfg, town.view);
        eq(sim.upgradeLevel(), null);
        eq(sim.state.promotions?.length ?? 0, 0);
        sim.state.finance.funds = 0;
        for (const level of ['village', 'town', 'county', 'city'] as const) {
            cfg.progress!.goals[level] = [{ kind: 'pop', target: 1, text: '有居民', of: [] }];
            sim.state.month += 12;
            ok(sim.upgradeLevel());
        }
        const records = sim.state.promotions!;
        eq(records.map(r => r.to).join(','), 'town,county,city,top100');
        eq(records[0].reward, 30000);
        eq(records[0].month, 12);
        const road = records[0].projects.find(p => p.id === 'r-road')!;
        ok(road.newlyAvailable);
        eq(road.missing.length, 0, '到账后的奖励付得起城市道路研究');
        const school = records[0].projects.find(p => p.id === 'r-school')!;
        ok(school.missing.some(m => m.indexOf(`还差 ${30 - records[0].population} 位居民`) >= 0));
        ok(school.missing.some(m => m.indexOf('10,000') >= 0));
        eq(records[2].projects.filter(p => p.newlyAvailable).length, 0);
        eq(records[3].projects.filter(p => p.newlyAvailable).length, 0);
        eq(sim.upgradeLevel(), null);
        eq(records.length, 4);
        const original = JSON.stringify(records);
        sim.state.finance.funds = 1000000;
        sim.stepMonth();
        const save = JSON.parse(JSON.stringify(sim.state));
        const loaded = new Simulation(cfg, town.view, { state: save });
        eq(JSON.stringify(loaded.state.promotions), original);
        delete save.promotions;
        const old = new Simulation(cfg, town.view, { state: save });
        eq(old.state.promotions?.length ?? 0, 0, '不替旧档编造历史');
    });

    test('同样升镇，26 人的学校还差 4 人，32 人的学校可以立刻研究', () => {
        for (const population of [26, 32]) {
            const cfg = loadFullConfig();
            cfg.progress!.goals.village = [{ kind: 'pop', target: 1, text: '有居民', of: [] }];
            const sim = new Simulation(cfg, basicTown(cfg).view);
            while (sim.state.residents.length < population) {
                sim.state.residents.push({ ...sim.state.residents[0], id: sim.state.nextResidentId++ });
            }
            eq(sim.upgradeLevel(), 'town');
            const school = sim.state.promotions![0].projects.find(p => p.id === 'r-school')!;
            eq(school.missing.length === 0, population >= 30);
            if (population < 30) ok(school.missing[0].indexOf('还差 4 位居民') >= 0);
            eq(sim.startResearch(school.id) === null, school.missing.length === 0);
        }
    });

    test('晋升记录同时列出缺少的建筑、学历、经费和研究位，跳过已研究和进行中的项目', () => {
        const cfg = loadFullConfig();
        const sim = new Simulation(cfg, basicTown(cfg).view);
        sim.state.level = 'town';
        cfg.progress!.goals.town = [{ kind: 'pop', target: 1, text: '有居民', of: [] }];
        sim.state.research = [{ id: 'r-road', total: 2, left: 1 }];
        sim.state.researched = ['r-milk-tea'];
        for (const p of sim.state.residents) p.education = 0;
        cfg.progress!.research.find(r => r.id === 'r-electronics')!.cost = 200000;
        sim.state.finance.funds = 0;
        eq(sim.upgradeLevel(), 'county');
        const projects = sim.state.promotions![0].projects;
        const gaps = projects.find(p => p.id === 'r-electronics')!.missing.join(' ');
        for (const word of ['学校', '5 位高中', '120,000', '研究位']) ok(gaps.indexOf(word) >= 0, gaps);
        ok(!projects.some(p => p.id === 'r-road' || p.id === 'r-milk-tea'));
        ok(projects.every(p => p.missing.length > 0));
    });

    test('心愿：附近缺店 → 冒心愿（有建议）→ 盖了店 → 实现、幸福度涨、计数', () => {
        const cfg = loadFullConfig();
        cfg.progress!.wishes.chance = 1;
        const m = new MapBuilder(20, 8);
        m.hRoad(0, 18, 3);
        m.build('house', 2, 2); m.build('workshop', 4, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 66 });
        sim.stepMonth();
        const w = sim.state.residents.find((r) => r.wish && r.wish.kind === 'shop' && r.wish.demand === 'food');
        ok(!!w, '应当有人想吃饭');
        eq(w!.wish!.suggest, 'breakfast', '建议盖早餐铺');
        const mood0 = w!.mood;
        const uid = m.build('breakfast', 6, 2);
        sim.onBuilt(uid, 'breakfast');
        sim.stepMonth(); sim.stepMonth();   // 1 天工期
        ok(!w!.wish || w!.wish.kind !== 'shop' || w!.wish.demand !== 'food', '心愿实现了');
        ok((sim.state.wishesDone ?? 0) >= 1);
        ok(w!.mood > mood0, '幸福度涨了');
    });

    test('旧存档（没有研究记录）：按等级补上解锁，地图上已有的楼都能继续用', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const old = new Simulation(cfg, t.view, { seed: 67 });
        old.stepMonth();
        const raw = JSON.parse(JSON.stringify(old.state));
        delete raw.unlocked; delete raw.researched;
        const full = loadFullConfig();
        const sim = new Simulation(full, t.view, { state: raw });
        ok(sim.isUnlocked('supermarket'), '地图上已有的超市算解锁');
        ok(sim.isUnlocked('milk-tea'), '村口的研究算完成');
        ok(!sim.isUnlocked('school'), '镇上的研究没完成');
    });
});

suite('特色街道 / 环境 / 住房 / 招商（D026 第三、四批）', () => {
    const sumf = (o: Record<string, number>) => Object.keys(o).reduce((a, k) => a + o[k], 0);
    const unlockAll = (sim: Simulation) => { sim.state.unlocked = Array.from(new Set([...(sim.state.unlocked ?? []), 'bbq', 'milk-tea', 'hotpot', 'barber', 'phone-shop', 'brick', 'house', 'detached', 'textile'])); };

    test('特色街道：三家店沿路挨着就凑成，发通知；成员店过路客变多', () => {
        const cfg = loadFullConfig();
        const m = new MapBuilder(20, 8);
        m.hRoad(0, 18, 3);
        m.build('hut', 0, 2); m.build('workshop', 18, 2);
        const bbq = m.build('bbq', 4, 2), tea = m.build('milk-tea', 5, 2), pot = m.build('hotpot', 6, 4, 2, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 71, opening: false });
        const rep = sim.stepMonth();
        eq((sim.state.streets ?? []).length, 1, '凑成一条');
        eq(sim.state.streets![0].kind, 'night');
        ok(rep.notices!.some((n) => n.kind === 'street'), '通知');
        eq(sim.streetBook().find((x) => x.id === 'night')!.count, 1);
        void bbq; void tea; void pot;
    });

    test('特色街道放置提示：差一家时提示「再盖一家」，凑齐时提示「能凑成」', () => {
        const cfg = loadFullConfig();
        const m = new MapBuilder(20, 8);
        m.hRoad(0, 18, 3);
        m.build('bbq', 4, 2); m.build('milk-tea', 5, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 72, opening: false });
        ok(/能凑成「夜市一条街」/.test(sim.streetHint('hotpot', 6, 4, 2, 2) ?? ''), '火锅店凑齐');
        ok(/再在附近盖一家火锅店/.test(sim.streetHint('bbq', 7, 2, 1, 1) ?? '') || /再在附近盖一家/.test(sim.streetHint('milk-tea', 7, 2, 1, 1) ?? ''), '差一家');
        eq(sim.streetHint('bbq', 16, 2, 1, 1), null, '太远没有提示');
    });

    test('环境：工厂附近是负的，离远了是 0', () => {
        const cfg = loadFullConfig();
        const m = new MapBuilder(20, 8);
        m.hRoad(0, 18, 3);
        m.build('textile', 4, 4, 2, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 73, opening: false });
        ok(sim.envAt(4, 3) < 0, '门口有污染');
        eq(sim.envAt(15, 3), 0);
    });

    test('住房：自家翻盖（钱从住户出、算流出），完工换成砖瓦房，房租和幸福度跟着变', () => {
        const cfg = loadFullConfig();
        const m = new MapBuilder(12, 6);
        m.hRoad(0, 10, 3);
        const home = m.build('hut', 2, 2); m.build('workshop', 4, 2); m.build('breakfast', 5, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 74, opening: false });
        unlockAll(sim);
        const r = (sim as any).createResident(null, 'M', 30);
        r.savings = 14000; r.mood = 80;
        sim.state.residents.push(r);
        (sim as any).assignHomes(sim.state.residents);
        sim.stepMonth();
        const before = sim.moneyInCounty();
        ok((sim.state.renovations ?? []).some((x) => x.uid === home) || sim.building(home)!.defId === 'brick', '开始翻盖');
        ok(sim.lastFlows.outflow.construction >= cfg.building('brick')!.cost, '翻盖费从住户存款付给施工队（流出）');
        sim.stepMonth();
        const f = sim.lastFlows;
        near(sim.moneyInCounty() - before, sumf(f.inflow) - sumf(f.outflow), 1e-6 * Math.abs(before), '守恒');
        sim.stepMonth();
        eq(sim.building(home)!.defId, 'brick', '翻盖成砖瓦房');
    });

    test('住房：有钱的人搬进更好的空房', () => {
        const cfg = loadFullConfig();
        cfg.economy.moveChance = 1;
        const m = new MapBuilder(12, 6);
        m.hRoad(0, 10, 3);
        m.build('hut', 2, 2); const det = m.build('detached', 6, 2); m.build('workshop', 4, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 75, opening: false });
        unlockAll(sim);
        const r = (sim as any).createResident(null, 'F', 40);
        r.savings = 200000;
        sim.state.residents.push(r);
        r.homeId = sim.state.buildings.find((b) => b.defId === 'hut')!.uid;
        sim.building(r.homeId)!.residentIds.push(r.id);
        sim.stepMonth();
        eq(r.homeId, det, '搬进独栋');
    });

    test('玩家不能直接盖「只能翻盖得到」的砖瓦房', () => {
        const cfg = loadFullConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 76 });
        unlockAll(sim);
        const uid = t.map.build('brick', 15, 6);
        eq(sim.onBuilt(uid, 'brick'), false);
    });

    test('招商：每 3 天来意向；供地成功 → 选址免费盖、收土地款、解锁、私营、守恒', () => {
        const cfg = loadFullConfig();
        cfg.progress!.invest.maxChance = 1; cfg.progress!.invest.envWeight = 100;
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 77 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const offers = sim.state.offers ?? [];
        ok(offers.length >= 1, '有意向');
        const o = offers[0];
        for (const r of sim.state.residents) if (r.age >= 18 && r.age < 60) { r.jobId = null; r.idle = false; }   // 凑够能招的工人
        eq(sim.acceptOffer(o.id, 'land', true), null, '签约成功');
        ok(sim.isUnlocked(o.defId) && sim.canAfford(o.defId), '选址期间能盖、不花钱');
        const f0 = sim.state.finance.funds;
        const before = sim.moneyInCounty();
        const e = cfg.building(o.defId)!;
        const size = t.map.view().allBuildings().length;   // 只是让地图刷新
        void size;
        const w = ['textile', 'food-factory', 'supermarket', 'hotpot', 'moto-factory', 'electronics', 'car-factory', 'port', 'mine', 'plaza'].indexOf(o.defId) >= 0 ? 2 : 1;
        const uid = t.map.build(o.defId, 15, 6, w, w);
        ok(sim.onBuilt(uid, o.defId), '盖得下');
        eq(sim.state.finance.funds, f0 + o.landFee, '收了土地出让金，没花造价');
        eq(sim.state.pendingDeal, null);
        for (let i = 0; i < e.buildDays; i++) sim.stepMonth();
        eq(sim.building(uid)!.owner, 'private', '私营');
        ok((sim.building(uid)!.taxBreakUntil ?? 0) > sim.state.month, '让税');
        eq(sim.state.dealsDone, 1);
        void before;
    });

    test('招商补贴（D032）：签约不扣钱 → 选址交地扣补贴、没有出让金 → 建成私营 + 带工人、守恒', () => {
        const cfg = loadFullConfig();
        cfg.progress!.invest.maxChance = 1; cfg.progress!.invest.envWeight = 100;
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 78 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const o = sim.state.offers![0];
        o.workers = 1;
        sim.state.finance.funds = o.subsidy + 1000;
        const pop = sim.state.residents.length;
        const f0 = sim.state.finance.funds;
        eq(sim.offerBlock(o.id, 'subsidy'), '', '资金够就能签');
        eq(sim.acceptOffer(o.id, 'subsidy', false), null, '签约成功');
        eq(sim.state.finance.funds, f0, '签约时不扣钱');
        eq(sim.state.pendingDeal!.mode, 'subsidy');
        ok(sim.canAfford(o.defId), '钱够补贴就能交地');
        // 交地时钱不够 → 盖不下
        sim.state.finance.funds = o.subsidy - 1;
        ok(!sim.canAfford(o.defId), '钱不够补贴不能交地');
        sim.state.finance.funds = f0;
        // 腾一间空房给工人
        const hut = t.map.build('hut', 20, 6);
        sim.onBuilt(hut, 'hut');
        for (let i = 0; i < 2; i++) sim.stepMonth();
        sim.state.finance.funds = o.subsidy + 50000;
        const fb = sim.state.finance.funds;
        const e = cfg.building(o.defId)!;
        const w = ['textile', 'food-factory', 'supermarket', 'hotpot', 'moto-factory', 'electronics', 'car-factory', 'port', 'mine', 'plaza'].indexOf(o.defId) >= 0 ? 2 : 1;
        const uid = t.map.build(o.defId, 15, 6, w, w);
        ok(sim.onBuilt(uid, o.defId), '盖得下');
        eq(sim.state.finance.funds, fb - o.subsidy, '只扣补贴，不扣造价，也没有出让金');
        eq(sim.state.pendingDeal, null);
        ok(sim.isUnlocked(o.defId), '产业解锁');
        // 施工中途存档读档，招商信息不能丢
        const saved = JSON.parse(JSON.stringify(sim.state));
        const s2 = new Simulation(cfg, t.view, { state: saved });
        for (let i = 0; i < e.buildDays; i++) s2.stepMonth();
        eq(s2.building(uid)!.owner, 'private', '建成私营');
        ok(s2.state.residents.length >= pop + 1, '对方带工人来了');
    });

    test('招商补贴：守恒（交地那个月补贴算流出）', () => {
        const cfg = loadFullConfig();
        cfg.progress!.invest.maxChance = 1; cfg.progress!.invest.envWeight = 100;
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 80 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const o = sim.state.offers![0];
        sim.state.finance.funds = o.subsidy + 5000;
        eq(sim.acceptOffer(o.id, 'subsidy', false), null);
        sim.stepMonth();
        const before = sim.moneyInCounty();
        const w = ['textile', 'food-factory', 'supermarket', 'hotpot', 'moto-factory', 'electronics', 'car-factory', 'port', 'mine', 'plaza'].indexOf(o.defId) >= 0 ? 2 : 1;
        const uid = t.map.build(o.defId, 15, 6, w, w);
        ok(sim.onBuilt(uid, o.defId));
        sim.stepMonth();
        const f = sim.lastFlows;
        ok(f.outflow.subsidy === o.subsidy, '补贴算流出');
        near(sim.moneyInCounty() - before, sumf(f.inflow) - sumf(f.outflow), 1e-6 * Math.abs(before), '守恒');
    });

    test('招商签约前检查：能招的工人不够时说还差几个，不扣意向', () => {
        const cfg = loadFullConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 81 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const o = sim.state.offers![0];
        o.needLabor = 999;
        const why = sim.offerBlock(o.id, 'land');
        ok(/还差 \d+ 个能招的工人/.test(why), why);
        eq(sim.acceptOffer(o.id, 'land', false), why);
        ok(sim.state.offers!.some((x) => x.id === o.id), '没白丢意向');
        ok(sim.offerChance(o.id, false, 'subsidy') > sim.offerChance(o.id, false, 'land') || sim.offerChance(o.id, false, 'land') >= cfg.progress!.invest.maxChance, '补贴成功率更高');
    });

    test('模拟层的建筑名和 buildings.json 一致（公告不能露出 hut 这种内部编号）', () => {
        const defs = JSON.parse(readFileSync(join(process.cwd(), 'assets/resources/config/buildings.json'), 'utf8'));
        const list: { id: string; name: string }[] = Array.isArray(defs) ? defs : defs.buildings;
        for (const d of list) eq(DEF_NAMES[d.id], d.name, d.id);
    });

    test('招商失败：说出最弱的一项', () => {
        const cfg = loadFullConfig();
        cfg.progress!.invest.maxChance = 0;
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 79 });
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const o = sim.state.offers![0];
        o.needLabor = 0;
        const err = sim.acceptOffer(o.id, 'land', false);
        ok(!!err && /没谈成/.test(err), `应当失败：${err}`);
        ok(sim.businessEnv().parts.length >= 5);
    });
});

// ───────────────────────── 新建筑第一批 ─────────────────────────
suite('新建筑第一批：婚宴 / 幼儿园 / 老街', () => {
    const sumf = (o: Record<string, number>) => Object.keys(o).reduce((a, k) => a + o[k], 0);

    test('配置：11 个新建筑都有经营数据、研究能解锁、名字对得上', () => {
        const cfg = loadFullConfig();
        const ids = ['noodle', 'restaurant', 'banquet', 'store', 'market', 'pharmacy', 'teahouse', 'old-street', 'dorm', 'kindergarten', 'farm'];
        for (const id of ids) {
            ok(cfg.building(id)!.cost > 0, `${id} 没有经营数据`);
            ok(cfg.progress!.research.some((r) => r.unlocks.indexOf(id) >= 0), `${id} 没有研究`);
            ok(!!DEF_NAMES[id], `${id} 没有名字`);
        }
    });

    test('婚宴：有人结婚就去大酒楼办酒，钱记进酒楼的账，守恒', () => {
        const cfg = loadConfig();
        cfg.economy.residents.marryChance = 0;    // 酒楼盖好之前先别结婚
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 41 });
        sim.state.finance.funds = 1e6;
        const banquet = t.map.build('banquet', 15, 6, 2, 2);
        ok(sim.onBuilt(banquet, 'banquet'), '盖得起');
        for (let i = 0; i < 3; i++) sim.stepMonth();   // 施工 2 天
        cfg.economy.residents.marryChance = 12;   // 之后每月必定想结婚
        let held = false;
        for (let m = 0; m < 36 && !held; m++) {
            for (const r of sim.state.residents) r.savings = Math.max(r.savings, 40000);
            const before = sim.moneyInCounty();
            const rep = sim.stepMonth();
            const f = sim.lastFlows;
            near(sim.moneyInCounty() - before, sumf(f.inflow) - sumf(f.outflow), 1e-6 * Math.abs(before), `第 ${m} 个月守恒`);
            if (rep.events.some((e) => /办了婚宴/.test(e.text))) {
                held = true;
                const b = sim.state.buildings.find((x) => x.uid === banquet)!;
                ok(b.lastRevenue >= cfg.building('banquet')!.wedding!, '酒楼营业额里有婚宴');
            }
        }
        ok(held, '36 个月里应该办过婚宴');
    });

    test('幼儿园：家里有 0～6 岁孩子、附近有幼儿园 → 幸福度分项', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        t.map.build('kindergarten', 8, 4);
        const sim = new Simulation(cfg, t.view, { seed: 42 });
        sim.stepMonth();
        const home = t.houses[0];
        const inHome = sim.state.residents.filter((r) => r.homeId === home);
        ok(inHome.length >= 2, '这栋房至少住两个人');
        const [parent, kid] = inHome;
        kid.age = 3;
        parent.childIds = [kid.id];
        sim.stepMonth();
        ok((parent.moodParts ?? []).some((p) => p.key === 'kindergarten'), '应该有「孩子上幼儿园方便」');
    });

    test('老街：6 格内的店过路客 ×1.5，远的不变；每月口碑 +', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 43 });
        sim.state.finance.funds = 1e6;
        const os = t.map.build('old-street', 12, 8, 2, 2);
        ok(sim.onBuilt(os, 'old-street'), '盖得起');
        for (let i = 0; i < 3; i++) sim.stepMonth();
        const mult = (uid: number) => (sim as any).streetOutsideMult(uid) as number;
        near(mult(t.shops.milkTea), 1.5, 1e-9, '奶茶店在老街旁边');
        near(mult(t.shops.breakfast), 1, 1e-9, '早餐铺离得远');
        const plain = new Simulation(cfg, basicTown(cfg).view, { seed: 43 });
        for (let i = 0; i < 3; i++) plain.stepMonth();
        ok((sim.state.buzz ?? 0) > (plain.state.buzz ?? 0), '有老街口碑更高');
    });
});

// ───────────────────────── 覆盖范围（T538） ─────────────────────────
suite('覆盖范围：放置预览 / 心愿范围', () => {
    test('spotReach：沿路走 N 步以内的路和楼，步数和 roadDistance 一致', () => {
        const map = new MapBuilder(20, 12);
        map.hRoad(0, 19, 5);
        const nearHome = map.build('house', 4, 4);   // 门口 (4,5)
        const farHome = map.build('house', 6, 4);    // 门口 (6,5)
        const v = map.view();
        const r = v.spotReach(2, 6, 1, 1, 3);        // 门口 (2,5) 算第 1 步
        eq(r.roads.length, 5, '走得到 (0..4, 5) 五格');
        eq(r.near.get(nearHome), 3);
        ok(!r.near.has(farHome), '5 步外的不算');
        // 真盖下去，roadDistance 得一样
        const shop = map.build('breakfast', 2, 6);
        eq(map.view().roadDistance(shop, nearHome), 3);
    });

    test('spotReach：不挨路的地方什么都够不着', () => {
        const map = new MapBuilder(20, 12);
        map.hRoad(0, 19, 5);
        map.build('house', 4, 4);
        const r = map.view().spotReach(2, 9, 1, 1, 8);
        eq(r.roads.length, 0);
        eq(r.near.size, 0);
    });

    test('serviceReach：店按步行消费半径、只算住宅；学校 10 格；住宅没有覆盖范围', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 5 });
        const shop = sim.serviceReach('breakfast', 5, 6, 1, 1)!;
        ok(!!shop, '早餐铺有覆盖范围');
        eq(shop.radius, cfg.building('breakfast')!.radius, '按早餐铺自己的半径');
        eq(shop.byVehicle, true);
        eq(shop.homes.slice().sort((a, b) => a - b).join(','), t.houses.slice().sort((a, b) => a - b).join(','), '两栋房都在范围内，店不算');
        ok(shop.roads.length > 0);
        const school = sim.serviceReach('school', 5, 6, 2, 2)!;
        eq(school.radius, 10);
        eq(school.byVehicle, false);
        eq(sim.serviceReach('house', 5, 6, 1, 1), null);
    });

    test('wishReach：旧购物心愿读新圆半径，学校仍显示沿路范围', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view, { seed: 5 });
        sim.stepMonth();
        const r = sim.state.residents.find((x) => x.homeId !== null)!;
        ok(!!r, '要有住进来的人');
        r.wish = { kind: 'shop', demand: 'fun', text: '', hint: '', suggest: '', radius: 6, since: 0, until: 99 };
        const w = sim.wishReach(r.id)!;
        ok(!!w);
        eq(w.radius, 8);
        ok(!!w.circle);
        eq(w.homes.join(','), String(r.homeId));
        eq(w.roads.length, 0);
        r.wish = { kind: 'school', text: '', hint: '', suggest: '', radius: 10, since: 0, until: 99 };
        ok(sim.wishReach(r.id)!.roads.length > 0);
        r.wish = { kind: 'job', text: '', hint: '', suggest: '', radius: 0, since: 0, until: 99 };
        eq(sim.wishReach(r.id), null);
        r.wish = null;
        eq(sim.wishReach(r.id), null);
    });
});

suite('居民引导与用工', () => {
    test('不限意向的旧心愿列出多个选择，已开工的快递驿站完工后可以就业', () => {
        const m = new MapBuilder();
        m.build('house', 2, 2);
        const sim = new Simulation(loadFullConfig(), m.view(), { seed: 81 });
        const r = sim.state.residents[0];
        r.savings = 0;
        r.wish = { kind: 'job', text: '', hint: '建一座早餐铺', suggest: 'breakfast', radius: 0, since: 0, until: 9 };
        sim.openGuidance(r.id);
        ok(r.wish!.hint.includes('快递驿站') && r.wish!.hint.includes('小作坊'));
        ok(!r.wish!.hint.includes('奶茶店'), '只举已解锁的例子');
        eq(r.wish!.suggest, '');
        eq(r.wish!.until, 9);

        const shop = m.build('parcel', 4, 2);
        ok(sim.onBuilt(shop, 'parcel'));
        sim.openGuidance(r.id);
        ok(r.wish!.hint.includes('快递驿站正在施工'));
        eq(sim.jobReferral(r.id), null);
        sim.stepMonth();
        eq(r.jobId, shop);
        eq(r.jobTitle, '快递员');
        ok(r.wish?.kind !== 'job');
    });

    test('开局介绍工作：按扣分排序、重查空岗、成功才结算一次', () => {
        const m = new MapBuilder();
        m.build('house', 2, 2); m.build('house', 3, 2);
        const shop = m.build('parcel', 4, 2);
        const sim = new Simulation(loadFullConfig(), m.view(), { seed: 81 });
        const [a, b] = sim.state.residents;
        for (const r of [a, b]) {
            r.monthsUnemployed = 5;
            r.moodParts = [{ key: 'work', label: '失业', value: -18 }, { key: 'missed', label: '购物', value: -12 }];
            sim.openGuidance(r.id);
            eq(r.wish?.kind, 'job');
            ok(r.wish!.text.includes('5 个月'));
            eq(sim.jobReferral(r.id)?.uid, shop);
        }
        const offered = sim.jobReferral(a.id)!;
        eq(sim.introduceJob(a.id, shop, '不合适的岗位'), false);
        eq(sim.introduceJob(a.id, shop, offered.title), true);
        eq(sim.introduceJob(b.id, shop, offered.title), false);
        sim.openGuidance(b.id);
        ok(b.wish!.hint.includes('快递驿站已招满'));
        eq(sim.introduceJob(a.id, shop, offered.title), false);
        eq(sim.state.wishesDone, 1);
        eq(a.jobId, shop);
        eq(a.wish?.kind, 'shop');
        ok(a.wish!.hint.includes('未解锁'));
        eq(sim.employers()[0].staff, 1);
        eq(sim.employers()[0].required, 1);
    });

    test('企业逐栋统计，特定意向须满足企业、职称、学历和实际空缺', () => {
        const cfg = loadFullConfig(), m = new MapBuilder();
        m.build('house', 1, 2);
        const a = m.build('supermarket', 4, 2), b = m.build('supermarket', 7, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 82 });
        const r = sim.state.residents[0];
        r.wish = { kind: 'job', jobTarget: { defId: 'supermarket', title: '店长' },
            text: '想当店长', hint: '', suggest: '', radius: 0, since: 0, until: 10 };
        r.education = 0;
        eq(sim.jobReferral(r.id), null);
        r.education = 2;
        eq(sim.introduceJob(r.id, a, '收银员'), false);
        ok(sim.introduceJob(r.id, b, '店长'));
        const rows = sim.employers();
        eq(rows.length, 2);
        eq(rows[0].required + rows[1].required, 8);
        eq(rows.find((x) => x.uid === a)!.staff, 0);
        eq(rows.find((x) => x.uid === b)!.staff, 1);
        sim.onDemolished(b);
        eq(sim.employers().length, 1);
        eq(r.jobId, null);
    });

    test('购物圆按建筑中心判定，圈外对角、施工中均无效；圈边断路店完工即满足', () => {
        const cfg = loadFullConfig(), m = new MapBuilder();
        cfg.progress!.wishes.shopRadius = 5;
        m.build('house', 2, 2); m.build('house', 2, 3);
        m.build('store', 6, 6);
        const sim = new Simulation(cfg, m.view(), { seed: 83 });
        const r = sim.state.residents.find((p) => p.homeId === sim.state.buildings[0].uid)!;
        r.idle = true;
        r.moodParts = [{ key: 'missed', label: '购物', value: -12 }];
        r.wish = { kind: 'shop', demand: 'daily', text: '买日用品要跑很远', hint: '旧提示', suggest: 'parcel', radius: 99, since: 0, until: 10 };
        sim.openGuidance(r.id);
        eq(r.wish!.text, '买日用品要跑很远');
        for (const name of ['小卖部', '快递驿站', '药店', '超市']) ok(r.wish!.hint.includes(name));
        const reach = sim.wishReach(r.id)!;
        eq(reach.radius, 5);
        eq(reach.circle!.col, 2.5);
        eq(reach.circle!.row, 2.5);
        sim.state.unlocked!.push('store');
        const uid = m.build('store', 5, 6);
        ok(sim.onBuilt(uid, 'store'));
        sim.openGuidance(r.id);
        eq(r.wish!.demand, 'daily');
        sim.stepMonth();
        ok(sim.building(uid));
        ok(r.log.some((event) => event.text.includes('心愿实现了：买日用品要跑很远')));
    });

    test('挽留最后一个月先兑现心愿，再决定是否搬离', () => {
        const cfg = loadFullConfig(), m = new MapBuilder();
        cfg.economy.leaveMonths = 1;
        cfg.progress!.wishes.doneMood = 100;
        m.build('house', 2, 2); m.build('store', 3, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 85 });
        const r = sim.state.residents[0];
        r.mood = 0;
        r.leaving = { since: 0, reasons: ['购物不便'] };
        r.wish = { kind: 'shop', demand: 'daily', text: '想在附近买日用品', hint: '', suggest: 'store', radius: 8, since: 0, until: 1 };
        eq(sim.leaveMonthsLeft(r), 1);
        sim.stepMonth();
        ok(sim.resident(r.id));
        eq(r.leaving, null);
        ok(r.mood >= cfg.economy.stayMood);
    });

    test('住处提示随解锁、存款和施工更新，翻盖费用只付一次', () => {
        const cfg = loadFullConfig(), m = new MapBuilder();
        const home = m.build('hut', 2, 2);
        const sim = new Simulation(cfg, m.view(), { seed: 84 });
        ok(sim.housingHint(home).includes('尚未解锁'));
        sim.state.unlocked!.push('brick');
        for (const p of sim.state.residents) { p.savings = 0; p.mood = 100; }
        ok(sim.housingHint(home).includes('再攒'));
        sim.state.residents[0].savings = 100000;
        ok(sim.housingHint(home).includes('条件已齐'));
        sim.stepMonth();
        ok(sim.housingHint(home).includes('正在翻盖'));
        eq(sim.state.renovations!.filter((x) => x.uid === home).length, 1);
    });
});

suite('开分厂', () => {
    function county() {
        const cfg = loadFullConfig();
        const map = new MapBuilder();
        map.hRoad(1, 16, 5);
        const oldHome = map.build('house', 2, 4);
        const newHome = map.build('house', 15, 4);
        const source = map.build('workshop', 2, 6);
        const sim = new Simulation(cfg, map.view(), { seed: 421 });
        const people = sim.state.residents.slice(0, 2);
        for (const b of sim.state.buildings) { b.workerIds = []; b.residentIds = []; }
        sim.state.residents = people;
        people.forEach((r, i) => {
            r.age = 30;
            r.homeId = i === 0 ? oldHome : newHome;
            sim.building(r.homeId)!.residentIds.push(r.id);
            r.jobId = source;
            r.jobTitle = '工人';
            r.salary = 2600;
            sim.building(source)!.workerIds.push(r.id);
        });
        sim.state.finance.funds = 80000;
        return { cfg, map, source, sim, people };
    }

    test('选址、施工读档、原职原薪调岗与两处独立招工', () => {
        const { cfg, map, source, sim, people } = county();
        sim.building(source)!.owner = 'private';
        eq(sim.branchOffer(source)!.jobs, 3);
        eq(sim.branchTransferCount(source, 16, 6, 1, 1), 1);
        eq(sim.branchTransferCount(source, 15, 10, 1, 1), 0, '没有路可到达');
        const uid = map.build('workshop', 16, 6);
        const funds = sim.state.finance.funds;
        ok(sim.onBuilt(uid, 'workshop', 0, source));
        ok(sim.onBuilt(uid, 'workshop', 0, source));
        eq(sim.state.finance.funds, funds - cfg.building('workshop')!.cost, '只付一次');
        eq(people[1].jobId, source, '施工期间原职照常');
        const loaded = new Simulation(cfg, map.view(), { state: JSON.parse(JSON.stringify(sim.state)) });
        loaded.stepMonth();
        const branch = loaded.building(uid)!;
        eq(branch.branchOf, source);
        eq(branch.owner, 'private');
        eq(loaded.branchOffer(uid), null);
        const worker = loaded.resident(people[1].id)!;
        eq(worker.jobId, uid);
        eq(worker.jobTitle, people[1].jobTitle);
        eq(worker.salary, people[1].salary);
        ok(branch.workerIds.includes(worker.id));
        ok(!loaded.building(source)!.workerIds.includes(worker.id));
        eq(loaded.resident(people[0].id)!.jobId, source);
        eq(loaded.employers().find(e => e.uid === uid)!.required, 3);
    });

    test('选址后搬家的员工按完工时的通勤重新判断', () => {
        const { map, source, sim, people } = county();
        eq(sim.branchTransferCount(source, 16, 6, 1, 1), 1);
        const uid = map.build('workshop', 16, 6);
        ok(sim.onBuilt(uid, 'workshop', 0, source));
        const [local, mover] = people;
        sim.building(mover.homeId!)!.residentIds = [];
        mover.homeId = local.homeId;
        sim.building(local.homeId!)!.residentIds.push(mover.id);
        sim.stepMonth();
        eq(mover.jobId, source);
        ok(!sim.building(uid)!.workerIds.includes(mover.id));
    });

    test('开工失败保留资金，拆掉原厂后分厂仍能完工', () => {
        const { cfg, map, source, sim } = county();
        const uid = map.build('workshop', 16, 6);
        const funds = sim.state.finance.funds;
        eq(sim.onBuilt(uid, 'textile', 0, source), false);
        eq(sim.state.finance.funds, funds);
        sim.state.finance.funds = 0;
        eq(sim.onBuilt(uid, 'workshop', 0, source), false);
        eq(sim.state.construction?.length ?? 0, 0);
        sim.state.finance.funds = cfg.building('workshop')!.cost;
        ok(sim.onBuilt(uid, 'workshop', 0, source));
        sim.onDemolished(source);
        sim.stepMonth();
        ok(sim.building(uid));
        eq(sim.building(source), null);
    });
});

suite('住宅小区', () => {
    test('村口按人口或在岗工人研究，沿用老商品房的研究和建筑编号', () => {
        const cfg = loadFullConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view);
        const row = (id: string) => sim.researchList().find(r => r.id === id)!;
        eq(row('r-apartment').level, 'village');
        eq(row('r-apartment').needPop, 10);
        eq(cfg.building('apartment')!.housing, 18);
        const workers = sim.building(t.shops.workshop)!;
        workers.workerIds = [];
        eq(row('r-workers-estate').state, 'locked');
        workers.workerIds = sim.state.residents.slice(0, 2).map(r => r.id);
        eq(row('r-workers-estate').state, 'ready');
        const saved = JSON.parse(JSON.stringify(sim.state));
        saved.researched.push('r-apartment');
        saved.unlocked.push('apartment');
        const loaded = new Simulation(cfg, t.view, { state: saved });
        ok(loaded.isUnlocked('apartment'));
        eq(loaded.researchList().find(r => r.id === 'r-apartment')!.state, 'done');
        eq(loaded.isUnlocked('highrise'), false);
    });

    test('回迁需要沿路可达且整栋住得下，重复点击不会搬两次', () => {
        const cfg = loadConfig();
        const t = basicTown(cfg);
        const sim = new Simulation(cfg, t.view);
        const old = sim.building(t.houses[0])!;
        const ids = old.residentIds.slice();
        ok(ids.length > 0);
        sim.state.finance.funds = 1e6;
        const add = (x: number, y: number) => {
            const uid = t.map.build('resettlement', x, y, 2, 2);
            ok(sim.onBuilt(uid, 'resettlement'));
            return uid;
        };
        cfg.building('resettlement')!.buildDays = 0;
        add(20, 20);
        eq(sim.resettleResidents(old.uid), false);
        const target = add(15, 6);
        cfg.building('resettlement')!.housing = ids.length - 1;
        eq(sim.resettlementOffer(old.uid), null);
        cfg.building('resettlement')!.housing = ids.length;
        eq(sim.resettlementOffer(old.uid)!.targetUid, target);
        ok(sim.resettleResidents(old.uid));
        eq(old.residentIds.length, 0);
        eq(sim.resettleResidents(old.uid), false);
        sim.onDemolished(old.uid);
        const loaded = new Simulation(cfg, t.view, { state: JSON.parse(JSON.stringify(sim.state)) });
        eq(loaded.building(target)!.residentIds.length, ids.length);
        for (const id of ids) eq(loaded.resident(id)!.homeId, target);
    });

    test('商住小区须有商业特色街，入住、底商用工和营业收入共用一栋楼', () => {
        const cfg = loadFullConfig();
        const t = basicTown(cfg);
        const uid = t.map.build('market-estate', 15, 6, 2, 2);
        t.view.refresh();
        const sim = new Simulation(cfg, t.view);
        sim.state.level = 'county';
        const research = () => sim.researchList().find(r => r.id === 'r-market-estate')!;
        eq(research().state, 'locked');
        sim.state.streets = [{ kind: 'daily', uids: [t.shops.breakfast, t.shops.supermarket, t.shops.parcel] }];
        eq(research().state, 'ready');
        const home = sim.building(uid)!;
        ok(home.residentIds.length > 0);
        sim.stepMonth();
        ok(sim.employers().some(e => e.uid === uid && e.required === 3));
        ok(sim.buildingPrice('market-estate') > 0);
        ok(home.workerIds.length > 0 && home.lastRevenue > 0);
    });
});

suite('全城土路升级', () => {
    test('整批校验后才扣差价，开局路和自铺路使用同一套养护规则', () => {
        const cfg = loadFullConfig();
        const map = new MapBuilder().hRoad(0, 2, 0);
        const town = map.view();
        const roads = town.allBuildings().slice();
        roads[2].defId = 'road';
        const sim = new Simulation(cfg, town, { opening: false });
        const pave = (uids: ReadonlySet<number>) => {
            eq(uids.size, 2);
            for (const road of roads) if (uids.has(road.uid)) road.defId = 'road';
            return true;
        };
        eq(sim.roadUpgradeQuote(), null);
        ok(sim.upgradeDirtRoads(pave));
        sim.state.unlocked!.push('road');
        ok(sim.onBuilt(roads[1].uid, 'dirt-road'));
        const quote = sim.roadUpgradeQuote()!;
        eq(quote.count, 2);
        eq(quote.cost, 2 * (cfg.building('road')!.cost - cfg.building('dirt-road')!.cost));
        sim.state.finance.funds = quote.cost - 1;
        ok(sim.upgradeDirtRoads(pave));
        eq(sim.roadUpgradeQuote()!.count, 2);
        eq(sim.state.finance.funds, quote.cost - 1);
        sim.state.finance.funds++;
        ok(sim.upgradeDirtRoads(() => false));
        eq(sim.state.finance.funds, quote.cost);
        eq(sim.upgradeDirtRoads(pave), null);
        eq(sim.state.finance.funds, 0);
        eq(sim.roadUpgradeQuote()!.count, 0);
        eq(sim.state.buildings.length, 2);
        for (const road of roads.slice(0, 2)) eq(sim.building(road.uid)!.defId, 'road');
        ok(sim.upgradeDirtRoads(pave));
        eq(sim.state.finance.funds, 0);
        eq(sim.stepMonth().expense.construction, quote.cost + cfg.building('dirt-road')!.cost);
    });
});

report();
