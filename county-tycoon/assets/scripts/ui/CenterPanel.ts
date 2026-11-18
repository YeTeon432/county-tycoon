import { _decorator, Color, Graphics, Label, Node } from 'cc';
import { GoalStatus, ResearchStatus, SimApi } from '../core/sim/SimApi';
import { TownLevel } from '../core/sim/types';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import {
    formatMoney, makeButton, makeLabel, makeLabelLeft, makeLabelRight, makePanelNode, UI_COLOR, UI_FONT, UI_PALETTE, UI_RADIUS,
} from './UiTheme';

const { ccclass } = _decorator;

type Tab = 'goals' | 'research' | 'invest' | 'streets';
const TABS: { key: Tab; label: string }[] = [
    { key: 'goals', label: '发展目标' },
    { key: 'research', label: '产业研究' },
    { key: 'invest', label: '招商引资' },
    { key: 'streets', label: '特色街道' },
];
const LEVEL_NAME: Record<TownLevel, string> = { village: '村口', town: '镇上', county: '县城', city: '县级市', top100: '百强县' };
const NEXT: Partial<Record<TownLevel, TownLevel>> = { village: 'town', town: 'county', county: 'city', city: 'top100' };

/**
 * 县发展中心面板（D026，DESIGN 18 / 19 / 26）：点开局那栋县发展中心打开。
 *   发展目标：当前等级的几个目标 + 进度，全完成后「申请升级」
 *   产业研究：每项的费用、天数、前置条件；一次研究一项
 *   招商引资 / 特色街道：第三、四批再做，先占位
 */
@ccclass('CenterPanel')
export class CenterPanel extends Panel {
    protected cardH = 1100;

    private _sim: SimApi | null = null;
    private _tab: Tab = 'goals';
    private _body: Node | null = null;
    private _tabNodes: { key: Tab; g: Graphics; label: Label; w: number }[] = [];
    /** 升级成功（UiRoot 播庆祝） */
    onUpgraded: ((level: TownLevel) => void) | null = null;
    /** 开始研究后（刷新底栏、顶栏资金） */
    onChanged: (() => void) | null = null;
    /** 研究失败的原因等（UiRoot 接到提示条） */
    onHint: ((text: string) => void) | null = null;
    /** 招商供地签约后：去地图上选址（UiRoot 关面板 + 选中建筑） */
    onPlace: ((defId: string) => void) | null = null;
    /** 建筑 id → 名字 */
    nameOf: (id: string) => string = (id) => id;
    private _taxBreak = false;

    static show(parent: Node, sim: SimApi, tab: Tab = 'goals', toggleFacing: (() => boolean) | null = null): CenterPanel {
        const p = Panel.open(CenterPanel, parent, '县发展中心', LEVEL_NAME[sim.state.level]);
        p._sim = sim;
        p._tab = tab;
        p.buildTabs();
        p.fill();
        if (toggleFacing) p.buildFacingButton(toggleFacing);
        return p;
    }

    /** 标题行右边的「换朝向」（和建筑详情同一个位置、同一种按钮） */
    private buildFacingButton(toggle: () => boolean): void {
        const head = this.card ? this.card.getChildByName('Header') : null;
        if (!head) return;
        const W = 148, H = 52;
        const btn = makeButton(head, 'FacingBtn', '换朝向', W, H, 'secondary', () => {
            if (!toggle() && this.onHint) this.onHint('这栋楼只有一个朝向');
        }, 'rotate');
        btn.node.setPosition(this.cardW / 2 - Panel.PAD_X - 56 - 14 - W / 2 + 8, Panel.HEAD_H / 2 - 60, 0);
    }

    private get W(): number {
        return this.contentW;
    }

    private buildTabs(): void {
        const content = this.content!;
        const W = this.W, h = 56, gap = 10;
        const w = (W - gap * (TABS.length - 1)) / TABS.length;
        TABS.forEach((t, i) => {
            const n = makePanelNode(content, `Tab_${t.key}`, w, h);
            n.setPosition(-W / 2 + w / 2 + i * (w + gap), this.contentTop - h / 2, 0);
            const g = n.addComponent(Graphics);
            const label = makeLabel(n, 'Txt', t.label, UI_FONT.small, UI_COLOR.textDim, w - 8);
            n.on(Node.EventType.TOUCH_END, () => { this._tab = t.key; this.fill(); }, this);
            this._tabNodes.push({ key: t.key, g, label, w });
        });
    }

