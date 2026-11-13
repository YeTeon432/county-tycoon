"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suite = suite;
exports.test = test;
exports.eq = eq;
exports.ok = ok;
exports.near = near;
exports.inRange = inRange;
exports.report = report;
/**
 * 极简断言（不引第三方依赖，node 下直接跑）。
 */
let passed = 0;
let failed = 0;
const failures = [];
let current = '';
function suite(name, fn) {
    current = name;
    console.log(`\n── ${name}`);
    try {
        fn();
    }
    catch (e) {
        failed++;
        failures.push(`${name}: 抛异常 ${e.message}`);
        console.error(`  ✗ 抛异常：${e.stack}`);
    }
}
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    }
    catch (e) {
        failed++;
        failures.push(`${current} / ${name}: ${e.message}`);
        console.error(`  ✗ ${name}\n    ${e.message}`);
    }
}
function eq(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} 期望 ${String(expected)}，实际 ${String(actual)}`);
    }
}
function ok(v, msg = '断言失败') {
    if (!v)
        throw new Error(msg);
}
function near(actual, expected, tol = 1e-6, msg = '') {
    if (!(Math.abs(actual - expected) <= tol)) {
        throw new Error(`${msg} 期望 ≈${expected}（±${tol}），实际 ${actual}`);
    }
}
function inRange(v, min, max, msg = '') {
    if (!(v >= min && v <= max))
        throw new Error(`${msg} 期望 ${min}～${max}，实际 ${v}`);
}
function report() {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`通过 ${passed}，失败 ${failed}`);
    if (failed) {
        for (const f of failures)
            console.log(`  - ${f}`);
        process.exitCode = 1;
    }
}
