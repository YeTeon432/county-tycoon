import { Simulation } from '../../assets/scripts/core/sim/Simulation';
import { PlacedInfo, SimpleTownView } from '../../assets/scripts/core/sim/townView';
import { Demand } from '../../assets/scripts/core/sim/types';
import { loadConfig, loadFullConfig } from './fixtures';

/**
 * T312 快进测试：在 node 下跑 50 年，看人口 / 财政 / 就业 / 心情曲线崩不崩。
 *
 * 为了让县城真的长得起来，这里放了一个"自动县长"：照着简单的规矩盖楼——
 * 没房就盖房、缺哪类店就盖哪类店、有岗位缺口就盖工厂、有钱就修路。
 * 它不是玩家，只是个压力源，用来看数值有没有发散的苗头。
 */

const SIZE = 60;

interface Cell { uid: number; defId: string; col: number; row: number; width: number; height: number; road: boolean }

class FlatMap {
    readonly cells: (Cell | null)[][] = [];
    private _next = 1;
    constructor(readonly n: number) {
        for (let y = 0; y < n; y++) this.cells.push(new Array(n).fill(null));
    }
    free(col: number, row: number, w: number, h: number): boolean {
        if (col < 0 || row < 0 || col + w > this.n || row + h > this.n) return false;
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (this.cells[r][c]) return false;
        return true;
    }
    put(defId: string, col: number, row: number, w = 1, h = 1, road = false): number | null {
        if (!this.free(col, row, w, h)) return null;
        const cell: Cell = { uid: this._next++, defId, col, row, width: w, height: h, road };
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) this.cells[r][c] = cell;
        return cell.uid;
    }
    /** 盖楼失败时把占位撤掉（只撤一格，够用了——失败的都是单格或刚放的） */
    clear(col: number, row: number): void {
        const cell = this.cells[row]?.[col];
        if (!cell) return;
        const cellRow: number = cell.row;
        const cellCol: number = cell.col;
        const cellH: number = cell.height;
        const cellW: number = cell.width;
        for (let r = cellRow; r < cellRow + cellH; r++) {
            for (let col = cellCol; col < cellCol + cellW; col++) {
                if (this.cells[r]?.[col] === cell) this.cells[r][col] = null;
            }
        }
    }

    list(): PlacedInfo[] {
        const seen = new Set<number>();
        const out: PlacedInfo[] = [];
        for (const row of this.cells) for (const c of row) {
            if (c && !seen.has(c.uid)) { seen.add(c.uid); out.push({ ...c }); }
        }
        return out;
    }
    /** 离 (col, row) 最近的挨着道路的空地（像玩家一样「盖在他家附近」） */
    freeNear(col0: number, row0: number, w: number, h: number): { col: number; row: number } | null {
        let best: { col: number; row: number } | null = null, bd = Infinity;
        for (let row = Math.max(0, row0 - 8); row < Math.min(this.n - h, row0 + 9); row++) {
            for (let col = Math.max(0, col0 - 8); col < Math.min(this.n - w, col0 + 9); col++) {
                const d = Math.abs(col - col0) + Math.abs(row - row0);
                if (d >= bd || !this.free(col, row, w, h)) continue;
                const around = [this.cells[row - 1]?.[col], this.cells[row + h]?.[col], this.cells[row]?.[col - 1], this.cells[row]?.[col + w]];
                if (around.some((c) => c && c.road)) { best = { col, row }; bd = d; }
            }
        }
        return best;
    }
    /** 挨着道路的空地 */
    freeNextToRoad(w: number, h: number): { col: number; row: number } | null {
        for (let row = 0; row < this.n - h; row++) {
            for (let col = 0; col < this.n - w; col++) {
                if (!this.free(col, row, w, h)) continue;
                const around = [
                    this.cells[row - 1]?.[col], this.cells[row + h]?.[col],
                    this.cells[row]?.[col - 1], this.cells[row]?.[col + w],
                ];
                if (around.some((c) => c && c.road)) return { col, row };
            }
        }
        return null;
    }
}

export interface YearRow {
    year: number;
    pop: number;
    funds: number;
    employed: number;
    workingAge: number;
    avgMood: number;
    avgSavings: number;
    buildings: number;
    level: string;
    income: number;
    expense: number;
    /** 有车人数 / 各档人数（D022） */
    vehicles: number;
    ebike: number;
    moto: number;
    car: number;
    /** 18～65 岁有工作的人（买车资格的分母） */
    eligible: number;
    /** 收支明细（T532 调数值时用，只有 opts.probe 时才有） */
    parts?: Record<string, number>;
}

