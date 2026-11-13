/**
 * 模拟层和画面层之间的「合同」（并行开发的共享接口，见 docs/PARALLEL.md）。
 *
 * 规则：
 *   - 这个文件只能由「集成」改。其他支线需要加字段时，在自己的分支里提，合并时统一改。
 *   - 不 import 'cc'：模拟层要能在 node 下直接跑测试。
 *   - 全部是纯数据（可 JSON 序列化），存档直接存 SimState。
 * 字段含义和计算规则见 docs/DESIGN.md。
 */

export type Gender = 'M' | 'F';
/** 0 无 / 1 初中 / 2 高中 / 3 大专以上 */
export type Education = 0 | 1 | 2 | 3;
/** 消费类型（DESIGN 2.3） */
export type Demand = 'food' | 'daily' | 'fun' | 'other';
/** 城镇等级（DESIGN 6） */
export type TownLevel = 'village' | 'town' | 'county' | 'city' | 'top100';

export interface Resident {
    id: number;
    name: string;
    gender: Gender;
    age: number;
    birthMonth: number;          // 1..12
    homeId: number | null;       // 建筑 uid
    jobId: number | null;        // 建筑 uid
    jobTitle: string;            // 无工作时为 ''
    salary: number;              // 月薪，无工作为 0
    savings: number;
    spouseId: number | null;
    parentIds: number[];
    childIds: number[];
    mood: number;                // 0..100
    education: Education;
    monthsUnemployed: number;
    arrivedMonth: number;        // 绝对月份（见 SimState.month）
    log: LifeEvent[];            // 最近 N 条，新的在后
}

export interface LifeEvent {
    month: number;               // 绝对月份
    text: string;                // "入职 纺织厂·车间工人"
}

/** 一栋建筑在模拟层里的状态（位置、朝向仍归 TownModel 管，用 uid 对上） */
export interface BuildingSim {
    uid: number;
    defId: string;
    residentIds: number[];       // 住户
    workerIds: number[];         // 员工
    lastRevenue: number;         // 上月营业额 / 产值
    lastCustomers: number;       // 上月服务人次
    lastTax: number;             // 上月上交
    reputation: number;          // 口碑 0..100（店铺升级用，M4）
}

/** 每种建筑的经营数据，来自配置表（DESIGN 4） */
export interface BuildingEcon {
    id: string;
    cost: number;
    upkeep: number;
    housing: number;
    jobs: JobSlot[];
    demand: Demand | null;
    capacity: number;            // 每月最多服务人次
    price: number;               // 客单价
    env: number;                 // 对周边环境
    unlock: TownLevel;
    publicJob: boolean;          // 岗位工资由财政发（学校、卫生院、发展中心）
}

export interface JobSlot {
    title: string;
    count: number;
    salary: number;
    edu: Education;
}

export interface Finance {
    funds: number;               // 建设资金
    taxRate: { business: number; industry: number; income: number };
    lastMonth: MonthlyReport | null;
}

export interface MonthlyReport {
    month: number;
    income: { business: number; industry: number; income: number; land: number; investment: number };
    expense: { construction: number; upkeep: number; publicWages: number; pension: number; promotion: number };
    populationBefore: number;
    populationAfter: number;
    events: LifeEvent[];         // 本月全县大事记（结婚、迁入、离开……）
}

export interface SimState {
    version: 1;
    seed: number;
    rngState: number;            // 随机数生成器当前状态，存档后接着算结果一致
    month: number;               // 绝对月份，0 = 第 1 年 1 月
    level: TownLevel;
    residents: Resident[];
    buildings: BuildingSim[];
    finance: Finance;
    nextResidentId: number;
}

/** 年月显示用 */
export function monthLabel(month: number): string {
    return `${Math.floor(month / 12) + 1} 年 ${(month % 12) + 1} 月`;
}
