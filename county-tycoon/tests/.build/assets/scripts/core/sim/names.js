"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeName = makeName;
const rng_1 = require("./rng");
/**
 * 名字库。按年代挑：45 岁以上用「建国 / 秀兰」这类，年轻人用「子轩 / 雨欣」。
 * 重名就再抽一次，抽几次还重就用序号兜底，绝不返回空串。
 */
function makeName(rng, names, age, gender, taken) {
    const sur = (0, rng_1.pick)(rng, names.surnames) ?? '李';
    const bank = age >= 45
        ? (gender === 'M' ? names.maleOld : names.femaleOld)
        : (gender === 'M' ? names.maleYoung : names.femaleYoung);
    for (let i = 0; i < 8; i++) {
        const given = (0, rng_1.pick)(rng, bank) ?? '小明';
        const full = sur + given;
        if (!taken.has(full))
            return full;
    }
    const base = sur + ((0, rng_1.pick)(rng, bank) ?? '小明');
    for (let n = 2; n < 999; n++) {
        const full = `${base}${n}`;
        if (!taken.has(full))
            return full;
    }
    return `${base}${taken.size}`;
}
