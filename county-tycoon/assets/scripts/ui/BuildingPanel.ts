import { _decorator, Color, JsonAsset, Node, resources } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { BuildingSim, Resident } from '../core/sim/types';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { Panel } from './Panel';
import { buildPersonRow } from './PersonRow';
import { ListRow, ScrollList } from './ScrollList';
import {
    formatMoney, formatNumber, makeButton, makeLabel, makeLabelLeft, makeLabelRight, makeSectionTitle, makeStatTile,
    moodColor, UI_COLOR, UI_FONT, UI_PALETTE,
} from './UiTheme';

const { ccclass } = _decorator;

/** 住户 / 员工名单里点一个名字 */
export type ResidentTapHandler = (residentId: number) => void;

/**
 * 建筑详情（T308，T406 改成白色抽屉）。
 *
 * 顶部一排数值格：
 *   住宅：住户人数 / 平均心情 / 有工作的人数
 *   店铺 / 工厂 / 公共：上月营业额 / 服务人次 / 上交税款
 * 下面是名单（住户或员工），一行 = 名字（蓝，可点）· 年龄 · 工作 · 心情。
 * 标题行右侧（关闭按钮左边）是「换朝向」按钮。
 *
 * 模拟层没有这栋的数据时，数值格显示 0，名单处写「暂无经营数据」，不能让玩家点了没反应。
 */
@ccclass('BuildingPanel')
export class BuildingPanel extends Panel {
    protected cardH = 760;

    private _sim: SimApi | null = null;
    private _placed: PlacedBuilding | null = null;
    private _onResidentTap: ResidentTapHandler | null = null;
    /** 换朝向（GameRoot 接到 WorldView）。返回 false = 这栋楼没有第二个朝向 */
    private _toggleFacing: ((uid: number) => boolean) | null = null;
    /** 往顶栏第二行打一句提示（UiRoot 给） */
    private _onHint: ((text: string) => void) | null = null;
    private _facingBtn: ReturnType<typeof makeButton> | null = null;
    private _list: ScrollList | null = null;

    /** 打开某栋建筑；找不到返回 null（比如 uid 已过期） */
    static show(
        parent: Node,
        sim: SimApi,
        model: TownModel,
        uid: number,
        onResidentTap: ResidentTapHandler,
        toggleFacing: ((uid: number) => boolean) | null,
        onHint: ((text: string) => void) | null = null,
    ): BuildingPanel | null {
        const placed = model.allBuildings().find((b) => b.uid === uid) ?? null;
        if (!placed) return null;

        const panel = Panel.open(BuildingPanel, parent, placed.def.name, placed.def.category);
        panel._sim = sim;
        panel._placed = placed;
        panel._onResidentTap = onResidentTap;
        panel._toggleFacing = toggleFacing;
        panel._onHint = onHint;
        panel.fill();
        panel.buildFacingButton();
        return panel;
    }

    /** 这种住宅能住几人；配置还没加载到返回 0（只显示住户数） */
    private static housingOf(defId: string): number {
        const asset = resources.get('config/economy', JsonAsset);
        const list = asset && asset.json ? (asset.json as { buildings?: { id: string; housing?: number }[] }).buildings : null;
        const b = Array.isArray(list) ? list.find((x) => x && x.id === defId) : null;
        return b && typeof b.housing === 'number' ? b.housing : 0;
    }