export interface LongRunOpts {
    /** 从第几个月起，钱够就盖一座摩托车厂（只盖一座）。不传 = 不盖 */
    motoFromMonth?: number;
    /** 升到县城后，钱够就盖一座汽车厂 */
    carWhenCounty?: boolean;
    /** 从第几个月起盖汽车厂，不看城镇等级（自动县长不盖学校，升不到县城，快进时用这个看汽车） */
    carFromMonth?: number;
    /** 用老配置（没有研究 / 阶段目标）*/
    legacy?: boolean;
    /** 每年多记一份收支明细（T532 调数值用） */
    probe?: boolean;
}

export function runLongTest(years = 50, opts: LongRunOpts = {}): YearRow[] {
    // D026：带研究 / 目标的完整配置；opts.legacy 时用老配置（全部解锁、自动升级）
    const cfg = opts.legacy ? loadConfig() : loadFullConfig();
    const map = new FlatMap(SIZE);

    // 开局：一张连通的方格路网（每 5 格一条街）+ 两栋自建房 + 一家早餐铺
    const SPAN = 40;
    for (let i = 3; i < SPAN; i += 5) {
        for (let x = 2; x < SPAN; x++) map.put('dirt-road', x, i, 1, 1, true);
        for (let y = 2; y < SPAN; y++) map.put('dirt-road', i, y, 1, 1, true);
    }
    map.put('house', 5, 2);
    map.put('house', 7, 2);
    map.put('breakfast', 5, 4);

    const town = new SimpleTownView(SIZE, SIZE, () => map.list());
    const sim = new Simulation(cfg, town, { seed: 20260101, opening: true });

    const freeSpotCount = () => {
        let n = 0;
        for (let row = 1; row < SIZE - 1; row++) for (let col = 1; col < SIZE - 1; col++) {
            if (map.free(col, row, 1, 1)) {
                const around = [map.cells[row - 1]?.[col], map.cells[row + 1]?.[col], map.cells[row]?.[col - 1], map.cells[row]?.[col + 1]];
                if (around.some((c) => c && c.road)) n++;
            }
        }
        return n;
    };

    const rows: YearRow[] = [];
    const demandCycle: Demand[] = ['food', 'daily', 'fun', 'other'];

    for (let month = 1; month <= years * 12; month++) {
        // ── 自动县长：每月开工 ──
        const s = sim.state;
        const sum = sim.summary();
        const can = (id: string) => !sim.isUnlocked || sim.isUnlocked(id);

        // 0. D026：目标全完成就申请升级；没在研究就挑最便宜的能研究的（留够 2 万周转）
        if (sim.upgradeLevel) sim.upgradeLevel();
        if (sim.researchList && sim.startResearch && !s.research) {
            const ready = sim.researchList().filter((r) => r.state === 'ready' && r.cost + 20000 <= s.finance.funds)
                .sort((a, b) => a.cost - b.cost);
            if (ready.length) sim.startResearch(ready[0].id);
        }

        // 0.5 D026：照着居民心愿盖（一个月最多照顾一个心愿），盖在他家附近
        for (const r of s.residents) {
            const w = r.wish;
            if (!w || !w.suggest || r.homeId === null || !can(w.suggest) || !sim.canAfford(w.suggest)) continue;
            const home = map.list().find((b) => b.uid === r.homeId);
            if (!home) continue;
            const big = ['plaza', 'school', 'supermarket', 'hotpot', 'textile', 'food-factory', 'moto-factory'].indexOf(w.suggest) >= 0 ? 2 : 1;
            const spot = map.freeNear(home.col, home.row, big, big);
            if (!spot) continue;
            const uid = map.put(w.suggest, spot.col, spot.row, big, big);
            if (uid === null) continue;
            town.refresh();
            if (!sim.onBuilt(uid, w.suggest)) map.clear(spot.col, spot.row);
            break;
        }

        // 1. 住房不够就盖房（人口接近住房上限时）
        let housing = 0;
        let occupied = 0;
        for (const b of s.buildings) {
            const e = cfg.building(b.defId);
            if (!e || e.housing <= 0) continue;
            housing += e.housing;
            occupied += b.residentIds.length;
        }
        if (housing - occupied < 3) {
            const big = sum.population > 30 && can('apartment');
            const defId = big ? 'apartment' : can('hut') && !opts.legacy ? 'hut' : 'house';
            const econ = cfg.building(defId)!;
            if (sim.canAfford(defId)) {
                const spot = map.freeNextToRoad(econ === null ? 1 : (big ? 2 : 1), big ? 2 : 1);
                if (spot) {
                    const uid = map.put(defId, spot.col, spot.row, big ? 2 : 1, big ? 2 : 1);
                    if (uid !== null) {
                        town.refresh();
                        if (!sim.onBuilt(uid, defId)) map.clear(spot.col, spot.row);
                    }
                }
            }
        }

        // 2. 缺哪类店就盖哪类（每类店在县城里最多按人口比例配）
        const shopCount = new Map<Demand, number>();
        for (const b of s.buildings) {
            const e = cfg.building(b.defId);
            if (!e || e.demand === null) continue;
            shopCount.set(e.demand, (shopCount.get(e.demand) ?? 0) + 1);
        }
        for (const d of demandCycle) {
            const want = Math.max(1, Math.floor(sum.population / 18));
            if ((shopCount.get(d) ?? 0) >= want) continue;
            const candidates: Record<Demand, string[]> = {
                food: ['breakfast', 'bbq', 'hotpot'],
                daily: ['parcel', 'supermarket'],
                fun: ['milk-tea', 'net-cafe', 'plaza'],
                other: ['barber', 'phone-shop', 'tutoring'],
            };
            const list = candidates[d].filter(can);
            if (!list.length) continue;
            const pickId = list[(shopCount.get(d) ?? 0) % list.length];
            const econ = cfg.building(pickId)!;
            if (!sim.canAfford(pickId)) continue;
            const w = pickId === 'hotpot' || pickId === 'supermarket' || pickId === 'plaza' ? 2 : 1;
            const spot = map.freeNextToRoad(w, w);
            if (!spot) continue;
            const uid = map.put(pickId, spot.col, spot.row, w, w);
            if (uid === null) continue;
            town.refresh();
            if (!sim.onBuilt(uid, pickId)) map.clear(spot.col, spot.row);
            break; // 一个月只盖一栋，节奏像玩家
        }

        // 3. 岗位跟不上人口、或者有空房却招不到人就盖工厂
        //    （迁入条件 = 有岗 + 有房，光盖房不盖厂，县城会卡死在原地）
        let positions = 0;
        let unmet = 0;
        for (const b of s.buildings) {
            const e = cfg.building(b.defId);
            if (!e) continue;
            for (const slot of e.jobs) {
                positions += slot.count;
                unmet += Math.max(0, slot.count - b.workerIds.length);
            }
        }
        const jobStarved = unmet === 0 && freeSpotCount() > 0 && housing - occupied > 0;
        if (positions < sum.population * 0.8 || jobStarved) {
            const defId = sum.population > 60 && can('textile') ? 'textile' : 'workshop';
            const econ = cfg.building(defId)!;
            if (sim.canAfford(defId)) {
                const w = defId === 'workshop' ? 1 : 2;
                const spot = map.freeNextToRoad(w, w);
                if (spot) {
                    const uid = map.put(defId, spot.col, spot.row, w, w);
                    if (uid !== null) {
                        town.refresh();
                        if (!sim.onBuilt(uid, defId)) map.clear(spot.col, spot.row);
                    }
                }
            }
        }

        // 4. 车厂（D022 快进用）
        const tryBuild = (defId: string) => {
            if (s.buildings.some((b) => b.defId === defId) || !sim.canAfford(defId) || !can(defId)) return;
            const spot = map.freeNextToRoad(2, 2);
            if (!spot) return;
            const uid = map.put(defId, spot.col, spot.row, 2, 2);
            if (uid === null) return;
            town.refresh();
            if (!sim.onBuilt(uid, defId)) map.clear(spot.col, spot.row);
        };
        if (opts.motoFromMonth !== undefined && month >= opts.motoFromMonth) tryBuild('moto-factory');
        if (opts.carFromMonth !== undefined && month >= opts.carFromMonth) tryBuild('car-factory');
        if (opts.carWhenCounty && (s.level === 'county' || s.level === 'city' || s.level === 'top100')) tryBuild('car-factory');

        sim.stepMonth();

        if (month % 12 === 0) {
            const rep = sim.state.finance.lastMonth!;
            const s2 = sim.summary();
            const sumOf = (o: Record<string, number>) => {
                let total = 0;
                for (const k in o) total += o[k];
                return total;
            };
            const income = sumOf(rep.income as any);
            const expense = sumOf(rep.expense as any);
            rows.push({
                year: month / 12,
                pop: s2.population,
                funds: Math.round(sim.state.finance.funds),
                employed: s2.employed,
                workingAge: s2.workingAge,
                avgMood: s2.avgMood,
                avgSavings: s2.avgSavings,
                buildings: sim.state.buildings.length,
                level: sim.state.level,
                income: Math.round(income),
                expense: Math.round(expense),
                vehicles: s2.vehicles,
                ebike: sim.state.residents.filter((r) => r.vehicle === 'ebike').length,
                moto: sim.state.residents.filter((r) => r.vehicle === 'moto').length,
                car: sim.state.residents.filter((r) => r.vehicle === 'car').length,
                eligible: sim.state.residents.filter((r) => r.age >= cfg.economy.vehicles.minAge
                    && r.age <= cfg.economy.vehicles.maxAge && r.jobId !== null).length,
                parts: opts.probe ? { ...rep.income, ...rep.expense } : undefined,
            });
        }
    }
    return rows;
}

