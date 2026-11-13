/**
 * 迁入速度参数扫描：同一个自动县长、同一个种子，只改 immigrationRate，
 * 看多少年长到多少人。用来定 M2 的成长节奏。
 */
import { Simulation } from '../../assets/scripts/core/sim/Simulation';
import { SimpleTownView } from '../../assets/scripts/core/sim/townView';
import { Demand } from '../../assets/scripts/core/sim/types';
import { makeSimConfig } from '../../assets/scripts/core/sim/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const SIZE = 40;
const SPAN = 40;

interface C { uid: number; defId: string; col: number; row: number; width: number; height: number; road: boolean }

class FlatMap {
    readonly cells: (C | null)[][] = [];
    private _next = 1;
    constructor(readonly n: number) { for (let y = 0; y < n; y++) this.cells.push(new Array(n).fill(null)); }
    free(col: number, row: number, w: number, h: number): boolean {
        if (col < 0 || row < 0 || col + w > this.n || row + h > this.n) return false;
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (this.cells[r][c]) return false;
        return true;
    }
    put(defId: string, col: number, row: number, w = 1, h = 1, road = false): number | null {
        if (!this.free(col, row, w, h)) return null;
        const o: C = { uid: this._next++, defId, col, row, width: w, height: h, road };
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) this.cells[r][c] = o;
        return o.uid;
    }
    clear(col: number, row: number): void {
        const cell = this.cells[row]?.[col]; if (!cell) return;
        const { row: r0, col: c0, height: h, width: w } = cell;
        for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (this.cells[r]?.[c] === cell) this.cells[r][c] = null;
    }
    list() {
        const seen = new Set<number>(); const out: any[] = [];
        for (const row of this.cells) for (const c of row) if (c && !seen.has(c.uid)) { seen.add(c.uid); out.push({ ...c }); }
        return out;
    }
    freeNextToRoad(w: number, h: number) {
        for (let row = 0; row < this.n - h; row++) for (let col = 0; col < this.n - w; col++) {
            if (!this.free(col, row, w, h)) continue;
            const around = [this.cells[row - 1]?.[col], this.cells[row + h]?.[col], this.cells[row]?.[col - 1], this.cells[row]?.[col + w]];
            if (around.some((c) => c && c.road)) return { col, row };
        }
        return null;
    }
}

function run(rate: number, years: number): number[] {
    const economy = JSON.parse(readFileSync(join(process.cwd(), 'assets/resources/config/economy.json'), 'utf8'));
    economy.tuning.immigrationRate = rate;
    const names = JSON.parse(readFileSync(join(process.cwd(), 'assets/resources/config/names.json'), 'utf8'));
    const cfg = makeSimConfig(economy, names);

    const map = new FlatMap(SIZE);
    for (let i = 3; i < SPAN; i += 5) {
        for (let x = 2; x < SPAN; x++) map.put('dirt-road', x, i, 1, 1, true);
        for (let y = 2; y < SPAN; y++) map.put('dirt-road', i, y, 1, 1, true);
    }
    map.put('house', 5, 2); map.put('house', 7, 2); map.put('breakfast', 5, 4);

    const town = new SimpleTownView(SIZE, SIZE, () => map.list() as any);
    const sim = new Simulation(cfg, town, { seed: 20260101, opening: true });
    const pops: number[] = [];
    const cycle: Demand[] = ['food', 'daily', 'fun', 'other'];

    for (let month = 1; month <= years * 12; month++) {
        const s = sim.state; const sum = sim.summary();
        let housing = 0, occupied = 0, positions = 0, unmet = 0;
        for (const b of s.buildings) {
            const e = cfg.building(b.defId); if (!e) continue;
            housing += e.housing; occupied += b.residentIds.length;
            for (const sl of e.jobs) { positions += sl.count; unmet += Math.max(0, sl.count - b.workerIds.length); }
        }
        if (housing - occupied < 3) {
            const big = sum.population > 30;
            const id = big ? 'apartment' : 'house';
            if (sim.canAfford(id)) {
                const spot = map.freeNextToRoad(big ? 2 : 1, big ? 2 : 1);
                if (spot) { const uid = map.put(id, spot.col, spot.row, big ? 2 : 1, big ? 2 : 1);
                    if (uid !== null) { town.refresh(); if (!sim.onBuilt(uid, id)) map.clear(spot.col, spot.row); } }
            }
        }
        const shopCount = new Map<Demand, number>();
        for (const b of s.buildings) { const e = cfg.building(b.defId); if (e && e.demand) shopCount.set(e.demand, (shopCount.get(e.demand) ?? 0) + 1); }
        for (const d of cycle) {
            const want = Math.max(1, Math.floor(sum.population / 18));
            if ((shopCount.get(d) ?? 0) >= want) continue;
            const cand: Record<Demand, string[]> = {
                food: ['breakfast', 'bbq', 'hotpot'], daily: ['parcel', 'supermarket'],
                fun: ['milk-tea', 'net-cafe', 'plaza'], other: ['barber', 'phone-shop', 'tutoring'],
            };
            const id = cand[d][(shopCount.get(d) ?? 0) % cand[d].length];
            if (!sim.canAfford(id)) continue;
            const w = id === 'hotpot' || id === 'supermarket' || id === 'plaza' ? 2 : 1;
            const spot = map.freeNextToRoad(w, w); if (!spot) continue;
            const uid = map.put(id, spot.col, spot.row, w, w); if (uid === null) continue;
            town.refresh(); if (!sim.onBuilt(uid, id)) map.clear(spot.col, spot.row);
            break;
        }
        let freeSpot = false;
        for (let r = 1; r < SIZE - 1 && !freeSpot; r++) for (let c = 1; c < SIZE - 1; c++) if (map.free(c, r, 1, 1)) { freeSpot = true; break; }
        if (positions < sum.population * 0.8 || (unmet === 0 && freeSpot && housing - occupied > 0)) {
            const id = sum.population > 60 ? 'textile' : 'workshop';
            if (sim.canAfford(id)) {
                const w = id === 'workshop' ? 1 : 2;
                const spot = map.freeNextToRoad(w, w);
                if (spot) { const uid = map.put(id, spot.col, spot.row, w, w);
                    if (uid !== null) { town.refresh(); if (!sim.onBuilt(uid, id)) map.clear(spot.col, spot.row); } }
            }
        }
        sim.stepMonth();
        if (month % 12 === 0) pops.push(sim.state.residents.length);
    }
    return pops;
}

export function main(): void {
    const rates = [0.6, 1.2, 2.0, 3.0, 5.0];
    const years = 40;
    console.log('迁入速率对比（同一自动县长、同一种子，每 12 个月记录一次人口）\n');
    console.log('速率  ' + Array.from({ length: years }, (_, i) => String(i + 1).padStart(4)).join(''));
    const results: number[][] = [];
    for (const r of rates) {
        const pops = run(r, years);
        results.push(pops);
        console.log(`${r.toFixed(1).padStart(4)}  ` + pops.map((p) => String(p).padStart(4)).join(''));
    }
    console.log('\n到达里程碑所需的年数（超过 40 年记 —）：');
    const marks = [20, 60, 150, 500];
    console.log('速率  ' + marks.map((m) => `${m}人`.padStart(8)).join(''));
    for (let i = 0; i < rates.length; i++) {
        const row = marks.map((m) => {
            const idx = results[i].findIndex((p) => p >= m);
            return (idx < 0 ? '—' : `第${idx + 1}年`).padStart(8);
        });
        console.log(`${rates[i].toFixed(1).padStart(4)}  ` + row.join(''));
    }
}