    private drawTabs(): void {
        const h = 56;
        for (const t of this._tabNodes) {
            const on = t.key === this._tab;
            t.g.clear();
            t.g.fillColor = on ? UI_PALETTE.blue : UI_COLOR.button;
            t.g.roundRect(-t.w / 2, -h / 2, t.w, h, h / 2);
            t.g.fill();
            t.label.color = on ? UI_PALETTE.white : UI_COLOR.textDim;
            t.label.isBold = on;
        }
    }

    /** 重画当前页签（研究开始、升级之后也调） */
    fill(): void {
        if (!this.content || !this._sim) return;
        this.drawTabs();
        if (this._body) this._body.destroy();
        const top = this.contentTop - 56 - 24;
        const H = top + this.contentH / 2;
        const body = makePanelNode(this.content, 'Body', this.W, H);
        body.setPosition(0, top - H / 2, 0);
        this._body = body;
        if (this._tab === 'goals') this.fillGoals(body, H);
        else if (this._tab === 'research') this.fillResearch(body, H);
        else if (this._tab === 'streets') this.fillStreets(body, H);
        else this.fillInvest(body, H);
    }

    // ───────────────────────── 发展目标 ─────────────────────────

    private fillGoals(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const goals: GoalStatus[] = sim.goals ? sim.goals() : [];
        const next = NEXT[sim.state.level];
        let y = H / 2;
        const head = makeLabelLeft(body, 'Head', next ? `升级到「${LEVEL_NAME[next]}」需要：` : '已经是最高等级', UI_FONT.body, UI_COLOR.text, W);
        head.isBold = true;
        head.node.setPosition(-W / 2, y - 18, 0);
        y -= 56;
        const rowH = 84;
        for (const g of goals) {
            const n = makePanelNode(body, 'Goal', W, rowH - 12);
            n.setPosition(0, y - (rowH - 12) / 2, 0);
            const bg = n.addComponent(Graphics);
            bg.fillColor = g.done ? new Color(232, 246, 232, 255) : UI_COLOR.block;
            bg.roundRect(-W / 2, -(rowH - 12) / 2, W, rowH - 12, UI_RADIUS);
            bg.fill();
            // 勾 / 圈
            bg.fillColor = g.done ? UI_PALETTE.green : UI_COLOR.border;
            bg.circle(-W / 2 + 34, 0, 16);
            bg.fill();
            if (g.done) {
                bg.strokeColor = UI_PALETTE.white;
                bg.lineWidth = 4;
                bg.moveTo(-W / 2 + 26, 0); bg.lineTo(-W / 2 + 32, -7); bg.lineTo(-W / 2 + 43, 7);
                bg.stroke();
            }
            const t = makeLabelLeft(n, 'Text', g.text, UI_FONT.body, g.done ? UI_COLOR.up : UI_COLOR.text, W - 260);
            t.node.setPosition(-W / 2 + 64, 0, 0);
            const v = makeLabelRight(n, 'Val', this.goalValue(g), UI_FONT.body, g.done ? UI_COLOR.up : UI_COLOR.textDim, 180);
            v.node.setPosition(W / 2 - 20, 0, 0);
            y -= rowH;
        }
        if (!next) return;
        const all = goals.length > 0 && goals.every((g) => g.done);
        y -= 12;
        const btn = makeButton(body, 'Upgrade', all ? `申请升级为「${LEVEL_NAME[next]}」` : `还差 ${goals.filter((g) => !g.done).length} 项`, W, 88,
            all ? 'primary' : 'secondary', () => {
                if (!all || !sim.upgradeLevel) return;
                const lv = sim.upgradeLevel();
                if (lv) {
                    if (this.onUpgraded) this.onUpgraded(lv);
                    this.close();
                }
            });
        btn.setEnabled(all);
        btn.node.setPosition(0, y - 44, 0);
        y -= 120;
        const tip = makeLabel(body, 'Tip', '升级后解锁更多产业研究，上级还会拨一笔发展奖励', UI_FONT.small, UI_COLOR.textDim, W);
        tip.node.setPosition(0, y, 0);
    }

    private goalValue(g: GoalStatus): string {
        if (g.target > 0 && g.target < 1) return `${Math.round(g.value * 100)}% / ${Math.round(g.target * 100)}%`;
        return `${Math.round(g.value)} / ${g.target}`;
    }

