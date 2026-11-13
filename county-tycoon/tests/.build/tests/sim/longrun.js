"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLongTest = runLongTest;
exports.main = main;
const Simulation_1 = require("../../assets/scripts/core/sim/Simulation");
const townView_1 = require("../../assets/scripts/core/sim/townView");
const fixtures_1 = require("./fixtures");
/**
 * T312 快进测试：在 node 下跑 50 年，看人口 / 财政 / 就业 / 心情曲线崩不崩。
 *
 * 为了让县城真的长得起来，这里放了一个"自动县长"：照着简单的规矩盖楼——
 * 没房就盖房、缺哪类店就盖哪类店、有岗位缺口就盖工厂、有钱就修路。
 * 它不是玩家，只是个压力源，用来看数值有没有发散的苗头。
 */
const SIZE = 60;
class FlatMap {
    constructor(n) {
        this.n = n;
        this.cells = [];
        this._next = 1;
        for (let y = 0; y < n; y++)
            this.cells.push(new Array(n).fill(null));
    }
    free(col, row, w, h) {
        if (col < 0 || row < 0 || col + w > this.n || row + h > this.n)
            return false;
        for (let r = row; r < row + h; r++)
            for (let c = col; c < col + w; c++)
                if (this.cells[r][c])
                    return false;
        return true;
    }
    put(defId, col, row, w = 1, h = 1, road = false) {
        if (!this.free(col, row, w, h))
            return null;
        const cell = { uid: this._next++, defId, col, row, width: w, height: h, road };
        for (let r = row; r < row + h; r++)
            for (let c = col; c < col + w; c++)
                this.cells[r][c] = cell;
        return cell.uid;
    }
    /** 盖楼失败时把占位撤掉（只撤一格，够用了——失败的都是单格或刚放的） */
    clear(col, row) {
        const cell = this.cells[row]?.[col];
        if (!cell)
            return;
        const cellRow = cell.row;
        const cellCol = cell.col;
        const cellH = cell.height;
        const cellW = cell.width;
        for (let r = cellRow; r < cellRow + cellH; r++) {
            for (let col = cellCol; col < cellCol + cellW; col++) {
                if (this.cells[r]?.[col] === cell)
                    this.cells[r][col] = null;
            }
        }
    }
    list() {
        const seen = new Set();
        const out = [];
        for (const row of this.cells)
            for (const c of row) {
                if (c && !seen.has(c.uid)) {
                    seen.add(c.uid);
                    out.push({ ...c });
                }
            }
        return out;
    }
    /** 挨着道路的空地 */
    freeNextToRoad(w, h) {
        for (let row = 0; row < this.n - h; row++) {
            for (let col = 0; col < this.n - w; col++) {
                if (!this.free(col, row, w, h))
                    continue;
                const around = [
                    this.cells[row - 1]?.[col], this.cells[row + h]?.[col],
                    this.cells[row]?.[col - 1], this.cells[row]?.[col + w],
                ];
                if (around.some((c) => c && c.road))
                    return { col, row };
            }
        }
        return null;
    }
}
function runLongTest(years = 50) {
    const cfg = (0, fixtures_1.loadConfig)();
    const map = new FlatMap(SIZE);
    // 开局：一张连通的方格路网（每 5 格一条街）+ 两栋自建房 + 一家早餐铺
    const SPAN = 40;
    for (let i = 3; i < SPAN; i += 5) {
        for (let x = 2; x < SPAN; x++)
            map.put('dirt-road', x, i, 1, 1, true);
        for (let y = 2; y < SPAN; y++)
            map.put('dirt-road', i, y, 1, 1, true);
    }
    map.put('house', 5, 2);
    map.put('house', 7, 2);
    map.put('breakfast', 5, 4);
    const town = new townView_1.SimpleTownView(SIZE, SIZE, () => map.list());
    const sim = new Simulation_1.Simulation(cfg, town, { seed: 20260101, opening: true });
    const freeSpotCount = () => {
        let n = 0;
        for (let row = 1; row < SIZE - 1; row++)
            for (let col = 1; col < SIZE - 1; col++) {
                if (map.free(col, row, 1, 1)) {
                    const around = [map.cells[row - 1]?.[col], map.cells[row + 1]?.[col], map.cells[row]?.[col - 1], map.cells[row]?.[col + 1]];
                    if (around.some((c) => c && c.road))
                        n++;
                }
            }
        return n;
    };
    const rows = [];
    const demandCycle = ['food', 'daily', 'fun', 'other'];
    for (let month = 1; month <= years * 12; month++) {
        // ── 自动县长：每月开工 ──
        const s = sim.state;
        const sum = sim.summary();
        // 1. 住房不够就盖房（人口接近住房上限时）
        let housing = 0;
        let occupied = 0;
        for (const b of s.buildings) {
            const e = cfg.building(b.defId);
            if (!e || e.housing <= 0)
                continue;
            housing += e.housing;
            occupied += b.residentIds.length;
        }
        if (housing - occupied < 3) {
            const big = sum.population > 30;
            const defId = big ? 'apartment' : 'house';
            const econ = cfg.building(defId);
            if (sim.canAfford(defId)) {
                const spot = map.freeNextToRoad(econ === null ? 1 : (big ? 2 : 1), big ? 2 : 1);
                if (spot) {
                    const uid = map.put(defId, spot.col, spot.row, big ? 2 : 1, big ? 2 : 1);
                    if (uid !== null) {
                        town.refresh();
                        if (!sim.onBuilt(uid, defId))
                            map.clear(spot.col, spot.row);
                    }
                }
            }
        }
        // 2. 缺哪类店就盖哪类（每类店在县城里最多按人口比例配）
        const shopCount = new Map();
        for (const b of s.buildings) {
            const e = cfg.building(b.defId);
            if (!e || e.demand === null)
                continue;
            shopCount.set(e.demand, (shopCount.get(e.demand) ?? 0) + 1);
        }
        for (const d of demandCycle) {
            const want = Math.max(1, Math.floor(sum.population / 18));
            if ((shopCount.get(d) ?? 0) >= want)
                continue;
            const candidates = {
                food: ['breakfast', 'bbq', 'hotpot'],
                daily: ['parcel', 'supermarket'],
                fun: ['milk-tea', 'net-cafe', 'plaza'],
                other: ['barber', 'phone-shop', 'tutoring'],
            };
            const list = candidates[d];
            const pickId = list[(shopCount.get(d) ?? 0) % list.length];
            const econ = cfg.building(pickId);
            if (!sim.canAfford(pickId))
                continue;
            const w = pickId === 'hotpot' || pickId === 'supermarket' || pickId === 'plaza' ? 2 : 1;
            const spot = map.freeNextToRoad(w, w);
            if (!spot)
                continue;
            const uid = map.put(pickId, spot.col, spot.row, w, w);
            if (uid === null)
                continue;
            town.refresh();
            if (!sim.onBuilt(uid, pickId))
                map.clear(spot.col, spot.row);
            break; // 一个月只盖一栋，节奏像玩家
        }
        // 3. 岗位跟不上人口、或者有空房却招不到人就盖工厂
        //    （迁入条件 = 有岗 + 有房，光盖房不盖厂，县城会卡死在原地）
        let positions = 0;
        let unmet = 0;
        for (const b of s.buildings) {
            const e = cfg.building(b.defId);
            if (!e)
                continue;
            for (const slot of e.jobs) {
                positions += slot.count;
                unmet += Math.max(0, slot.count - b.workerIds.length);
            }
        }
        const jobStarved = unmet === 0 && freeSpotCount() > 0 && housing - occupied > 0;
        if (positions < sum.population * 0.8 || jobStarved) {
            const defId = sum.population > 60 ? 'textile' : 'workshop';
            const econ = cfg.building(defId);
            if (sim.canAfford(defId)) {
                const w = defId === 'workshop' ? 1 : 2;
                const spot = map.freeNextToRoad(w, w);
                if (spot) {
                    const uid = map.put(defId, spot.col, spot.row, w, w);
                    if (uid !== null) {
                        town.refresh();
                        if (!sim.onBuilt(uid, defId))
                            map.clear(spot.col, spot.row);
                    }
                }
            }
        }
        sim.stepMonth();
        if (month % 12 === 0) {
            const rep = sim.state.finance.lastMonth;
            const s2 = sim.summary();
            const sumOf = (o) => {
                let total = 0;
                for (const k in o)
                    total += o[k];
                return total;
            };
            const income = sumOf(rep.income);
            const expense = sumOf(rep.expense);
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
            });
        }
    }
    return rows;
}
function main() {
    const rows = runLongTest(50);
    const pad = (s, n) => {
        const str = String(s);
        return str.length >= n ? str : new Array(n - str.length + 1).join(' ') + str;
    };
    console.log('年  人口  就业/劳力  平均心情  平均储蓄  建设资金  月收  月支  建筑  等级');
    for (const r of rows) {
        console.log(`${pad(r.year, 3)} ${pad(r.pop, 5)} ${pad(`${r.employed}/${r.workingAge}`, 10)} ` +
            `${pad(r.avgMood, 9)} ${pad(r.avgSavings, 9)} ${pad(r.funds, 9)} ${pad(r.income, 6)} ${pad(r.expense, 6)} ${pad(r.buildings, 5)} ${r.level}`);
    }
    // ── 断言：曲线不能崩 ──
    const last = rows[rows.length - 1];
    const peak = Math.max(...rows.map((r) => r.pop));
    const problems = [];
    if (last.pop === 0)
        problems.push('50 年后人口归零');
    if (last.pop < 10)
        problems.push(`50 年后只有 ${last.pop} 人，县城没长起来`);
    if (peak > 3000)
        problems.push(`人口爆炸到 ${peak}`);
    if (last.avgMood < 25)
        problems.push(`平均心情长期低迷 ${last.avgMood}`);
    if (!rows.every((r) => isFinite(r.funds)))
        problems.push('财政出现 NaN / Infinity');
    if (rows.slice(10).every((r) => r.funds <= 0))
        problems.push('财政 10 年后一直为负');
    if (last.avgSavings < 0)
        problems.push('平均储蓄为负');
    console.log('');
    if (problems.length) {
        console.log('✗ 曲线有问题：');
        for (const p of problems)
            console.log(`  - ${p}`);
        process.exitCode = 1;
    }
    else {
        console.log(`✓ 50 年曲线正常：人口峰值 ${peak}，末年 ${last.pop} 人，心情 ${last.avgMood}，财政 ${last.funds}`);
    }
}
