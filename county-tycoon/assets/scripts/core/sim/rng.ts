/**
 * 带种子的伪随机数（DESIGN 10）。
 *
 * 用 mulberry32：内部状态就是一个 32 位整数，直接存在 `SimState.rngState` 里。
 * 存档读回来接着算，结果和没存过一样；同一个种子 + 同一串操作 → 完全相同的序列。
 *
 * 模拟层所有随机都必须走这里，不准用 Math.random，否则 bug 没法复现、测试也没法断言。
 */
export interface Rng {
    state: number;
}

export function rngFromSeed(seed: number): Rng {
    // 0 会让生成器退化，换成 1
    return { state: (seed >>> 0) || 1 };
}

/** 0 ≤ x < 1 */
export function nextFloat(rng: Rng): number {
    rng.state = (rng.state + 0x6d2b79f5) >>> 0;
    let t = rng.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [min, max] 闭区间整数；max ≤ min 时返回 min */
export function nextInt(rng: Rng, min: number, max: number): number {
    if (max <= min) return Math.floor(min);
    return Math.floor(min) + Math.floor(nextFloat(rng) * (Math.floor(max) - Math.floor(min) + 1));
}

/** 概率 p 是否发生 */
export function chance(rng: Rng, p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return nextFloat(rng) < p;
}

/** 平均分布取一个；空数组返回 null */
export function pick<T>(rng: Rng, list: readonly T[]): T | null {
    if (!list.length) return null;
    const i = Math.min(list.length - 1, Math.floor(nextFloat(rng) * list.length));
    return list[i];
}

/** 按权重取一个；权重全为 0 或空数组返回 null */
export function pickWeighted<T>(rng: Rng, list: readonly T[], weight: (item: T) => number): T | null {
    let total = 0;
    for (const item of list) {
        const w = weight(item);
        if (w > 0) total += w;
    }
    if (total <= 0) return null;
    let x = nextFloat(rng) * total;
    for (const item of list) {
        const w = weight(item);
        if (w <= 0) continue;
        x -= w;
        if (x <= 0) return item;
    }
    return list[list.length - 1] ?? null;
}

/** 原地洗牌（Fisher–Yates） */
export function shuffle<T>(rng: Rng, list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(nextFloat(rng) * (i + 1));
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
    }
    return list;
}