    private fill(): void {
        const sim = this._sim;
        const placed = this._placed;
        const content = this.content;
        if (!sim || !placed || !content) return;

        const b = sim.building(placed.uid);
        const isHome = placed.def.category === '住宅';
        const people = isHome ? this.collect(b, 'home') : this.collect(b, 'work');
        const W = this.contentW;
        let y = this.contentTop;

        // ── 数值格 ──
        const tileH = 108, gap = 16;
        const tileW = (W - gap * 2) / 3;
        const tiles: [string, string, Color][] = [];
        if (isHome) {
            const avgMood = people.length > 0 ? people.reduce((s, r) => s + r.mood, 0) / people.length : 0;
            const working = people.filter((r) => r.jobId !== null).length;
            // 住户 / 能住几人（economy.json 的 housing，建造栏已经加载过，这里直接取缓存）
            const cap = BuildingPanel.housingOf(placed.def.id);
            const full = cap > 0 && people.length >= cap;   // 住满：不再生孩子、不再迁入，标在名字上，不用红色（住满不是坏事）
            tiles.push([full ? '住户（已满）' : '住户', cap > 0 ? `${people.length} / ${cap} 人` : `${people.length} 人`, UI_PALETTE.blue]);
            tiles.push(['平均幸福度', people.length > 0 ? `${Math.round(avgMood)}` : '—', people.length > 0 ? moodColor(avgMood) : UI_COLOR.textDim]);
            tiles.push(['有工作', `${working} 人`, UI_PALETTE.green]);
        } else {
            const profit = b ? (b.lastProfit ?? 0) : 0;
            tiles.push(['上月营业额', formatMoney(b ? b.lastRevenue : 0), UI_COLOR.gold]);
            tiles.push(['服务人次', formatNumber(b ? Math.round(b.lastCustomers) : 0), UI_PALETTE.blue]);
            tiles.push(['上月利润', formatMoney(Math.round(profit)), profit >= 0 ? UI_PALETTE.green : UI_PALETTE.coral]);
        }
        for (let i = 0; i < tiles.length; i++) {
            const t = makeStatTile(content, tileW, tileH, tiles[i][0], tiles[i][1], tiles[i][2]);
            t.node.setPosition(-W / 2 + tileW / 2 + i * (tileW + gap), y - tileH / 2, 0);
        }
        y -= tileH + 36;

        // ── 上月账目（D026 真实账目）：营业额 − 工资 − 成本 − 税 − 维护 = 利润 ──
        if (!isHome && b && (b.lastRevenue || b.lastWages || b.lastUpkeep)) {
            const rows: [string, number][] = [
                ['营业额', b.lastRevenue],
                ['员工工资', -(b.lastWages ?? 0)],
                ['进货 / 原料成本', -(b.lastCost ?? 0)],
                ['上交税款', -b.lastTax],
                ['维护费', -(b.lastUpkeep ?? 0)],
            ];
            if (b.lastOutside) rows.splice(1, 0, ['　其中过路客', b.lastOutside]);
            for (const [label, v] of rows) {
                const l = makeLabelLeft(content, 'AccL', label, UI_FONT.small, UI_COLOR.textDim, W * 0.6);
                l.node.setPosition(-W / 2, y, 0);
                const r = makeLabelRight(content, 'AccV', formatMoney(Math.round(v)), UI_FONT.small, v < 0 ? UI_COLOR.down : UI_COLOR.text, W * 0.4);
                r.node.setPosition(W / 2, y, 0);
                y -= 30;
            }
            if (b.owner === 'private') {
                const tb = (b.taxBreakUntil ?? 0) > sim.state.month ? `，让税还剩 ${(b.taxBreakUntil ?? 0) - sim.state.month} 天` : '';
                const pl = makeLabelLeft(content, 'Owner', `招商引进的私营企业：利润归企业，县里收税${tb}`, UI_FONT.small, UI_PALETTE.blue, W);
                pl.node.setPosition(-W / 2, y, 0);
                y -= 30;
            }
            if ((b.lossMonths ?? 0) > 0) {
                const warn = makeLabelLeft(content, 'Loss', `已连续亏损 ${b.lossMonths} 个月，满 3 个月会裁员`, UI_FONT.small, UI_COLOR.down, W);
                warn.node.setPosition(-W / 2, y, 0);
                y -= 30;
            }
            y -= 12;
        }

        // ── 名单 ──
        makeSectionTitle(content, W, y, isHome ? '住户名单' : '员工名单');
        const count = makeLabelRight(content, 'Count', `${people.length} 人`, UI_FONT.small, UI_COLOR.textDim, 160);
        count.node.setPosition(W / 2, y, 0);
        y -= 30;

        const bottom = -this.contentH / 2;
        const listH = Math.max(120, y - bottom);
        const list = ScrollList.mount(content, 'List', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);
        this._list = list;

        if (people.length === 0) {
            const text = !b ? '暂无经营数据' : (isHome ? '暂时没有住户' : '暂时没有员工');
            const empty = makeLabel(content, 'Empty', text, UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(0, y - Math.min(listH, 160) / 2, 0);
            list.node.active = false;
            return;
        }

        const rows: ListRow[] = people.map((r) => ({
            height: 76,
            build: (row) => this.buildPersonRow(row, r),
        }));
        list.setRows(rows);
    }

    /**
     * 「换朝向」按钮：标题行、关闭按钮左边。
     * 行道树、广场这类只有一个朝向的，点了返回 false —— 按钮变灰改字，不让玩家反复点却没反应。
     */
    private buildFacingButton(): void {
        const card = this.card;
        const placed = this._placed;
        if (!card || !placed) return;
        // 贴地的（马路、桥）没有门面，没有朝向可换
        if (placed.def.flat) return;
        const head = card.getChildByName('Header');
        if (!head) return;

        const cw = this.cardW;
        const W = 148, H = 52;
        const btn = makeButton(head, 'FacingBtn', '换朝向', W, H, 'secondary', () => this.toggleFacing(), 'rotate');
        // 关闭按钮中心在 cw/2 - PAD_X - 28 + 8，半径 28
        btn.node.setPosition(cw / 2 - Panel.PAD_X - 56 - 14 - W / 2 + 8, Panel.HEAD_H / 2 - 60, 0);
        this._facingBtn = btn;
    }

    private toggleFacing(): void {
        const placed = this._placed;
        if (!placed || !this._toggleFacing) return;

        if (this._toggleFacing(placed.uid)) {
            if (this._onHint) this._onHint(`已换朝向：${placed.def.name}`);
            return;
        }
        if (this._facingBtn) {
            this._facingBtn.label.string = '只有一个朝向';
            this._facingBtn.setEnabled(false);
        }
        if (this._onHint) this._onHint(`${placed.def.name} 没有第二个朝向`);
    }

    /** 住户 / 员工 */
    private collect(b: BuildingSim | null, kind: 'home' | 'work'): Resident[] {
        const sim = this._sim;
        if (!sim || !b) return [];
        const ids = kind === 'home' ? b.residentIds : b.workerIds;
        const out: Resident[] = [];
        for (const id of ids) {
            const r = sim.resident(id);
            if (r) out.push(r);
        }
        return out;
    }

    /** 名单一行：头像 · 名字 · 年龄工作 · 心情 */
    private buildPersonRow(row: Node, r: Resident): void {
        buildPersonRow(row, r, this._list, this._onResidentTap,
            { caption: '幸福度', value: `${Math.round(r.mood)}`, color: moodColor(r.mood) });
    }
}
