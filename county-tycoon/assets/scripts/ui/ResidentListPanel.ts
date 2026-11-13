import { _decorator, Color, Graphics, Label, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { Resident } from '../core/sim/types';
import { TownModel } from '../core/TownModel';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import { formatNumber, makeLabel, makePill, moodColor, moodLabel, UI_COLOR, UI_FONT } from './UiTheme';

const { ccclass } = _decorator;

/** 排序字段 */
type SortKey = 'age' | 'salary' | 'savings' | 'mood';
/** 筛选：全部 / 上班 / 待业 / 老人小孩 */
type FilterKey = 'all' | 'working' | 'jobless' | 'inactive';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'salary', label: '按收入' },
    { key: 'age', label: '按年龄' },
    { key: 'savings', label: '按储蓄' },
    { key: 'mood', label: '按心情' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'working', label: '上班' },
    { key: 'jobless', label: '待业' },
    { key: 'inactive', label: '老人小孩' },
];

/**
 * 居民总览（T309）。
 *
 * 顶部汇总（人口、就业率、平均工资、平均储蓄）→ 排序 / 筛选按钮 → 居民列表。
 * 点一行打开档案（和 T308 的入口一致），叠在总览上面。
 *
 * 排序是"降序为主"：玩家看总览多半是想找"挣得最多的""心情最差的"。
 * 年龄按降序（谁最老先看到），心情按升序（谁最不爽先看到）——这个例外是有意的。
 */
@ccclass('ResidentListPanel')
export class ResidentListPanel extends Panel {
    private _sim: SimApi | null = null;
    private _model: TownModel | null = null;
    private _sort: SortKey = 'salary';
    private _filter: FilterKey = 'all';
    private _onResidentTap: ((id: number) => void) | null = null;

    /** 总览比建筑详情高一些：名单长，要一屏看到更多人 */
    protected cardH = 940;

    private _sortPills: { key: SortKey; setActive: (on: boolean) => void }[] = [];
    private _filterPills: { key: FilterKey; setActive: (on: boolean) => void }[] = [];
    private _countLabel: Label | null = null;
    private _list: ScrollList | null = null;

    static show(
        parent: Node,
        sim: SimApi,
        model: TownModel,
        onResidentTap: (id: number) => void,
    ): ResidentListPanel {
        const panel = Panel.open(ResidentListPanel, parent, '居民总览', '');
        panel._sim = sim;
        panel._model = model;
        panel._onResidentTap = onResidentTap;
        panel.fill();
        return panel;
    }

    private fill(): void {
        const sim = this._sim;
        const content = this.content;
        if (!sim || !content) return;
        const W = content.getComponent(UITransform)!.width;

        let y = content.getComponent(UITransform)!.height / 2 - 10;

        // ── 汇总 ──
        const sum = sim.summary();
        const rate = sum.workingAge > 0 ? Math.round((sum.employed / sum.workingAge) * 100) : 0;
        y = this.summaryLine(content, W, y, `人口 ${sum.population}`, `就业率 ${rate}%`);
        y = this.summaryLine(content, W, y, `平均工资 ¥${formatNumber(sum.avgSalary)}`, `平均储蓄 ¥${formatNumber(sum.avgSavings)}`);
        y = this.summaryLine(content, W, y, `平均心情 ${Math.round(sum.avgMood)} 分（${moodLabel(sum.avgMood)}）`, '');

        y -= 16;

        // ── 排序 ──
        y = this.pillRow(content, W, y, '排序', SORTS, this._sort, (k) => {
            this._sort = k;
            this.refreshSelection();
            this.rebuildList();
        }, this._sortPills);

        y -= 10;

        // ── 筛选 ──
        y = this.pillRow(content, W, y, '筛选', FILTERS, this._filter, (k) => {
            this._filter = k;
            this.refreshSelection();
            this.rebuildList();
        }, this._filterPills);

        y -= 20;

        // ── 列表 ──
        this._countLabel = makeLabel(content, 'Count', '', UI_FONT.small, UI_COLOR.textDim, W);
        this._countLabel.node.setPosition(0, y, 0);
        y -= 26;

        const bottom = -content.getComponent(UITransform)!.height / 2 + 8;
        const listH = Math.max(120, y - bottom);
        this._list = ScrollList.mount(content, 'List', W, listH);
        this._list.node.setPosition(0, y - listH / 2, 0);

        this.refreshSelection();
        this.rebuildList();
    }

