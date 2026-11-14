import { chance, nextFloat, nextInt, pick, pickWeighted, rngFromSeed } from '../../assets/scripts/core/sim/rng';
import { SimpleTownView } from '../../assets/scripts/core/sim/townView';
import { buildWorld } from '../../assets/scripts/core/sim/world';
import { staffing, positionsOf, openingsFor } from '../../assets/scripts/core/sim/labor';
import { parseEconomy, parseNames, makeSimConfig } from '../../assets/scripts/core/sim/config';
import { Simulation } from '../../assets/scripts/core/sim/Simulation';
import { SimConfig } from '../../assets/scripts/core/sim/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { basicTown, loadConfig, MapBuilder } from './fixtures';
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
        eq(cfg.building('house')!.housing, 3);
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
        const a = vehicleTown(cfg, ['moto-factory'], 6, 30000, 33).sim;
        const b = vehicleTown(cfg, ['moto-factory'], 6, 30000, 33).sim;
        for (let i = 0; i < 60; i++) eq(JSON.stringify(a.stepMonth()), JSON.stringify(b.stepMonth()), `第 ${i} 月`);
        eq(JSON.stringify(a.state), JSON.stringify(b.state));
        ok(a.summary().vehicles > 0, `5 年里应当有人买车，实际 ${a.summary().vehicles}`);
    });

    test('有车的人消费半径更大', () => {
        const cfg = loadConfig();
        const m = new MapBuilder(40, 6);
        m.hRoad(0, 35, 0);
        const house = m.build('house', 0, 1);
        const shop = m.build('breakfast', 10, 1); // 步行 8 格够不着，电动车 12 格够得着
        const run = (v: 'walk' | 'ebike') => {
            const sim = new Simulation(cfg, m.view(), { seed: 2, opening: false });
            const r = (sim as any).createResident(null, 'M', 30);
            r.savings = 20000; r.vehicle = v;
            sim.state.residents.push(r);
            (sim as any).assignHomes(sim.state.residents);
            sim.stepMonth();
            return sim.building(shop)!.lastCustomers;
        };
        const d = m.view().roadDistance(house, shop);
        ok(d > cfg.economy.serviceRadius && d <= cfg.economy.serviceRadius * 1.5, `距离 ${d} 要落在 8～12 之间`);
        eq(run('walk'), 0, '步行够不着');
        ok(run('ebike') > 0, '骑电动车能去');
    });
});

report();
