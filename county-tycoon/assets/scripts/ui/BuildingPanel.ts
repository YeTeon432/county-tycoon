import { _decorator, Color, Graphics, Label, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { BuildingSim, Resident } from '../core/sim/types';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import { formatNumber, makeLabel, makePill, UI_COLOR, UI_FONT } from './UiTheme';

const { ccclass } = _decorator;

/** 住户 / 员工名单里点一个名字 */
export type ResidentTapHandler = (residentId: number) => void;

/**
 * 建筑详情（T308）。
 *
 * 住宅：住几人 / 容量 + 住户名单（名字 · 年龄 · 工作）
 * 店铺 / 工厂 / 公共：员工名单 + 上月营业额、服务人次、上交税款
 * 点名单里的人 → 打开他的档案（由外面接）。
 *
 * 数据来源两种：
 *   - 建筑的名称、类别、占格：TownModel 里的 PlacedBuilding（一定有）
 *   - 住的是谁、赚了多少：SimApi.building(uid)（现在是 MockSim，可能没有这一栋）
 * 模拟层没有这栋的数据时，上半部分照样显示建筑信息，下半部分显示"暂无经营数据"，
 * 不能让玩家点了没反应。
 */
@ccclass('BuildingPanel')
export class BuildingPanel extends Panel {
    private _sim: SimApi | null = null;
    private _placed: PlacedBuilding | null = null;
    private _onResidentTap: ResidentTapHandler | null = null;
    /** 换朝向（GameRoot 接到 WorldView）。返回 false = 这栋楼没有第二个朝向 */
    private _toggleFacing: ((uid: number) => boolean) | null = null;
    /** 往顶栏第二行打一句提示（UiRoot 给） */
    private _onHint: ((text: string) => void) | null = null;
    private _facingBtnLabel: Label | null = null;
    private _facingPill: { setActive: (on: boolean) => void } | null = null;

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

    private fill(): void {
        const sim = this._sim;
        const placed = this._placed;
        const content = this.content;
        if (!sim || !placed || !content) return;

        const b = sim.building(placed.uid);
        const isHome = placed.def.category === '住宅';
        const staff = this.collectStaff(b);
        const residents = this.collectResidents(b);

        let y = 300;
        const W = content.getComponent(UITransform)!.width;

        // ── 上半：经营数字 ──
        if (isHome) {
            y = this.statLine(content, y, `住户 ${residents.length} 人`, UI_COLOR.text);
        } else {
            const rev = b ? b.lastRevenue : 0;
            const cust = b ? b.lastCustomers : 0;
            const tax = b ? b.lastTax : 0;
            y = this.statLine(content, y, `上月营业额 ¥${formatNumber(rev)}`, UI_COLOR.gold);
            y = this.statLine(content, y, `服务 ${formatNumber(cust)} 人次　上交 ¥${formatNumber(tax)}`, UI_COLOR.textDim);
        }

        // 备注：模拟层还没这栋的数据
        if (!b) {
            const note = makeLabel(content, 'Note', '暂无经营数据（模拟层未接入这栋建筑）', UI_FONT.small, UI_COLOR.textDim, W);
            note.node.setPosition(0, y, 0);
            y -= 40;
        }

        // ── 下半：名单 ──
        const listTitle = isHome ? '住户名单' : '员工名单';
        const head = makeLabel(content, 'ListTitle', listTitle, UI_FONT.body, UI_COLOR.text, W);
        head.node.setPosition(0, y, 0);
        // 标题本身有半个行高（约 15），再留 34 才够第一行不贴着标题
        y -= 52;

        // 列表占掉标题以下的全部空间。content 是 (cardH-120) 高、原点在中间（见 Panel.buildShell），
        // 所以它的底边是 -(cardH-120)/2；留 8 给圆角。
        const contentH = content.getComponent(UITransform)!.height;
        const bottom = -contentH / 2 + 8;
        const listH = Math.max(120, y - bottom);
        const list = ScrollList.mount(content, 'List', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);

        const people = isHome ? residents : staff;
        if (people.length === 0) {
            const empty = makeLabel(content, 'Empty', isHome ? '暂时没有住户' : '暂时没有员工', UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(0, y - listH / 2, 0);
            list.node.active = false;
            return;
        }

        const rows: ListRow[] = people.map((r) => ({
            height: 64,
            build: (row) => this.buildPersonRow(row, r),
        }));
        list.setRows(rows);
    }

    /**
     * 「换朝向」按钮：原来「空手点一下就转」的交互，现在收到详情面板里。
     *
     * 位置在卡片标题行、关闭按钮左边。不占内容区，名单不会因为它少一行。
     * 行道树、广场这类只有一个朝向的建筑，点了会返回 false —— 按钮变灰并提示一句，
     * 不让玩家反复点却没反应。
     */
    private buildFacingButton(): void {
        const card = this.card;
        const placed = this._placed;
        if (!card || !placed) return;
        // 贴地的（马路、桥）没有门面，没有朝向可换
        if (placed.def.flat) return;

        const cw = card.getComponent(UITransform)!.width;
        const ch = card.getComponent(UITransform)!.height;
        const W = 108;
        const H = 40;

        const btn = makePill(card, 'FacingBtn', '换朝向', W, H, () => {
            this.toggleFacing();
        }, this);
        btn.node.setPosition(cw / 2 - 60 - W / 2 - 10, ch / 2 - 46, 0);
        // 类别小字往左让出按钮的位置，否则两个会叠在一起
        if (this.subtitleLabel) {
            this.subtitleLabel.node.setPosition(cw / 2 - 60 - W - 22, ch / 2 - 46, 0);
        }
        this._facingBtnLabel = btn.label;
        this._facingPill = btn;
    }

    private toggleFacing(): void {
        const placed = this._placed;
        if (!placed || !this._toggleFacing) return;

        if (this._toggleFacing(placed.uid)) {
            if (this._onHint) this._onHint(`已换朝向：${placed.def.name}`);
            return;
        }
        // 没有第二个朝向（行道树、广场只有一张图）：按钮变灰并改字，别让玩家反复点却没反应
        if (this._facingBtnLabel) this._facingBtnLabel.string = '只有一个朝向';
        if (this._facingPill) this._facingPill.setActive(false);
        if (this._onHint) this._onHint(`${placed.def.name} 没有第二个朝向`);
    }

    /** 住户：住在这里的居民 */
    private collectResidents(b: BuildingSim | null): Resident[] {
        const sim = this._sim;
        if (!sim || !b) return [];
        const out: Resident[] = [];
        for (const id of b.residentIds) {
            const r = sim.resident(id);
            if (r) out.push(r);
        }
        return out;
    }

    /** 员工：在这里上班的居民 */
    private collectStaff(b: BuildingSim | null): Resident[] {
        const sim = this._sim;
        if (!sim || !b) return [];
        const out: Resident[] = [];
        for (const id of b.workerIds) {
            const r = sim.resident(id);
            if (r) out.push(r);
        }
        return out;
    }

    /** 一行数字，返回下一行的 y */
    private statLine(parent: Node, y: number, text: string, color: Color): number {
        const W = parent.getComponent(UITransform)!.width;
        const label = makeLabel(parent, 'Stat', text, UI_FONT.body, color, W);
        label.node.setPosition(0, y, 0);
        return y - 34;
    }

    /** 名单一行：名字（可点）· 年龄 · 工作 */
    private buildPersonRow(row: Node, r: Resident): void {
        const W = row.getComponent(UITransform)!.width;

        // 隔一行一条淡底色，长名单不容易看串行
        if (row.parent && (row.getSiblingIndex() % 2 === 0)) {
            const g = row.addComponent(Graphics);
            g.fillColor = new Color(255, 255, 255, 12);
            g.rect(-W / 2, -32, W, 64);
            g.fill();
        }

        const name = makeLabel(row, 'Name', r.name, UI_FONT.body, UI_COLOR.gold, 150);
        name.node.setPosition(-W / 2 + 85, 0, 0);

        const job = r.jobTitle ? r.jobTitle : (r.age >= 18 && r.age < 60 ? '待业' : '—');
        const info = makeLabel(row, 'Info', `${r.age} 岁　${job}`, UI_FONT.small, UI_COLOR.textDim, W - 190);
        info.node.setPosition(20, 0, 0);
        info.horizontalAlign = Label.HorizontalAlign.LEFT;
        info.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);

        // 整行可点，比只点名字好按（手机上一行 64 高，够手指了）
        row.on(Node.EventType.TOUCH_END, () => {
            if (this._onResidentTap) this._onResidentTap(r.id);
        }, this);
    }
}
