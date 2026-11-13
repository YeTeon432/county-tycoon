import { NameConfig } from './config';
import { Rng, pick } from './rng';

/**
 * 名字库。按年代挑：45 岁以上用「建国 / 秀兰」这类，年轻人用「子轩 / 雨欣」。
 * 重名就再抽一次，抽几次还重就用序号兜底，绝不返回空串。
 */
export function makeName(rng: Rng, names: NameConfig, age: number, gender: 'M' | 'F', taken: Set<string>): string {
    const sur = pick(rng, names.surnames) ?? '李';
    const bank = age >= 45
        ? (gender === 'M' ? names.maleOld : names.femaleOld)
        : (gender === 'M' ? names.maleYoung : names.femaleYoung);
    for (let i = 0; i < 8; i++) {
        const given = pick(rng, bank) ?? '小明';
        const full = sur + given;
        if (!taken.has(full)) return full;
    }
    const base = sur + (pick(rng, bank) ?? '小明');
    for (let n = 2; n < 999; n++) {
        const full = `${base}${n}`;
        if (!taken.has(full)) return full;
    }
    return `${base}${taken.size}`;
}
