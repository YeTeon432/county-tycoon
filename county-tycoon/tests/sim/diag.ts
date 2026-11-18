/**
 * 诊断：跑 50 年，每年把财政那本账拆开打印（T532 调数值用）。
 *   node tests/sim/run.js --diag
 */
import { runLongTest } from './longrun';

export function diagMain(): void {
    const rows = runLongTest(50, { probe: true });
    const keys = ['profit', 'rent', 'business', 'industry', 'income', 'upkeep', 'publicWages', 'pension', 'services'];
    console.log(['年', '人口', '就业', '月收', '月支', ...keys].map((s) => s.padStart(8)).join('|'));
    for (const r of rows) {
        const p = (r as any).parts as Record<string, number> | undefined;
        if (!p) continue;
        console.log([
            String(r.year), String(r.pop), String(r.employed), String(Math.round(r.income)), String(Math.round(r.expense)),
            ...keys.map((k) => String(Math.round(p[k] ?? 0))),
        ].map((s) => s.padStart(8)).join('|'));
    }
}
