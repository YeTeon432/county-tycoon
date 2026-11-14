import { BuildingSim, MonthlyReport, Resident, SimState } from './types';

/**
 * 画面层调用模拟层的唯一入口（合同，见 docs/PARALLEL.md）。
 * 支线 A（模拟）负责实现 Simulation；支线 B（界面）只依赖这个接口，
 * 开发期用 MockSim（mock.ts）顶着。
 */
export interface SimApi {
    readonly state: SimState;

    /** 推进一个月，返回本月账单 */
    stepMonth(): MonthlyReport;

    /** 玩家盖了一栋（TownModel.place 成功后调）。资金不够返回 false，调用方应撤销放置 */
    onBuilt(uid: number, defId: string): boolean;
    /** 玩家拆了一栋 */
    onDemolished(uid: number): void;
    /** 能不能盖（资金、城镇等级） */
    canAfford(defId: string): boolean;

    resident(id: number): Resident | null;
    building(uid: number): BuildingSim | null;
    /** 汇总：人口、就业率、平均工资、平均储蓄、平均心情 */
    summary(): SimSummary;

    /** 月结算后的回调（顶栏、账单、行人刷新用） */
    onMonth: ((report: MonthlyReport) => void) | null;
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
