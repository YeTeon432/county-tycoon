"use strict";
/**
 * 模拟层和画面层之间的「合同」（并行开发的共享接口，见 docs/PARALLEL.md）。
 *
 * 规则：
 *   - 这个文件只能由「集成」改。其他支线需要加字段时，在自己的分支里提，合并时统一改。
 *   - 不 import 'cc'：模拟层要能在 node 下直接跑测试。
 *   - 全部是纯数据（可 JSON 序列化），存档直接存 SimState。
 * 字段含义和计算规则见 docs/DESIGN.md。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthLabel = monthLabel;
/** 年月显示用 */
function monthLabel(month) {
    return `${Math.floor(month / 12) + 1} 年 ${(month % 12) + 1} 月`;
}