/** D022 快进：第 N 年盖摩托车厂、县城后盖汽车厂，看有车率怎么涨 */
export function vehiclesMain(): void {
    const years = 30;
    const pad = (s: unknown, n: number) => {
        const str = String(s);
        return str.length >= n ? str : new Array(n - str.length + 1).join(' ') + str;
    };
    for (const from of [12, 60]) {
        const rows = runLongTest(years, { motoFromMonth: from, carFromMonth: 120 });
        console.log(`\n第 ${from / 12} 年起盖摩托车厂、第 10 年起盖汽车厂（${years} 年）`);
        console.log('年  人口  等级     有车/人口  有车/在职  电动  摩托  汽车  平均储蓄  平均心情  建设资金');
        for (const r of rows) {
            const rate = r.pop ? Math.round(r.vehicles / r.pop * 100) : 0;
            const rateW = r.eligible ? Math.round(Math.min(r.vehicles, r.eligible) / r.eligible * 100) : 0;
            console.log(`${pad(r.year, 3)} ${pad(r.pop, 5)}  ${(r.level + "       ").slice(0, 7)}  ` +
                `${pad(rate + '%', 9)} ${pad(rateW + '%', 10)} ${pad(r.ebike, 5)} ${pad(r.moto, 5)} ${pad(r.car, 5)} ` +
                `${pad(r.avgSavings, 9)} ${pad(r.avgMood, 9)} ${pad(r.funds, 9)}`);
        }
    }
}

