import { _decorator, Color, Graphics, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { LifeEvent, MonthlyReport, monthLabel } from '../core/sim/types';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import {
    formatMoney, makeIcon, makeLabel, makeLabelLeft, makeLabelRight, makePanelNode, makeSectionTitle, makeStatTile,
    UI_COLOR, UI_FONT, UI_PALETTE, UI_RADIUS,
} from './UiTheme';

const { ccclass } = _decorator;

/**
 * 月度账单（T310）。
 *
 * 顶栏「账单」按钮打开：顶部收入 / 支出 / 结余三格，下面两列明细、人口变化、大事记。
 * 结构照 DESIGN 第 8 节：收入分项、支出分项、人口前后、事件列表。
 *
 * 收入 / 支出的中文名写在这里而不是配置表里：它们对应 MonthlyReport 的固定字段，
 * 不是策划会调的数（数值本身在 economy.json 里）。以后加字段时这里一起改。
 */

const INCOME_ROWS: { key: keyof MonthlyReport['income']; label: string }[] = [
    { key: 'business', label: '商业税' },
    { key: 'industry', label: '企业税' },
    { key: 'income', label: '个人所得税' },
    { key: 'land', label: '土地出让' },
    { key: 'investment', label: '招商引资' },
    { key: 'profit', label: '县属店厂利润' },
    { key: 'rent', label: '住房租金' },
];

const EXPENSE_ROWS: { key: keyof MonthlyReport['expense']; label: string }[] = [
    { key: 'construction', label: '建设支出' },
    { key: 'upkeep', label: '维护费' },
    { key: 'services', label: '公共服务' },
    { key: 'publicWages', label: '公职工资' },
    { key: 'pension', label: '养老金' },
    { key: 'promotion', label: '招商补贴' },
    { key: 'research', label: '研究费' },
];

@ccclass('MonthReportPanel')
export class MonthReportPanel extends Panel {
    protected cardH = 1060;

    private _report: MonthlyReport | null = null;
    private _sim: SimApi | null = null;

    static show(parent: Node, sim: SimApi, report: MonthlyReport | null): MonthReportPanel {
        const panel = Panel.open(MonthReportPanel, parent, '月度账单', monthLabel(report?.month ?? sim.state.month));
        panel._sim = sim;
        panel._report = report;
        panel.renderPage = () => panel.fill();
        panel.renderPage();
        return panel;
    }

    private fill(): void {
        const r = this._report;
        const content = this.content;
        if (!content || !this._sim) return;
        if (!r) {
            const W = this.contentW;
            const tile = makeStatTile(content, W, 112, '当前县库', formatMoney(this._sim.state.finance.funds), UI_COLOR.text);
            tile.node.setPosition(0, this.contentTop - 56, 0);
            const note = makeLabelLeft(content, 'FirstSettlement', '首月经营中，月底结算后可查看收支明细和人口变化。', UI_FONT.body, UI_COLOR.textDim, W);
            note.node.setPosition(-W / 2, this.contentTop - 162, 0);
            return;
        }
        const W = this.contentW;
        let y = this.contentTop;

        let income = 0;
        let expense = 0;
        for (const it of INCOME_ROWS) income += r.income[it.key] ?? 0;
        for (const it of EXPENSE_ROWS) expense += r.expense[it.key] ?? 0;
        const net = income - expense;
        const dPop = r.populationAfter - r.populationBefore;

        // ── 顶部三格：收入 / 支出 / 结余 ──
        const tileH = 108, gap = 16;
        const tileW = (W - gap * 2) / 3;
        const tiles: [string, string, Color][] = [
            ['收入', formatMoney(income), UI_COLOR.up],
            ['支出', formatMoney(-expense), UI_COLOR.down],
            [net >= 0 ? '本月结余' : '本月亏损', formatMoney(net), net >= 0 ? UI_COLOR.up : UI_COLOR.down],
        ];
        for (let i = 0; i < tiles.length; i++) {
            const t = makeStatTile(content, tileW, tileH, tiles[i][0], tiles[i][1], tiles[i][2]);
            t.node.setPosition(-W / 2 + tileW / 2 + i * (tileW + gap), y - tileH / 2, 0);
        }
        y -= tileH + 36;

        // ── 收支明细：左右两列 ──
        const colW = (W - 24) / 2;
        const leftX = -W / 2 + colW / 2;
        const rightX = W / 2 - colW / 2;
        const yIn = this.detailColumn(content, leftX, colW, y, '收入', INCOME_ROWS.map((it) => [it.label, r.income[it.key] ?? 0]), UI_COLOR.up);
        const yOut = this.detailColumn(content, rightX, colW, y, '支出', EXPENSE_ROWS.map((it) => [it.label, r.expense[it.key] ?? 0]), UI_COLOR.down);
        y = Math.min(yIn, yOut) - 14;

        // ── 人口 ──
        const popText = dPop === 0
            ? `人口 ${r.populationAfter} 人，没有变化`
            : `人口 ${r.populationBefore} → ${r.populationAfter} 人（${dPop > 0 ? '+' : ''}${dPop}）`;
        const popH = 56;
        const pop = makePanelNode(content, 'Population', W, popH);
        pop.setPosition(0, y - popH / 2, 0);
        const pg = pop.addComponent(Graphics);
        const pc = dPop >= 0 ? UI_PALETTE.green : UI_PALETTE.coral;
        pg.fillColor = new Color(pc.r, pc.g, pc.b, 28);
        pg.roundRect(-W / 2, -popH / 2, W, popH, UI_RADIUS);
        pg.fill();
        const icon = makeIcon(pop, 'people', 34);
        icon.node.setPosition(-W / 2 + 34, 0, 0);
        const pl = makeLabelLeft(pop, 'Txt', popText, UI_FONT.body, dPop >= 0 ? UI_COLOR.text : UI_COLOR.down, W - 80);
        pl.node.setPosition(-W / 2 + 62, 0, 0);
        y -= popH + 36;

        // ── 大事记 ──
        makeSectionTitle(content, W, y, '大事记', UI_PALETTE.yellow);
        y -= 30;
        const bottom = -this.contentH / 2;
        const listH = Math.max(80, y - bottom);
        const list = ScrollList.mount(content, 'Events', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);

        if (r.events.length === 0) {
            const empty = makeLabel(content, 'Empty', '本月平静无事', UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(0, y - 40, 0);
            list.node.active = false;
            return;
        }

        const rows: ListRow[] = r.events.map((e) => ({
            height: 52,
            build: (row) => this.buildEventRow(row, W, e),
        }));
        list.setRows(rows);
    }

    /**
     * 一列明细：小标题 + 各项（0 不显示，首月一堆 0 会把面板塞满）。返回列底的 y。
     * 一项都没有时写「无」。
     */
    private detailColumn(parent: Node, cx: number, w: number, y: number, title: string, items: [string, number][], color: Color): number {
        const t = makeLabelLeft(parent, 'ColTitle', title, UI_FONT.small, UI_COLOR.textDim, w);
        t.node.setPosition(cx - w / 2, y, 0);
        y -= 40;
        const shown = items.filter(([, v]) => v !== 0);
        if (shown.length === 0) {
            const n = makeLabelLeft(parent, 'None', '无', UI_FONT.body, UI_COLOR.textDim, w);
            n.node.setPosition(cx - w / 2, y, 0);
            return y - 40;
        }
        for (const [label, v] of shown) {
            const l = makeLabelLeft(parent, 'K', label, UI_FONT.body, UI_COLOR.text, w - 130);
            l.node.setPosition(cx - w / 2, y, 0);
            const vl = makeLabelRight(parent, 'V', formatMoney(v), UI_FONT.body, color, 130);
            vl.node.setPosition(cx + w / 2, y, 0);
            y -= 42;
        }
        return y;
    }

    private buildEventRow(row: Node, W: number, e: LifeEvent): void {
        const H = row.getComponent(UITransform)!.height;
        const g = row.addComponent(Graphics);
        g.fillColor = UI_PALETTE.yellow;
        g.circle(-W / 2 + 10, 0, 6);
        g.fill();
        g.fillColor = UI_COLOR.borderDim;
        g.rect(-W / 2 + 28, -H / 2, W - 28, 2);
        g.fill();

        const text = makeLabelLeft(row, 'Text', e.text, UI_FONT.small, UI_COLOR.text, W - 40);
        text.node.setPosition(-W / 2 + 28, 0, 0);
    }
}
