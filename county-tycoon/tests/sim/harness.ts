/**
 * 极简断言（不引第三方依赖，node 下直接跑）。
 */
let passed = 0;
let failed = 0;
const failures: string[] = [];
let current = '';

export function suite(name: string, fn: () => void): void {
    current = name;
    console.log(`\n── ${name}`);
    try {
        fn();
    } catch (e) {
        failed++;
        failures.push(`${name}: 抛异常 ${(e as Error).message}`);
        console.error(`  ✗ 抛异常：${(e as Error).stack}`);
    }
}

export function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        failures.push(`${current} / ${name}: ${(e as Error).message}`);
        console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
    }
}

export function eq<T>(actual: T, expected: T, msg = ''): void {
    if (actual !== expected) {
        throw new Error(`${msg} 期望 ${String(expected)}，实际 ${String(actual)}`);
    }
}

export function ok(v: unknown, msg = '断言失败'): void {
    if (!v) throw new Error(msg);
}

export function near(actual: number, expected: number, tol = 1e-6, msg = ''): void {
    if (!(Math.abs(actual - expected) <= tol)) {
        throw new Error(`${msg} 期望 ≈${expected}（±${tol}），实际 ${actual}`);
    }
}

export function inRange(v: number, min: number, max: number, msg = ''): void {
    if (!(v >= min && v <= max)) throw new Error(`${msg} 期望 ${min}～${max}，实际 ${v}`);
}

export function report(): void {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`通过 ${passed}，失败 ${failed}`);
    if (failed) {
        for (const f of failures) console.log(`  - ${f}`);
        process.exitCode = 1;
    }
}
