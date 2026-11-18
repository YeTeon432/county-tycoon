import { BuildingEcon, BuildingSim, JobSlot, Resident } from './types';

/**
 * 岗位分配（DESIGN 2.4）。
 *
 * 一栋楼的岗位在配置里写成若干组（店员 × 2、车间工人 × 4……），
 * 这里展开成一个个"位置"，并按学历从高到低排：高学历的位置先被占，
 * 剩下没人占的才是真正在招人的位置，对外报的学历要求取其中最低的。
 */

/** 墙上贴的岗位表，按学历从高到低排（同一学历里工资高的在前） */
export function positionsOf(econ: BuildingEcon): JobSlot[] {
    const out: JobSlot[] = [];
    for (const slot of econ.jobs) {
        for (let i = 0; i < slot.count; i++) out.push(slot);
    }
    out.sort((a, b) => (b.edu - a.edu) || (b.salary - a.salary));
    return out;
}

export function totalPositions(econ: BuildingEcon | null): number {
    if (!econ) return 0;
    let n = 0;
    for (const slot of econ.jobs) n += slot.count;
    return n;
}

export interface Staffing {
    /** 每个位置有没有人 */
    used: boolean[];
    /** 学历够不上任何空位、或者楼的岗位比人少的员工（暂时闲置，不扣工资） */
    idle: number[];
    /** 还空着的位置下标，可以招人 */
    open: number[];
    /** 在岗人数 */
    staff: number;
}

/**
 * 谁在哪个位置。
 *
 * 员工的 edu 已经写进 Resident，这里按学历从高到低和人配对：
 * 学历够得上的最高位置先配。这样"工厂招满了"不会出现学历倒挂。
 */
export function staffing(b: BuildingSim, econ: BuildingEcon, residentsById: Map<number, Resident>): Staffing {
    const positions = positionsOf(econ);
    const workers: Resident[] = [];
    for (const id of b.workerIds) {
        const r = residentsById.get(id);
        if (r) workers.push(r);
    }
    workers.sort((a, b2) => b2.education - a.education || a.id - b2.id);

    const used = positions.map(() => false);
    const idle: number[] = [];
    for (const w of workers) {
        let idx = -1;
        for (let i = 0; i < positions.length; i++) {
            if (!used[i] && positions[i].edu <= w.education) {
                idx = i;
                break;
            }
        }
        if (idx >= 0) used[idx] = true;
        else idle.push(w.id);
    }
    const open: number[] = [];
    for (let i = 0; i < positions.length; i++) if (!used[i]) open.push(i);
    return { used, idle, open, staff: workers.length - idle.length };
}

/**
 * 让某人上岗：写回 jobId / jobTitle / salary，并把 id 记进这栋楼的员工名单。
 * 两头必须一起改，否则 staffing() 数不到人，店里的服务能力会一直是 0。
 */
export function assignJob(r: Resident, b: BuildingSim, econ: BuildingEcon, slotIndex: number): void {
    const positions = positionsOf(econ);
    const slot = positions[slotIndex] ?? positions[0];
    if (!slot) return;
    r.jobId = b.uid;
    r.jobTitle = slot.title;
    r.salary = slot.salary;
    r.monthsUnemployed = 0;
    if (b.workerIds.indexOf(r.id) < 0) b.workerIds.push(r.id);
}

/** 让某人离职：清字段，并从楼里的名单上划掉 */
export function clearJob(r: Resident, b: BuildingSim | null): void {
    if (b) b.workerIds = b.workerIds.filter((id) => id !== r.id);
    r.jobId = null;
    r.jobTitle = '';
    r.salary = 0;
}

/** 这栋楼对外挂的岗位里，学历要求最低的那个；没招人返回 null */
export function easiestOpenSlot(b: BuildingSim, econ: BuildingEcon, residentsById: Map<number, Resident>): { index: number; slot: JobSlot } | null {
    const st = staffing(b, econ, residentsById);
    if (!st.open.length) return null;
    const positions = positionsOf(econ);
    let best = st.open[0];
    for (const i of st.open) {
        if (positions[i].edu < positions[best].edu) best = i;
        else if (positions[i].edu === positions[best].edu && positions[i].salary > positions[best].salary) best = i;
    }
    return { index: best, slot: positions[best] };
}

/** 县城里所有还在招人、且学历够得上的岗位 */
export interface Opening {
    building: BuildingSim;
    index: number;
    slot: JobSlot;
}

export function openingsFor(
    r: Resident,
    buildings: BuildingSim[],
    econOf: (uid: number) => BuildingEcon | null,
    residentsById: Map<number, Resident>,
): Opening[] {
    const out: Opening[] = [];
    for (const b of buildings) {
        const econ = econOf(b.uid);
        if (!econ || !econ.jobs.length) continue;
        if ((b.freezeMonths ?? 0) > 0) continue;   // 刚裁过员，暂停招人（D026）
        const st = staffing(b, econ, residentsById);
        if (!st.open.length) continue;
        const positions = positionsOf(econ);
        for (const i of st.open) {
            if (positions[i].edu <= r.education) out.push({ building: b, index: i, slot: positions[i] });
        }
    }
    return out;
}