    /** 一屏两列数字 */
    private summaryLine(parent: Node, W: number, y: number, left: string, right: string): number {
        const l = makeLabel(parent, 'SumL', left, UI_FONT.body, UI_COLOR.text, W / 2 - 8);
        l.node.setPosition(-W / 4, y, 0);
        if (right) {
            const r = makeLabel(parent, 'SumR', right, UI_FONT.body, UI_COLOR.text, W / 2 - 8);
            r.node.setPosition(W / 4, y, 0);
        }
        return y - 36;
    }

    /** 一行药丸按钮：左边一个小标题，右边依次排开 */
    private pillRow<K extends string>(
        parent: Node, W: number, y: number,
        title: string,
        items: { key: K; label: string }[],
        current: K,
        onPick: (k: K) => void,
        out: { key: K; setActive: (on: boolean) => void }[],
    ): number {
        const tw = 56;
        const t = makeLabel(parent, 'RowTitle', title, UI_FONT.small, UI_COLOR.textDim, tw);
        t.node.setPosition(-W / 2 + tw / 2, y, 0);

        const PW = 78;
        const PH = 40;
        const GAP = 8;
        let x = -W / 2 + tw + GAP + PW / 2;
        for (const it of items) {
            const pill = makePill(parent, `Pill_${it.key}`, it.label, PW, PH, () => onPick(it.key), this);
            pill.node.setPosition(x, y, 0);
            out.push({ key: it.key, setActive: pill.setActive });
            x += PW + GAP;
        }
        return y - PH - 10;
    }

    private refreshSelection(): void {
        for (const p of this._sortPills) p.setActive(p.key === this._sort);
        for (const p of this._filterPills) p.setActive(p.key === this._filter);
    }

    /** 按当前排序 + 筛选重建列表 */
    private rebuildList(): void {
        const sim = this._sim;
        const list = this._list;
        if (!sim || !list) return;

        const all = sim.state.residents.slice();
        const filtered = all.filter((r) => this.matches(r));

        // 排序：收入/储蓄降序，年龄降序，心情升序（最不爽的先看到）
        filtered.sort((a, b) => {
            switch (this._sort) {
                case 'age': return b.age - a.age;
                case 'savings': return b.savings - a.savings;
                case 'mood': return a.mood - b.mood;
                case 'salary':
                default: return b.salary - a.salary;
            }
        });

        if (this._countLabel) {
            this._countLabel.string = `共 ${all.length} 人，当前显示 ${filtered.length} 人`;
        }

        if (filtered.length === 0) {
            list.node.active = false;
            return;
        }
        list.node.active = true;

        const W = list.node.getComponent(UITransform)!.width;
        const rows: ListRow[] = filtered.map((r) => ({
            height: 60,
            build: (row) => this.buildRow(row, W, r),
        }));
        list.setRows(rows);
    }

    private matches(r: Resident): boolean {
        const workingAge = r.age >= 18 && r.age < 60;
        switch (this._filter) {
            case 'working': return r.jobId !== null;
            case 'jobless': return workingAge && r.jobId === null;
            case 'inactive': return !workingAge;
            case 'all':
            default: return true;
        }
    }

    /** 一行：名字 · 年龄 · 工作 · 收入 · 心情 */
    private buildRow(row: Node, W: number, r: Resident): void {
        const idx = row.getSiblingIndex();
        if (idx % 2 === 0) {
            const g = row.addComponent(Graphics);
            g.fillColor = new Color(255, 255, 255, 12);
            g.rect(-W / 2, -30, W, 60);
            g.fill();
        }

        const name = makeLabel(row, 'Name', r.name, UI_FONT.body, UI_COLOR.gold, 120);
        name.node.setPosition(-W / 2 + 68, 0, 0);

        const age = makeLabel(row, 'Age', `${r.age}`, UI_FONT.small, UI_COLOR.textDim, 56);
        age.node.setPosition(-W / 2 + 156, 0, 0);

        const job = makeLabel(row, 'Job', r.jobTitle || (r.age >= 18 && r.age < 60 ? '待业' : '—'), UI_FONT.small, UI_COLOR.text, 190);
        job.node.setPosition(-W / 2 + 286, 0, 0);

        const pay = makeLabel(row, 'Pay', r.salary > 0 ? `¥${formatNumber(r.salary)}` : '—', UI_FONT.small, UI_COLOR.text, 110);
        pay.node.setPosition(-W / 2 + 436, 0, 0);

        const mood = makeLabel(row, 'Mood', `${Math.round(r.mood)}`, UI_FONT.body, moodColor(r.mood), 60);
        mood.node.setPosition(W / 2 - 42, 0, 0);

        row.on(Node.EventType.TOUCH_END, () => {
            if (this._onResidentTap) this._onResidentTap(r.id);
        }, this);
    }
}