    // ───────────────────────── 产业研究 ─────────────────────────

    private fillResearch(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const all: ResearchStatus[] = sim.researchList ? sim.researchList() : [];
        // 正在研究的在最上面，然后能研究的、条件不够的，最后研究完的
        const order = { active: 0, ready: 1, locked: 2, done: 3 };
        const items = all.slice().sort((a, b) => order[a.state] - order[b.state]);
        const intro = makeLabelLeft(body, 'Intro', '新产业要先研究才能盖。一次研究一项，研究期间照常经营。', UI_FONT.small, UI_COLOR.textDim, W);
        intro.node.setPosition(-W / 2, H / 2 - 16, 0);
        const listH = H - 44;
        const list = ScrollList.mount(body, 'List', W, listH);
        list.node.setPosition(0, H / 2 - 44 - listH / 2, 0);
        const rows: ListRow[] = items.map((r) => ({ height: 118, build: (row) => this.researchRow(row, W, r) }));
        list.setRows(rows);
    }

    private researchRow(row: Node, W: number, r: ResearchStatus): void {
        const h = 106;
        const g = row.addComponent(Graphics);
        g.fillColor = r.state === 'active' ? new Color(232, 241, 252, 255) : r.state === 'done' ? new Color(246, 247, 249, 255) : UI_COLOR.block;
        g.roundRect(-W / 2, -h / 2, W, h, UI_RADIUS);
        g.fill();
        const name = makeLabelLeft(row, 'Name', r.name, UI_FONT.body, r.state === 'done' ? UI_COLOR.textDim : UI_COLOR.text, W - 240);
        name.isBold = true;
        name.node.setPosition(-W / 2 + 20, 22, 0);
        const sub = r.state === 'done' ? '已研究，可以盖了'
            : r.state === 'active' ? `研究中 · ${r.reason}`
                : r.state === 'locked' ? r.reason
                    : `${formatMoney(r.cost)} · ${r.days} 天`;
        const subL = makeLabelLeft(row, 'Sub', sub, UI_FONT.small, r.state === 'locked' ? UI_COLOR.down : UI_COLOR.textDim, W - 240);
        subL.node.setPosition(-W / 2 + 20, -20, 0);
        if (r.state === 'active') {
            const bw = W - 260;
            g.fillColor = UI_COLOR.border;
            g.roundRect(-W / 2 + 20, -h / 2 + 12, bw, 8, 4);
            g.fill();
            g.fillColor = UI_PALETTE.blue;
            g.roundRect(-W / 2 + 20, -h / 2 + 12, Math.max(8, bw * r.progress), 8, 4);
            g.fill();
        }
        if (r.state === 'ready' || r.state === 'locked') {
            const btn = makeButton(row, 'Go', r.state === 'ready' ? `研究 ${formatMoney(r.cost)}` : `${formatMoney(r.cost)} · ${r.days} 天`, 210, 64,
                r.state === 'ready' ? 'primary' : 'secondary', () => this.beginResearch(r));
            btn.setEnabled(r.state === 'ready');
            btn.node.setPosition(W / 2 - 20 - 105, 0, 0);
        }
    }

    private beginResearch(r: ResearchStatus): void {
        const sim = this._sim;
        if (!sim || !sim.startResearch) return;
        const err = sim.startResearch(r.id);
        if (err) { if (this.onHint) this.onHint(err); return; }
        if (this.onHint) this.onHint(`开始研究「${r.name}」，${r.days} 天后完成`);
        if (this.onChanged) this.onChanged();
        this.fill();
    }

    // ───────────────────────── 特色街道图鉴（DESIGN 21） ─────────────────────────

