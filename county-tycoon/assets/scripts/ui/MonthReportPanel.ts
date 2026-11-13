import { _decorator, Color, Graphics, Label, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { LifeEvent, MonthlyReport, monthLabel } from '../core/sim/types';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import { formatNumber, makeLabel, UI_COLOR, UI_FONT } from './UiTheme';

const { ccclass } = _decorator;

/**
 * 月度账单（T310）。
 *
 * 每月结算完自动弹出：本月收支、人口变化、大事记。
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
];

const EXPENSE_ROWS: { key: keyof MonthlyReport['expense']; label: string }[] = [
    { key: 'construction', label: '建设支出' },
    { key: 'upkeep', label: '维护费' },
    { key: 'publicWages', label: '公职工资' },
    { key: 'pension', label: '养老金' },
    { key: 'promotion', label: '宣传推广' },
];

@ccclass('MonthReportPanel')
export class MonthReportPanel extends Panel {
    protected cardH = 900;

    private _report: MonthlyReport | null = null;
    private _sim: SimApi | null = null;

    static show(parent: Node, sim: SimApi, report: MonthlyReport): MonthReportPanel {
        const panel = Panel.open(MonthReportPanel, parent, `${monthLabel(report.month)} 账单`, '');
        panel._sim = sim;
        panel._report = report;
        panel.fill();
        return panel;
    }

    private fill(): void {
        const r = this._report;
        const content = this.content;
        if (!r || !content) return;
        const W = content.getComponent(UITransform)!.width;
        const T = content.getComponent(UITransform)!;

        let y = T.height / 2 - 6;

        // ── 收入 ──
        let income = 0;
        let expense = 0;
        for (const it of INCOME_ROWS) income += r.income[it.key] ?? 0;
        for (const it of EXPENSE_ROWS) expense += r.expense[it.key] ?? 0;
        const net = income - expense;

        y = this.sectionTitle(content, W, y, '收入');
        for (const it of INCOME_ROWS) {
            const v = r.income[it.key] ?? 0;
            // 为 0 的项不显示：首月一堆 0 会把面板塞满
            if (v === 0) continue;
            y = this.amountRow(content, W, y, it.label, v, UI_COLOR.up);
        }
        y = this.totalRow(content, W, y, '收入合计', income, UI_COLOR.up);

        y -= 12;

        // ── 支出 ──
        y = this.sectionTitle(content, W, y, '支出');
        for (const it of EXPENSE_ROWS) {
            const v = r.expense[it.key] ?? 0;
            if (v === 0) continue;
            y = this.amountRow(content, W, y, it.label, v, UI_COLOR.down);
        }
        y = this.totalRow(content, W, y, '支出合计', expense, UI_COLOR.down);

        y -= 12;

        // ── 结余 ──
        y = this.totalRow(content, W, y, net >= 0 ? '本月结余' : '本月亏损', net, net >= 0 ? UI_COLOR.up : UI_COLOR.down);

        // ── 人口 ──
        y -= 10;
        const dPop = r.populationAfter - r.populationBefore;
        const popText = dPop === 0
            ? `人口 ${r.populationAfter} 人（无变化）`
            : `人口 ${r.populationBefore} → ${r.populationAfter} 人（${dPop > 0 ? '+' : ''}${dPop}）`;
        const pop = makeLabel(content, 'Population', popText, UI_FONT.body, dPop >= 0 ? UI_COLOR.text : UI_COLOR.down, W);
        pop.node.setPosition(0, y, 0);
        y -= 34;

        // ── 大事记 ──
        y -= 8;
        y = this.sectionTitle(content, W, y, '大事记');

        const bottom = -T.height / 2 + 8;
        const listH = Math.max(80, y - bottom);
        const list = ScrollList.mount(content, 'Events', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);

        if (r.events.length === 0) {
            const empty = makeLabel(content, 'Empty', '本月平静无事', UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(0, y - listH / 2, 0);
            list.node.active = false;
            return;
        }

        const rows: ListRow[] = r.events.map((e) => ({
            height: 44,
            build: (row) => this.buildEventRow(row, W, e),
        }));
        list.setRows(rows);
    }

    private sectionTitle(parent: Node, W: number, y: number, text: string): number {
        const t = makeLabel(parent, 'Section', text, UI_FONT.body, UI_COLOR.gold, W);
        t.node.setPosition(0, y, 0);
        y -= 36;

        const line = new Node('Line');
        line.layer = parent.layer;
        line.addComponent(UITransform).setContentSize(W, 1);
        line.setPosition(0, y + 12, 0);
        parent.addChild(line);
        const g = line.addComponent(Graphics);
        g.fillColor = UI_COLOR.borderDim;
        g.rect(-W / 2, 0, W, 1);
        g.fill();
        return y;
    }

    /** 一条分项：左名右数 */
    private amountRow(parent: Node, W: number, y: number, label: string, value: number, color: Color): number {
        const l = makeLabel(parent, 'K', label, UI_FONT.body, UI_COLOR.text, W - 220);
        l.node.setPosition(-W / 2 + 10, y, 0);
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);

        const v = makeLabel(parent, 'V', `¥${formatNumber(value)}`, UI_FONT.body, color, 200);
        v.node.setPosition(W / 2 - 10, y, 0);
        v.horizontalAlign = Label.HorizontalAlign.RIGHT;
        v.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
        return y - 34;
    }

    /** 合计行：字号大一号，上面一条淡线 */
    private totalRow(parent: Node, W: number, y: number, label: string, value: number, color: Color): number {
        y -= 4;
        const l = makeLabel(parent, 'TK', label, UI_FONT.body, UI_COLOR.text, W - 220);
        l.node.setPosition(-W / 2 + 10, y, 0);
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        l.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);

        const v = makeLabel(parent, 'TV', `${value >= 0 ? '' : '-'}¥${formatNumber(Math.abs(value))}`, UI_FONT.title, color, 230);
        v.node.setPosition(W / 2 - 10, y, 0);
        v.horizontalAlign = Label.HorizontalAlign.RIGHT;
        v.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
        return y - 46;
    }

    private buildEventRow(row: Node, W: number, e: LifeEvent): void {
        const dot = new Node('Dot');
        dot.layer = row.layer;
        dot.addComponent(UITransform).setContentSize(8, 8);
        dot.setPosition(-W / 2 + 12, 0, 0);
        row.addChild(dot);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = UI_COLOR.gold;
        dg.circle(0, 0, 3);
        dg.fill();

        const text = makeLabel(row, 'Text', e.text, UI_FONT.small, UI_COLOR.text, W - 40);
        text.node.setPosition(-W / 2 + 28, 0, 0);
        text.horizontalAlign = Label.HorizontalAlign.LEFT;
        text.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    }
}
