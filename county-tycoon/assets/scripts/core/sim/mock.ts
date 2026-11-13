import { SimApi, SimSummary } from './SimApi';
import { BuildingSim, MonthlyReport, Resident, SimState } from './types';

/**
 * 假模拟：给界面支线开发用，数据是写死的开局 5 人 + 每月随机一点变化。
 * 真模拟（Simulation）做好后，GameRoot 里换一行即可。不要在这里写真实规则。
 */
export class MockSim implements SimApi {
    readonly state: SimState;
    onMonth: ((report: MonthlyReport) => void) | null = null;

    constructor() {
        const r = (id: number, name: string, gender: 'M' | 'F', age: number, homeId: number, jobTitle: string, salary: number, spouseId: number | null): Resident => ({
            id, name, gender, age, birthMonth: (id * 5) % 12 + 1, homeId, jobId: salary ? 1001 : null, jobTitle, salary,
            savings: 8000 + id * 3100, spouseId, parentIds: [], childIds: [], mood: 55 + id * 6, education: 1,
            monthsUnemployed: salary ? 0 : 2, arrivedMonth: 0, log: [{ month: 0, text: '住进了自建房' }],
        });
        this.state = {
            version: 1, seed: 1, rngState: 1, month: 0, level: 'village', nextResidentId: 6,
            residents: [
                r(1, '王建国', 'M', 58, 1, '早餐铺·老板', 3200, 2),
                r(2, '李秀兰', 'F', 56, 1, '早餐铺·店员', 2600, 1),
                r(3, '张伟', 'M', 27, 2, '', 0, null),
                r(4, '陈晓燕', 'F', 24, 2, '小作坊·工人', 2800, null),
                r(5, '赵大爷', 'M', 71, 2, '', 0, null),
            ],
            buildings: [],
            finance: { funds: 50000, taxRate: { business: 0.1, industry: 0.15, income: 0.05 }, lastMonth: null },
        };
    }

    stepMonth(): MonthlyReport {
        const s = this.state;
        const before = s.residents.length;
        s.month++;
        for (const p of s.residents) p.savings += Math.round(p.salary * 0.3);
        const tax = 200 + Math.round(Math.random() * 300);
        s.finance.funds += tax - 120;
        const report: MonthlyReport = {
            month: s.month,
            income: { business: tax, industry: 0, income: 0, land: 0, investment: 0 },
            expense: { construction: 0, upkeep: 120, publicWages: 0, pension: 0, promotion: 0 },
            populationBefore: before, populationAfter: s.residents.length,
            events: [{ month: s.month, text: '（假数据）张伟还在找工作' }],
        };
        s.finance.lastMonth = report;
        if (this.onMonth) this.onMonth(report);
        return report;
    }

    onBuilt(uid: number, defId: string): boolean {
        if (s_find(this.state, uid)) return true;
        this.state.buildings.push({ uid, defId, residentIds: [], workerIds: [], lastRevenue: 0, lastCustomers: 0, lastTax: 0, reputation: 50 });
        return true;
    }

    onDemolished(uid: number): void {
        this.state.buildings = this.state.buildings.filter((b) => b.uid !== uid);
    }

    canAfford(_defId: string): boolean {
        return true;
    }

    resident(id: number): Resident | null {
        return this.state.residents.find((p) => p.id === id) ?? null;
    }

    building(uid: number): BuildingSim | null {
        return s_find(this.state, uid);
    }

    summary(): SimSummary {
        const ps = this.state.residents;
        const work = ps.filter((p) => p.age >= 18 && p.age < 60);
        const n = Math.max(1, ps.length);
        return {
            population: ps.length,
            employed: ps.filter((p) => p.jobId !== null).length,
            workingAge: work.length,
            avgSalary: Math.round(ps.reduce((a, p) => a + p.salary, 0) / Math.max(1, ps.filter((p) => p.salary > 0).length)),
            avgSavings: Math.round(ps.reduce((a, p) => a + p.savings, 0) / n),
            avgMood: Math.round(ps.reduce((a, p) => a + p.mood, 0) / n),
        };
    }
}

function s_find(s: SimState, uid: number): BuildingSim | null {
    return s.buildings.find((b) => b.uid === uid) ?? null;
}