    private fillStreets(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const book = sim.streetBook ? sim.streetBook() : [];
        const intro = makeLabelLeft(body, 'Intro', '同一条路边、沿路 4 格内凑齐下面这几家，就成了特色街道。放店时能凑成，顶上会提示。', UI_FONT.small, UI_COLOR.textDim, W);
        intro.overflow = Label.Overflow.SHRINK;
        intro.node.setPosition(-W / 2, H / 2 - 16, 0);
        const listH = H - 48;
        const list = ScrollList.mount(body, 'List', W, listH);
        list.node.setPosition(0, H / 2 - 48 - listH / 2, 0);
        list.setRows(book.map((b) => ({ height: 158, build: (row: Node) => {
            const h = 146;
            const done = b.count > 0;
            const g = row.addComponent(Graphics);
            g.fillColor = done ? new Color(232, 246, 232, 255) : UI_COLOR.block;
            g.roundRect(-W / 2, -h / 2, W, h, UI_RADIUS);
            g.fill();
            const name = makeLabelLeft(row, 'Name', b.name, UI_FONT.body, done ? UI_COLOR.up : UI_COLOR.text, W - 200);
            name.isBold = true;
            name.node.setPosition(-W / 2 + 20, 46, 0);
            const st = makeLabelRight(row, 'St', done ? `已凑成 ${b.count} 条` : '还没凑成', UI_FONT.small, done ? UI_COLOR.up : UI_COLOR.textDim, 180);
            st.node.setPosition(W / 2 - 20, 46, 0);
            const members = b.members.map((m) => this.nameOf(m) + (b.lockedMembers.indexOf(m) >= 0 ? '（未研究）' : '')).join(' + ');
            const ml = makeLabelLeft(row, 'Mem', `组合：${members}`, UI_FONT.small, b.lockedMembers.length ? UI_COLOR.down : UI_COLOR.text, W - 40);
            ml.overflow = Label.Overflow.SHRINK;
            ml.node.setPosition(-W / 2 + 20, 4, 0);
            const ef = makeLabelLeft(row, 'Eff', `效果：${b.effect}`, UI_FONT.small, UI_COLOR.textDim, W - 40);
            ef.overflow = Label.Overflow.SHRINK;
            ef.node.setPosition(-W / 2 + 20, -38, 0);
        } })));
    }

    // ───────────────────────── 招商引资（DESIGN 20） ─────────────────────────