export function main(): void {
    const rows = runLongTest(50);
    const pad = (s: unknown, n: number) => {
        const str = String(s);
        return str.length >= n ? str : new Array(n - str.length + 1).join(' ') + str;
    };
    console.log('年  人口  就业/劳力  平均心情  平均储蓄  建设资金  月收  月支  建筑  等级');
    for (const r of rows) {
        console.log(
            `${pad(r.year, 3)} ${pad(r.pop, 5)} ${pad(`${r.employed}/${r.workingAge}`, 10)} ` +
            `${pad(r.avgMood, 9)} ${pad(r.avgSavings, 9)} ${pad(r.funds, 9)} ${pad(r.income, 6)} ${pad(r.expense, 6)} ${pad(r.buildings, 5)} ${r.level}`,
        );
    }

    // ── 断言：曲线不能崩 ──
    const last = rows[rows.length - 1];
    const peak = Math.max(...rows.map((r) => r.pop));
    const problems: string[] = [];
    if (last.pop === 0) problems.push('50 年后人口归零');
    if (last.pop < 10) problems.push(`50 年后只有 ${last.pop} 人，县城没长起来`);
    if (peak > 3000) problems.push(`人口爆炸到 ${peak}`);
    if (last.avgMood < 25) problems.push(`平均心情长期低迷 ${last.avgMood}`);
    if (!rows.every((r) => isFinite(r.funds))) problems.push('财政出现 NaN / Infinity');
    if (rows.slice(10).every((r) => r.funds <= 0)) problems.push('财政 10 年后一直为负');
    if (last.avgSavings < 0) problems.push('平均储蓄为负');

    console.log('');
    if (problems.length) {
        console.log('✗ 曲线有问题：');
        for (const p of problems) console.log(`  - ${p}`);
        process.exitCode = 1;
    } else {
        console.log(`✓ 50 年曲线正常：人口峰值 ${peak}，末年 ${last.pop} 人，心情 ${last.avgMood}，财政 ${last.funds}`);
    }
}
