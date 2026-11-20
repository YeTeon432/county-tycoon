import { _decorator, Color, Label, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { Resident } from '../core/sim/types';
import { TownModel } from '../core/TownModel';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import { buildPersonRow } from './PersonRow';
import { formatMoney, makeLabelLeft, makePill, makeStatTile, moodColor, UI_COLOR, UI_FONT, UI_PALETTE } from './UiTheme';

const { ccclass } = _decorator;

/** 排序字段 */
type SortKey = 'age' | 'salary' | 'savings' | 'mood';
/** 筛选：全部 / 上班 / 待业 / 老人小孩 */
type FilterKey = 'all' | 'working' | 'jobless' | 'inactive';

const SORTS: { key: SortKey; label: string }[] = [
    { key: 'salary', label: '按收入' },
    { key: 'age', label: '按年龄' },
    { key: 'savings', label: '按储蓄' },
    { key: 'mood', label: '按幸福度' },
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
        const panel = Panel.open(ResidentListPanel, parent, '居民总览', '', 'residents');
        panel._sim = sim;
        panel._model = model;
        panel._onResidentTap = onResidentTap;
        panel.renderPage = () => {
            panel._sortPills = [];
            panel._filterPills = [];
            panel.fill();
        };
        panel.renderPage();
        return panel;
    }

    private fill(): void {
        const sim = this._sim;
        const content = this.content;
        if (!sim || !content) return;
        const W = this.contentW;
        let y = this.contentTop;

        // ── 汇总：两排数值格 ──
        const sum = sim.summary();
        const rate = sum.workingAge > 0 ? Math.round((sum.employed / sum.workingAge) * 100) : 0;
        const carRate = sum.population > 0 ? Math.round(((sum.vehicles ?? 0) / sum.population) * 100) : 0;
        const tiles: [string, string, Color][] = [
            ['人口', `${sum.population}`, UI_PALETTE.blue],
            ['就业率', `${rate}%`, rate >= 60 ? UI_PALETTE.green : UI_COLOR.down],
            ['平均幸福度', sum.population > 0 ? `${Math.round(sum.avgMood)}` : '—', sum.population > 0 ? moodColor(sum.avgMood) : UI_COLOR.textDim],
            ['平均工资', formatMoney(sum.avgSalary), UI_COLOR.gold],
            ['平均储蓄', formatMoney(sum.avgSavings), UI_COLOR.gold],
            ['有车率', `${carRate}%`, UI_PALETTE.blue],
        ];
        const tileH = 96, gap = 14;
        const tileW = (W - gap * 2) / 3;
        for (let i = 0; i < tiles.length; i++) {
            const col = i % 3, rowI = Math.floor(i / 3);
            const t = makeStatTile(content, tileW, tileH, tiles[i][0], tiles[i][1], tiles[i][2]);
            t.node.setPosition(-W / 2 + tileW / 2 + col * (tileW + gap), y - tileH / 2 - rowI * (tileH + gap), 0);
        }
        y -= tileH * 2 + gap + 34;

        // ── 排序 / 筛选 ──
        y = this.pillRow(content, W, y, '排序', SORTS, this._sort, (k) => {
            this._sort = k;
            this.refreshSelection();
            this.rebuildList();
        }, this._sortPills);
        y -= 4;
        y = this.pillRow(content, W, y, '筛选', FILTERS, this._filter, (k) => {
            this._filter = k;
            this.refreshSelection();
            this.rebuildList();
        }, this._filterPills);
        y -= 6;

        // ── 列表 ──
        this._countLabel = makeLabelLeft(content, 'Count', '', UI_FONT.small, UI_COLOR.textDim, W);
        this._countLabel.node.setPosition(-W / 2, y, 0);
        y -= 24;

        const bottom = -this.contentH / 2;
        const listH = Math.max(120, y - bottom);
        this._list = ScrollList.mount(content, 'List', W, listH);
        this._list.node.setPosition(0, y - listH / 2, 0);

        this.refreshSelection();
        this.rebuildList();
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
        const PH = 48;
        const t = makeLabelLeft(parent, 'RowTitle', title, UI_FONT.small, UI_COLOR.textDim, 60);
        t.node.setPosition(-W / 2, y - PH / 2, 0);

        const left = -W / 2 + 64;
        const GAP = 10;
        const PW = (W / 2 - left - GAP * (items.length - 1)) / items.length;
        let x = left + PW / 2;
        for (const it of items) {
            const pill = makePill(parent, `Pill_${it.key}`, it.label, PW, PH, () => onPick(it.key), this);
            pill.node.setPosition(x, y - PH / 2, 0);
            out.push({ key: it.key, setActive: pill.setActive });
            x += PW + GAP;
        }
        return y - PH - 12;
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
            height: 76,
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

    /** 一行：头像 · 名字 / 年龄工作心情 · 右侧月薪 */
    private buildRow(row: Node, W: number, r: Resident): void {
        const job = r.jobTitle || (r.idle ? '赋闲' : r.age >= 18 && r.age < 60 ? '待业' : '—');
        buildPersonRow(row, r, this._list, this._onResidentTap,
            { caption: '月薪', value: r.salary > 0 ? formatMoney(r.salary) : '—', color: r.salary > 0 ? UI_COLOR.gold : UI_COLOR.textDim },
            `${r.age} 岁 · ${job} · 幸福度 ${Math.round(r.mood)}`);
    }
}
