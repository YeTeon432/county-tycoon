"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rngFromSeed = rngFromSeed;
exports.nextFloat = nextFloat;
exports.nextInt = nextInt;
exports.chance = chance;
exports.pick = pick;
exports.pickWeighted = pickWeighted;
exports.shuffle = shuffle;
function rngFromSeed(seed) {
    // 0 会让生成器退化，换成 1
    return { state: (seed >>> 0) || 1 };
}
/** 0 ≤ x < 1 */
function nextFloat(rng) {
    rng.state = (rng.state + 0x6d2b79f5) >>> 0;
    let t = rng.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** [min, max] 闭区间整数；max ≤ min 时返回 min */
function nextInt(rng, min, max) {
    if (max <= min)
        return Math.floor(min);
    return Math.floor(min) + Math.floor(nextFloat(rng) * (Math.floor(max) - Math.floor(min) + 1));
}
/** 概率 p 是否发生 */
function chance(rng, p) {
    if (p <= 0)
        return false;
    if (p >= 1)
        return true;
    return nextFloat(rng) < p;
}
/** 平均分布取一个；空数组返回 null */
function pick(rng, list) {
    if (!list.length)
        return null;
    const i = Math.min(list.length - 1, Math.floor(nextFloat(rng) * list.length));
    return list[i];
}
/** 按权重取一个；权重全为 0 或空数组返回 null */
function pickWeighted(rng, list, weight) {
    let total = 0;
    for (const item of list) {
        const w = weight(item);
        if (w > 0)
            total += w;
    }
    if (total <= 0)
        return null;
    let x = nextFloat(rng) * total;
    for (const item of list) {
        const w = weight(item);
        if (w <= 0)
            continue;
        x -= w;
        if (x <= 0)
            return item;
    }
    return list[list.length - 1] ?? null;
}
/** 原地洗牌（Fisher–Yates） */
function shuffle(rng, list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(nextFloat(rng) * (i + 1));
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
    }
    return list;
}