    private fillInvest(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        let y = H / 2;
        // 营商环境
        const env = sim.businessEnv ? sim.businessEnv() : { total: 0, parts: [] };
        const head = makeLabelLeft(body, 'Env', `营商环境 ${env.total} / 100`, UI_FONT.body, UI_COLOR.text, W / 2);
        head.isBold = true;
        head.node.setPosition(-W / 2, y - 16, 0);
        const tip = makeLabelRight(body, 'EnvTip', '越高越容易谈成', UI_FONT.small, UI_COLOR.textDim, W / 2);
        tip.node.setPosition(W / 2, y - 16, 0);
        y -= 44;
        const colW = (W - 16) / 2;
        env.parts.forEach((p, i) => {
            const x = -W / 2 + (i % 2) * (colW + 16);
            const yy = y - Math.floor(i / 2) * 34;
            const l = makeLabelLeft(body, 'P', p.label, 18, UI_COLOR.textDim, 110);
            l.node.setPosition(x, yy, 0);
            const g = makePanelNode(body, 'Bar', colW - 120, 10).addComponent(Graphics);
            g.node.setPosition(x + 120 + (colW - 120) / 2, yy, 0);
            const bw = colW - 120;
            g.fillColor = UI_COLOR.border;
            g.roundRect(-bw / 2, -5, bw, 10, 5);
            g.fill();
            g.fillColor = p.value / p.max >= 0.6 ? UI_PALETTE.green : p.value / p.max >= 0.3 ? UI_PALETTE.yellow : UI_PALETTE.coral;
            g.roundRect(-bw / 2, -5, Math.max(4, bw * p.value / p.max), 10, 5);
            g.fill();
        });
        y -= Math.ceil(env.parts.length / 2) * 34 + 10;

        // 已签约等选址
        const deal = sim.state.pendingDeal;
        if (deal) {
            const dh = 88;
            const n = makePanelNode(body, 'Deal', W, dh);
            n.setPosition(0, y - dh / 2, 0);
            const g = n.addComponent(Graphics);
            g.fillColor = new Color(232, 246, 232, 255);
            g.roundRect(-W / 2, -dh / 2, W, dh, UI_RADIUS);
            g.fill();
            const l = makeLabelLeft(n, 'T', `已和${deal.company}签约：给他们划块地建${this.nameOf(deal.defId)}`, UI_FONT.small, UI_COLOR.up, W - 330);
            l.overflow = Label.Overflow.SHRINK;
            l.node.setPosition(-W / 2 + 16, 0, 0);
            const go = makeButton(n, 'Go', '去选址', 150, 60, 'primary', () => { if (this.onPlace) this.onPlace(deal.defId); });
            go.node.setPosition(W / 2 - 16 - 75 - 150 - 12, 0, 0);
            const no = makeButton(n, 'No', '放弃', 150, 60, 'secondary', () => { if (sim.cancelPendingDeal) sim.cancelPendingDeal(); this.fill(); });
            no.node.setPosition(W / 2 - 16 - 75, 0, 0);
            y -= dh + 12;
        }

        // 让税开关
        const tb = makeButton(body, 'Tax', this._taxBreak ? '✓ 附加让税（头 12 天企业税减半，成功率 +20%）' : '附加让税（头 12 天企业税减半，成功率 +20%）', W, 56,
            this._taxBreak ? 'primary' : 'secondary', () => { this._taxBreak = !this._taxBreak; this.fill(); });
        tb.node.setPosition(0, y - 28, 0);
        y -= 72;

        const offers = sim.state.offers ?? [];
        if (!offers.length) {
            const l = makeLabel(body, 'None', '现在没有企业来谈。每 3 天会有新的投资意向，公告栏会提醒你。', UI_FONT.small, UI_COLOR.textDim, W - 40);
            l.overflow = Label.Overflow.RESIZE_HEIGHT;
            l.node.setPosition(0, y - 40, 0);
            return;
        }
        const listH = y + H / 2;
        const list = ScrollList.mount(body, 'Offers', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);
        list.setRows(offers.map((o) => ({ height: 228, build: (row: Node) => {
            const h = 216;
            const g = row.addComponent(Graphics);
            g.fillColor = UI_COLOR.block;
            g.roundRect(-W / 2, -h / 2, W, h, UI_RADIUS);
            g.fill();
            const chance = sim.offerChance ? Math.round(sim.offerChance(o.id, this._taxBreak) * 100) : 0;
            const left = Math.max(0, o.until - sim.state.month);
            const t = makeLabelLeft(row, 'T', `${o.company}：想建${this.nameOf(o.defId)}`, UI_FONT.body, UI_COLOR.text, W - 220);
            t.isBold = true;
            t.node.setPosition(-W / 2 + 20, 76, 0);
            const c = makeLabelRight(row, 'C', `成功率 ${chance}% · ${left} 天内`, UI_FONT.small, UI_COLOR.textDim, 220);
            c.node.setPosition(W / 2 - 20, 76, 0);
            const l1 = makeLabelLeft(row, 'L1', `供地：对方交土地出让金 ${formatMoney(o.landFee)}，自己出钱建厂（私营），要县里有 ${o.needLabor} 个能招的工人`, 18, UI_COLOR.text, W - 40);
            l1.overflow = Label.Overflow.SHRINK;
            l1.node.setPosition(-W / 2 + 20, 34, 0);
            const l2 = makeLabelLeft(row, 'L2', `补贴：我们出 ${formatMoney(o.subsidy)}，对方送来 ${o.workers} 位熟练工人（要有空房）`, 18, UI_COLOR.text, W - 40);
            l2.overflow = Label.Overflow.SHRINK;
            l2.node.setPosition(-W / 2 + 20, 2, 0);
            const bw = (W - 52) / 2;
            const b1 = makeButton(row, 'Land', '供地签约', bw, 64, 'primary', () => this.deal(o.id, 'land'));
            b1.node.setPosition(-W / 2 + 16 + bw / 2, -62, 0);
            const b2 = makeButton(row, 'Sub', `补贴 ${formatMoney(o.subsidy)}`, bw, 64, 'secondary', () => this.deal(o.id, 'subsidy'));
            b2.node.setPosition(W / 2 - 16 - bw / 2, -62, 0);
        } })));
    }

    private deal(id: number, mode: 'land' | 'subsidy'): void {
        const sim = this._sim;
        if (!sim || !sim.acceptOffer) return;
        const err = sim.acceptOffer(id, mode, this._taxBreak);
        if (err) { if (this.onHint) this.onHint(err); this.fill(); return; }
        if (this.onChanged) this.onChanged();
        const deal = sim.state.pendingDeal;
        if (mode === 'land' && deal && this.onPlace) { this.onPlace(deal.defId); return; }
        if (this.onHint) this.onHint('签约成功，工人已经到了');
        this.fill();
    }

    private fillSoon(body: Node, H: number, text: string): void {
        const l = makeLabel(body, 'Soon', text, UI_FONT.body, UI_COLOR.textDim, this.W - 80);
        l.overflow = Label.Overflow.RESIZE_HEIGHT;
        l.node.setPosition(0, H / 2 - 120, 0);
    }
}
