import { _decorator, Color, Graphics, Label, Node, Sprite, UITransform, view } from 'cc';
import { GoalStatus, ResearchStatus, SimApi } from '../core/sim/SimApi';
import { Education, Offer, TownLevel } from '../core/sim/types';
import { ArtLibrary } from '../core/ArtLibrary';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import {
    drawShadow, formatMoney, makeButton, makeIcon, makeRoundButton, makeStatTile, makeTag, IconName, makeLabel, makeLabelLeft, makeLabelRight, makePanelNode, UI_COLOR, UI_FONT, UI_HUD, UI_PALETTE, UI_RADIUS,
} from './UiTheme';

const { ccclass } = _decorator;

type Tab = 'goals' | 'research' | 'talent' | 'market' | 'invest' | 'streets';
const TABS: { key: Tab; label: string; icon: IconName }[] = [
    { key: 'goals', label: '发展目标', icon: 'center' },
    { key: 'research', label: '产业研究', icon: 'calendar' },
    { key: 'talent', label: '人才引进', icon: 'people' },
    { key: 'market', label: '人才市场', icon: 'bill' },
    { key: 'invest', label: '招商引资', icon: 'coin' },
    { key: 'streets', label: '特色街道', icon: 'shop' },
];
const LEVEL_NAME: Record<TownLevel, string> = { village: '村口', town: '镇上', county: '县城', city: '县级市', top100: '百强县' };
const NEXT: Partial<Record<TownLevel, TownLevel>> = { village: 'town', town: 'county', county: 'city', city: 'top100' };

const INK = new Color(37, 72, 66);
const TEAL = new Color(44, 101, 89);
const MINT = new Color(228, 241, 226);
const PAPER = new Color(255, 253, 245);
const RULE = new Color(220, 211, 188);
const GOLD = new Color(249, 203, 112);
const GOAL_ICONS: Record<GoalStatus['kind'], IconName> = {
    pop: 'people', research: 'calendar', wishes: 'bill', mood: 'smile', roads: 'home',
    building: 'center', employment: 'people', streets: 'shop', deals: 'coin',
};

function cardSurface(row: Node, w: number, h: number, fill = PAPER): Graphics {
    const g = row.addComponent(Graphics);
    g.fillColor = RULE;
    g.roundRect(-w / 2, -h / 2 - 2, w, h + 2, 14);
    g.fill();
    g.fillColor = fill;
    g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 13);
    g.fill();
    return g;
}

@ccclass('CenterPanel')
export class CenterPanel extends Panel {

    private static art: ArtLibrary | null = null;
    private wide = false;
    private rail: Node | null = null;

    static setArt(art: ArtLibrary): void { CenterPanel.art = art; }

    protected buildShell(title: string, subtitle: string): void {
        const { width, height } = view.getVisibleSize();
        this.wide = width > height;
        this.cardW = this.wide ? 1020 : 690;
        this.cardH = this.wide ? 846 : 1116;
        const railW = this.wide ? 262 : 0;
        const w = this.cardW + railW, h = this.cardH;
        const shade = makePanelNode(this.node, 'Shade', width, height);
        const dim = shade.addComponent(Graphics);
        dim.fillColor = new Color(27, 35, 29, 158);
        dim.rect(-width / 2, -height / 2, width, height);
        dim.fill();
        shade.on(Node.EventType.TOUCH_END, () => this.close());
        const sheet = makePanelNode(this.node, 'Window', w, h);
        const scale = Math.min(width * (this.wide ? 0.91 : 0.965) / w, height * 0.92 / h);
        sheet.setScale(scale, scale, 1);
        const g = sheet.addComponent(Graphics);
        drawShadow(g, -w / 2, -h / 2, w, h, 21, 5);
        g.fillColor = UI_HUD.accentRim;
        g.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 23);
        g.fill();
        g.fillColor = UI_COLOR.panel;
        g.roundRect(-w / 2, -h / 2, w, h, 21);
        g.fill();
        sheet.on(Node.EventType.TOUCH_END, () => {});
        this.rail = this.wide ? makePanelNode(sheet, 'Navigation', railW, h) : null;
        if (this.rail) {
            this.rail.setPosition(-w / 2 + railW / 2, 0, 0);
            const bg = this.rail.addComponent(Graphics);
            bg.fillColor = new Color(237, 224, 195);
            bg.roundRect(-railW / 2, -h / 2, railW, h, 18);
            bg.fill();
            const sky = makePanelNode(this.rail, 'Townscape', railW - 24, 206);
            sky.setPosition(0, h / 2 - 116, 0);
            const art = cardSurface(sky, railW - 24, 206, new Color(205, 229, 217));
            art.fillColor = new Color(255, 222, 152);
            art.circle(68, 58, 22);
            art.fill();
            art.fillColor = new Color(160, 195, 157);
            art.ellipse(0, -38, 98, 21);
            art.fill();
            this.buildingImage(sky, 'tree', -80, -14, 40, 73);
            this.buildingImage(sky, 'center', -12, 12, 145, 139);
            this.buildingImage(sky, 'hut', 63, -28, 68, 57);
            const masthead = makeLabel(sky, 'CenterName', title, 30, INK, railW - 38);
            masthead.isBold = true;
            masthead.node.setPosition(0, -78, 0);
        }
        const card = makePanelNode(sheet, 'Card', this.cardW, h);
        this.card = card;
        card.setPosition(railW / 2, 0, 0);
        const head = makePanelNode(card, 'Header', this.cardW, 100);
        head.setPosition(0, h / 2 - 50, 0);
        const x = -this.cardW / 2 + Panel.PAD_X;
        const label = makeLabelLeft(head, 'Title', title, UI_FONT.title, UI_COLOR.text, this.cardW - 286);
        this.titleLabel = label;
        label.isBold = true;
        label.node.setPosition(x, 0, 0);
        const tag = makeTag(head, subtitle, TEAL);
        tag.setPosition(x + title.length * UI_FONT.title + 18 + tag.getComponent(UITransform)!.width / 2, 0, 0);
        const close = makeRoundButton(head, 'Close', 'close', 54, () => this.close(), UI_HUD.onAccent, UI_HUD.accent);
        close.setActive(true);
        close.node.setPosition(-x - 21, 0, 0);
        const line = head.addComponent(Graphics);
        line.fillColor = UI_COLOR.border;
        line.rect(x, -42, -2 * x, 2);
        line.fill();
        this.content = makePanelNode(card, 'Content', -2 * x, h - 128);
        this.content.setPosition(0, -36, 0);
    }

    close(): void {
        this.onClosed?.();
        this.node.active = false;
        this.node.destroy();
    }

    private buildingImage(parent: Node, id: string, x: number, y: number, w: number, h: number): void {
        const frame = CenterPanel.art?.get(id);
        if (!frame) return;
        const rect = frame.rect;
        const scale = Math.min(w / rect.width, h / rect.height);
        const node = makePanelNode(parent, id, rect.width * scale, rect.height * scale);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        node.setPosition(x, y, 0);
    }

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
    /** 招商签约后：去地图上选址交地（UiRoot 关面板 + 自动挑一块地放好预览） */
    onPlace: ((defId: string) => void) | null = null;
    /** 建筑 id → 名字 */
    nameOf: (id: string) => string = (id) => id;
    private _taxBreak = false;
    /** 招商确认 / 结果卡片（盖在面板上） */
    private _restoreModal: (() => void) | null = null;
    private _modal: Node | null = null;

    static show(parent: Node, sim: SimApi, tab: Tab = 'goals', toggleFacing: (() => boolean) | null = null): CenterPanel {
        const p = Panel.open(CenterPanel, parent, '发展中心', LEVEL_NAME[sim.state.level]);
        p._sim = sim;
        p._tab = tab;
        p.renderPage = () => {
            p._tabNodes = [];
            p._body = null;
            p._modal = null;
            p.buildTabs();
            p.fill();
            if (toggleFacing) p.buildFacingButton(toggleFacing);
            p._restoreModal?.();
        };
        p.renderPage();
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
        btn.node.setPosition(this.cardW / 2 - Panel.PAD_X - 56 - 14 - W / 2 + 8, 0, 0);
    }

    private get W(): number {
        return this.contentW;
    }

    private buildTabs(): void {
        const host = this.rail ?? this.content!;
        const { width, height } = host.getComponent(UITransform)!;
        const gap = 8;
        const w = this.wide ? width - 24 : (width - gap * (TABS.length - 1)) / TABS.length;
        const h = this.wide ? 76 : 56;
        TABS.forEach((tab, i) => {
            const node = makePanelNode(host, 'Tab_' + tab.key, w, h);
            const x = this.wide ? 0 : -width / 2 + w / 2 + i * (w + gap);
            const y = height / 2 - h / 2 - (this.wide ? 247 + i * (h + gap) : 0);
            node.setPosition(x, y, 0);
            const g = node.addComponent(Graphics);
            const label = this.wide ? makeLabelLeft(node, 'Txt', tab.label, 25, UI_HUD.text, w - 74)
                : makeLabel(node, 'Txt', tab.label, UI_FONT.small, UI_COLOR.textDim, w - 8);
            if (this.wide) {
                makeIcon(node, tab.icon, 35).node.setPosition(-w / 2 + 32, 0, 0);
                label.node.setPosition(-w / 2 + 65, 0, 0);
            }
            node.on(Node.EventType.TOUCH_END, () => {
                if (this._tab === tab.key) return;
                this.closeModal();
                this._tab = tab.key;
                this.fill();
            });
            this._tabNodes.push({ key: tab.key, g, label, w });
        });
    }

    private drawTabs(): void {
        const h = this.wide ? 76 : 56;
        for (const tab of this._tabNodes) {
            const active = tab.key === this._tab;
            tab.g.clear();
            tab.g.fillColor = active ? TEAL : this.wide ? new Color(237, 224, 195) : UI_COLOR.button;
            tab.g.roundRect(-tab.w / 2, -h / 2, tab.w, h, this.wide ? 12 : h / 2);
            tab.g.fill();
            tab.label.color = active ? UI_PALETTE.white : UI_HUD.text;
            tab.label.isBold = active;
        }
    }

    /** 重画当前页签（研究开始、升级之后也调） */
    fill(): void {
        if (!this.content || !this._sim) return;
        if (this.wide && this.titleLabel) this.titleLabel.string = TABS.find(t => t.key === this._tab)!.label;
        this.drawTabs();
        if (this._body) this._body.destroy();
        const top = this.contentTop - (this.wide ? 0 : 80);
        const H = top + this.contentH / 2;
        const body = makePanelNode(this.content, 'Body', this.W, H);
        body.setPosition(0, top - H / 2, 0);
        this._body = body;
        if (this._tab === 'goals') this.fillGoals(body, H);
        else if (this._tab === 'research') this.fillResearch(body, H);
        else if (this._tab === 'talent') this.fillTalent(body, H);
        else if (this._tab === 'market') this.fillMarket(body, H);
        else if (this._tab === 'streets') this.fillStreets(body, H);
        else this.fillInvest(body, H);
    }

    // ───────────────────────── 发展目标 ─────────────────────────

    private fillGoals(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const goals: GoalStatus[] = sim.goals ? sim.goals() : [];
        const next = NEXT[sim.state.level];
        const done = goals.filter(g => g.done).length;
        const heroH = 134;
        const banner = makePanelNode(body, 'Milestone', W, heroH);
        banner.setPosition(0, H / 2 - heroH / 2, 0);
        const g = cardSurface(banner, W, heroH, INK);
        const left = -W / 2 + 26;
        const heading = makeLabelLeft(banner, 'Head', next ? `晋升${LEVEL_NAME[next]}` : '已达百强县', 36, PAPER, W - 210);
        heading.isBold = true;
        heading.node.setPosition(left, 26, 0);
        if (!next) {
            makeIcon(banner, 'center', 74).node.setPosition(W / 2 - 64, 0, 0);
            return;
        }
        const summary = makeLabelLeft(banner, 'Completion', `已达成 ${done} / ${goals.length} 项`, 22, GOLD, 200);
        summary.node.setPosition(left, -28, 0);
        const segW = Math.min(52, (W - 395) / Math.max(1, goals.length) - 6);
        goals.forEach((_, i) => {
            g.fillColor = i < done ? GOLD : new Color(94, 126, 112);
            g.roundRect(left + 176 + i * (segW + 6), -32, segW, 9, 4);
            g.fill();
        });
        this.buildingImage(banner, 'tree', W / 2 - 137, -2, 48, 72);
        this.buildingImage(banner, 'apartment', W / 2 - 83, 6, 94, 106);
        this.buildingImage(banner, 'breakfast', W / 2 - 41, -24, 62, 62);

        const footerH = 80;
        const listH = H - heroH - footerH - 26;
        const list = ScrollList.mount(body, 'Goals', W, listH);
        list.node.setPosition(0, H / 2 - heroH - 14 - listH / 2, 0);
        const rowH = Math.min(this.wide ? 100 : 138, Math.max(72, Math.floor(listH / Math.max(1, goals.length))));
        list.setRows(goals.map(goal => ({ height: rowH, build: (row: Node) => {
            const bg = cardSurface(row, W, rowH - 8, goal.done ? MINT : PAPER);
            const cx = -W / 2 + 42;
            bg.fillColor = goal.done ? TEAL : UI_COLOR.block;
            bg.circle(cx, 0, 23);
            bg.fill();
            makeIcon(row, goal.done ? 'check' : GOAL_ICONS[goal.kind], goal.done ? 25 : 32).node.setPosition(cx, 0, 0);
            const x = cx + 40, track = W - 110;
            const t = makeLabelLeft(row, 'Text', goal.text, UI_FONT.body, INK, track - 165);
            t.node.setPosition(x, 8, 0);
            const value = makeLabelRight(row, 'Val', this.goalValue(goal), UI_FONT.body, goal.done ? TEAL : UI_COLOR.text, 165);
            value.isBold = true;
            value.node.setPosition(W / 2 - 26, 8, 0);
            const ratio = goal.target > 0 ? Math.min(1, Math.max(0, goal.value / goal.target)) : 0;
            bg.fillColor = UI_COLOR.borderDim;
            bg.roundRect(x, -21, track, 7, 3);
            bg.fill();
            if (ratio > 0) {
                bg.fillColor = goal.done ? TEAL : UI_COLOR.gold;
                bg.roundRect(x, -21, Math.max(7, track * ratio), 7, 3);
                bg.fill();
            }
        } })));

        const y = -H / 2 + footerH / 2;
        makeIcon(body, 'coin', 38).node.setPosition(-W / 2 + 24, y, 0);
        const reward = makeLabelLeft(body, 'Reward', '发展奖励', UI_FONT.body, INK, W - 310);
        reward.isBold = true;
        reward.node.setPosition(-W / 2 + 56, y + 15, 0);
        const tip = makeLabelLeft(body, 'Tip', '解锁产业研究，获得建设资金', UI_FONT.small, UI_COLOR.textDim, W - 310);
        tip.node.setPosition(-W / 2 + 56, y - 16, 0);
        const all = goals.length > 0 && done === goals.length;
        const btn = makeButton(body, 'Upgrade', all ? '申请升级' : `还差 ${goals.length - done} 项`, 198, 62,
            all ? 'primary' : 'secondary', () => {
                if (!all || !sim.upgradeLevel) return;
                const lv = sim.upgradeLevel();
                if (lv) { this.onUpgraded?.(lv); this.close(); }
            }, all ? 'check' : 'lock');
        btn.setEnabled(all);
        btn.node.setPosition(W / 2 - 99, y, 0);
    }

    private goalValue(g: GoalStatus): string {
        if (g.target > 0 && g.target < 1) return `${Math.round(g.value * 100)}% / ${Math.round(g.target * 100)}%`;
        return `${Math.round(g.value)} / ${g.target}`;
    }

    // ───────────────────────── 产业研究 ─────────────────────────

    private sectionBand(body: Node, H: number, title: string, detail: string, actionW = 0): Node {
        const W = this.W;
        const band = makePanelNode(body, 'SectionBand', W, 88);
        band.setPosition(0, H / 2 - 44, 0);
        cardSurface(band, W, 88, MINT);
        const x = -W / 2 + 22, textW = W - 44 - actionW;
        const head = makeLabelLeft(band, 'SectionTitle', title, UI_FONT.body, INK, textW);
        head.isBold = true;
        head.node.setPosition(x, 17, 0);
        makeLabelLeft(band, 'SectionDetail', detail, UI_FONT.small, UI_COLOR.textDim, textW).node.setPosition(x, -17, 0);
        return band;
    }

    private fillResearch(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const all: ResearchStatus[] = sim.researchList ? sim.researchList() : [];
        // 正在研究的在最上面，然后能研究的、条件不够的，最后研究完的
        const order = { active: 0, ready: 1, locked: 2, done: 3 };
        const items = all.slice().sort((a, b) => order[a.state] - order[b.state]);
        const slots = sim.researchSlots ? sim.researchSlots() : { used: 0, total: 1, nextCost: null };
        const canExpand = slots.nextCost !== null && !!sim.openResearchSlot;
        const band = this.sectionBand(body, H, `研究位　${slots.used} / ${slots.total}`,
            `空闲 ${Math.max(0, slots.total - slots.used)} 个　·　可选课题 ${items.filter(r => r.state === 'ready').length} 项`, canExpand ? 240 : 0);
        if (canExpand) {
            const btn = makeButton(band, 'AddSlot', `扩建 ${formatMoney(slots.nextCost!)}`, 220, 52, 'secondary', () => this.openSlot());
            btn.node.setPosition(W / 2 - 128, 0, 0);
        }
        const listH = H - 104;
        const list = ScrollList.mount(body, 'List', W, listH);
        list.node.setPosition(0, H / 2 - 104 - listH / 2, 0);
        const rows: ListRow[] = items.map((r) => ({ height: 118, build: (row) => this.researchRow(row, W, r) }));
        list.setRows(rows);
    }

    private researchRow(row: Node, W: number, r: ResearchStatus): void {
        const h = 106;
        const g = cardSurface(row, W, h, r.state === 'active' ? MINT : PAPER);
        const imageW = r.unlocks.length ? (this.wide ? 110 : 78) : 0;
        if (imageW) {
            const size = this.wide ? 84 : 62;
            g.fillColor = UI_COLOR.block;
            g.roundRect(-W / 2 + 14, -size / 2, size, size, 12);
            g.fill();
            this.buildingImage(row, r.unlocks[0], -W / 2 + 14 + size / 2, 0, size - 6, size - 6);
        }
        const name = makeLabelLeft(row, 'Name', r.name, UI_FONT.body, r.state === 'done' ? UI_COLOR.textDim : UI_COLOR.text, W - 240 - imageW);
        name.isBold = true;
        name.node.setPosition(-W / 2 + 20 + imageW, 22, 0);
        const sub = r.state === 'done' ? '已完成研究'
            : r.state === 'active' ? `${r.reason}（也可花钱加速）`
                : r.state === 'locked' ? r.reason
                    : `研究周期　${r.days} 天`;
        const subL = makeLabelLeft(row, 'Sub', sub, UI_FONT.small, r.state === 'locked' ? UI_COLOR.down : UI_COLOR.textDim, W - 240 - imageW);
        subL.node.setPosition(-W / 2 + 20 + imageW, -20, 0);
        if (r.state === 'active') {
            const bw = W - imageW - 252;
            g.fillColor = UI_COLOR.border;
            g.roundRect(-W / 2 + 20 + imageW, -h / 2 + 8, bw, 8, 4);
            g.fill();
            g.fillColor = UI_PALETTE.blue;
            g.roundRect(-W / 2 + 20 + imageW, -h / 2 + 8, Math.max(8, bw * r.progress), 8, 4);
            g.fill();
            const left = Math.max(1, Math.round(r.days * (1 - r.progress)));
            const btn = makeButton(row, 'Rush', `加速 ¥${Math.max(500, Math.ceil(r.cost / Math.max(1, r.days) * left))}`, 170, 60,
                'primary', () => this.rush(r));
            btn.node.setPosition(W / 2 - 20 - 85, 0, 0);
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

    private openSlot(): void {
        const sim = this._sim;
        if (!sim || !sim.openResearchSlot) return;
        const err = sim.openResearchSlot();
        if (err) { if (this.onHint) this.onHint(err); return; }
        if (this.onHint) this.onHint('研究位开好了，可以同时多研究一项');
        if (this.onChanged) this.onChanged();
        this.fill();
    }

    private rush(r: ResearchStatus): void {
        const sim = this._sim;
        if (!sim || !sim.rushResearch) return;
        const err = sim.rushResearch(r.id);
        if (err) { if (this.onHint) this.onHint(err); return; }
        if (this.onHint) this.onHint(`「${r.name}」研究好了`);
        if (this.onChanged) this.onChanged();
        this.fill();
    }

    // ───────────────────────── 人才引进（D030，DESIGN 16.6） ─────────────────────────

    private fillMarket(body: Node, H: number): void {
        const employers = this._sim?.employers?.() ?? [];
        const hired = employers.reduce((sum, b) => sum + b.staff, 0);
        const required = employers.reduce((sum, b) => sum + b.required, 0);
        const stats: [string, number, Color][] = [['岗位总数', required, INK], ['在岗人数', hired, TEAL], ['空缺岗位', required - hired, UI_COLOR.gold]];
        const tileW = (this.W - 24) / 3;
        stats.forEach(([label, value, color], i) => {
            const tile = makeStatTile(body, tileW, 94, label, String(value), color);
            tile.node.setPosition(-this.W / 2 + tileW / 2 + i * (tileW + 12), H / 2 - 47, 0);
        });
        if (!employers.length) {
            makeLabel(body, 'Empty', '县里还没有提供岗位的单位', UI_FONT.small, UI_COLOR.textDim, this.W);
            return;
        }
        const list = ScrollList.mount(body, 'Employers', this.W, H - 112);
        list.node.setPosition(0, -56, 0);
        list.setRows(employers.map((b) => ({ height: 77, build: (row: Node) => {
            cardSurface(row, this.W, 67);
            const name = makeLabelLeft(row, 'Name', b.name, UI_FONT.body, UI_COLOR.text, this.W - 180);
            name.node.setPosition(-this.W / 2 + 24, 0, 0);
            const count = makeLabelRight(row, 'Staff', `${b.staff} / ${b.required}`, UI_FONT.body,
                b.staff < b.required ? UI_PALETTE.blue : UI_COLOR.textDim, 150);
            count.node.setPosition(this.W / 2 - 24, 0, 0);
        } })));
    }

    private fillTalent(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const st = sim.talentStatus ? sim.talentStatus() : { ready: true, reason: '', nextCost: [] };
        this.sectionBand(body, H, '外县人才引进', '每批 6 人，间隔 5 天；需预留空房，到县后自行求职。');

        const TIERS: { edu: Education; label: string; desc: string }[] = [
            { edu: 0, label: '初中', desc: '进工厂、当店员、干体力活' },
            { edu: 1, label: '高中', desc: '技术员、收银、老师助理' },
            { edu: 2, label: '大专', desc: '老师、工程师、银行柜员' },
        ];
        let y = H / 2 - 106;
        const rowH = 150;
        for (let i = 0; i < TIERS.length; i++) {
            const t = TIERS[i];
            const price = st.nextCost[i] ?? 0;
            const row = makePanelNode(body, `Tier${t.edu}`, W, rowH - 12);
            row.setPosition(0, y - (rowH - 12) / 2, 0);
            cardSurface(row, W, rowH - 12);
            const name = makeLabelLeft(row, 'Name', `${t.label}学历 · 一次来 6 人`, UI_FONT.body, UI_COLOR.text, W - 260);
            name.isBold = true;
            name.node.setPosition(-W / 2 + 20, 26, 0);
            const sub = makeLabelLeft(row, 'Sub', t.desc, UI_FONT.small, UI_COLOR.textDim, W - 260);
            sub.node.setPosition(-W / 2 + 20, -12, 0);
            const cost = makeLabelLeft(row, 'Cost', `共 ${formatMoney(price)}`, UI_FONT.small, UI_COLOR.gold, W - 260);
            cost.node.setPosition(-W / 2 + 20, -44, 0);
            const btn = makeButton(row, 'Hire', '引进', 160, 64, 'primary', () => this.hire(t.edu, t.label));
            btn.setEnabled(st.ready);
            btn.node.setPosition(W / 2 - 20 - 80, 0, 0);
            y -= rowH;
        }
        if (!st.ready) {
            const why = makeLabelLeft(body, 'Why', st.reason, UI_FONT.small, UI_COLOR.down, W);
            why.node.setPosition(-W / 2, y - 18, 0);
        }
    }

    private hire(edu: Education, label: string): void {
        const sim = this._sim;
        if (!sim || !sim.hireTalents) return;
        const err = sim.hireTalents(edu);
        if (err) { if (this.onHint) this.onHint(err); return; }
        if (this.onHint) this.onHint(`招来 6 位${label}学历的年轻人，已经安排住下`);
        if (this.onChanged) this.onChanged();
        this.fill();
    }

    // ───────────────────────── 特色街道图鉴（DESIGN 21） ─────────────────────────

    private fillStreets(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        const book = sim.streetBook ? sim.streetBook() : [];
        this.sectionBand(body, H, `已形成 ${book.reduce((sum, b) => sum + b.count, 0)} 条特色街道`, '同条道路沿线 4 格内，集齐组合中的建筑即可形成。');
        const listH = H - 104;
        const list = ScrollList.mount(body, 'List', W, listH);
        list.node.setPosition(0, H / 2 - 104 - listH / 2, 0);
        list.setRows(book.map((b) => ({ height: 158, build: (row: Node) => {
            const h = 146;
            const done = b.count > 0;
            cardSurface(row, W, h, done ? MINT : PAPER);
            const offset = this.wide && b.members.length ? 112 : 0;
            if (offset) this.buildingImage(row, b.members[0], -W / 2 + 66, 0, 92, 100);
            const name = makeLabelLeft(row, 'Name', b.name, UI_FONT.body, done ? TEAL : INK, W - 200 - offset);
            name.isBold = true;
            name.node.setPosition(-W / 2 + 20 + offset, 46, 0);
            const st = makeLabelRight(row, 'St', done ? `已凑成 ${b.count} 条` : '还没凑成', UI_FONT.small, done ? UI_COLOR.up : UI_COLOR.textDim, 180);
            st.node.setPosition(W / 2 - 20, 46, 0);
            const members = b.members.map((m) => this.nameOf(m) + (b.lockedMembers.indexOf(m) >= 0 ? '（未研究）' : '')).join(' + ');
            const ml = makeLabelLeft(row, 'Mem', `组合：${members}`, UI_FONT.small, b.lockedMembers.length ? UI_COLOR.down : UI_COLOR.text, W - 40 - offset);
            ml.overflow = Label.Overflow.SHRINK;
            ml.node.setPosition(-W / 2 + 20 + offset, 4, 0);
            const ef = makeLabelLeft(row, 'Eff', `效果：${b.effect}`, UI_FONT.small, UI_COLOR.textDim, W - 40 - offset);
            ef.overflow = Label.Overflow.SHRINK;
            ef.node.setPosition(-W / 2 + 20 + offset, -38, 0);
        } })));
    }

    // ───────────────────────── 招商引资（DESIGN 20） ─────────────────────────

    private fillInvest(body: Node, H: number): void {
        const sim = this._sim!;
        const W = this.W;
        let y = H / 2;
        // 营商环境
        const env = sim.businessEnv ? sim.businessEnv() : { total: 0, parts: [] };
        this.sectionBand(body, H, `营商环境　${env.total} / 100`, '环境评分越高，签约机会越大。');
        y -= 116;
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
            const pay = deal.mode === 'subsidy' && deal.subsidy ? `，交地时拨补贴 ${formatMoney(deal.subsidy)}` : deal.landFee ? `，交地收 ${formatMoney(deal.landFee)}` : '';
            const l = makeLabelLeft(n, 'T', `已和${deal.company}签约：还没给他们划地建${this.nameOf(deal.defId)}${pay}`, UI_FONT.small, UI_COLOR.up, W - 370);
            l.overflow = Label.Overflow.SHRINK;
            l.node.setPosition(-W / 2 + 16, 0, 0);
            const go = makeButton(n, 'Go', '去选址', 150, 60, 'primary', () => { if (this.onPlace) this.onPlace(deal.defId); });
            go.node.setPosition(W / 2 - 16 - 75 - 150 - 12, 0, 0);
            const no = makeButton(n, 'No', '放弃', 150, 60, 'secondary', () => {
                if (sim.cancelPendingDeal) sim.cancelPendingDeal();
                if (this.onChanged) this.onChanged();
                this.fill();
            });
            no.node.setPosition(W / 2 - 16 - 75, 0, 0);
            y -= dh + 12;
        }

        const offers = sim.state.offers ?? [];
        if (!offers.length) {
            const empty = makePanelNode(body, 'AwaitingOffers', W, 138);
            empty.setPosition(0, y - 80, 0);
            cardSurface(empty, W, 138);
            this.buildingImage(empty, 'bank', -W / 2 + 72, 0, 100, 98);
            const x = -W / 2 + 140, textW = W - 160;
            const title = makeLabelLeft(empty, 'None', '暂无投资意向', UI_FONT.body, INK, textW);
            title.isBold = true;
            title.node.setPosition(x, 18, 0);
            makeLabelLeft(empty, 'When', '每 3 天更新，有新意向时会收到公告。', UI_FONT.small, UI_COLOR.textDim, textW).node.setPosition(x, -20, 0);
            return;
        }
        const listH = y + H / 2;
        const list = ScrollList.mount(body, 'Offers', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);
        list.setRows(offers.map((o) => ({ height: 228, build: (row: Node) => {
            const h = 216;
            cardSurface(row, W, h);
            const left = Math.max(0, o.until - sim.state.month);
            const t = makeLabelLeft(row, 'T', `${o.company}：想建${this.nameOf(o.defId)}`, UI_FONT.body, UI_COLOR.text, W - 200);
            t.isBold = true;
            t.node.setPosition(-W / 2 + 20, 76, 0);
            const c = makeLabelRight(row, 'C', `${left} 天内有效`, UI_FONT.small, UI_COLOR.textDim, 180);
            c.node.setPosition(W / 2 - 20, 76, 0);
            const pct = (m: 'land' | 'subsidy') => (sim.offerChance ? Math.round(sim.offerChance(o.id, false, m) * 100) : 0);
            const l1 = makeLabelLeft(row, 'L1', `供地：我们出地，对方交出让金 ${formatMoney(o.landFee)}、全额出钱建（成功率 ${pct('land')}%）`, 18, UI_COLOR.text, W - 40);
            l1.overflow = Label.Overflow.SHRINK;
            l1.node.setPosition(-W / 2 + 20, 34, 0);
            const l2 = makeLabelLeft(row, 'L2', `补贴：我们出地 + 补贴 ${formatMoney(o.subsidy)}，建成后带 ${o.workers} 位熟练工人来（成功率 ${pct('subsidy')}%）`, 18, UI_COLOR.text, W - 40);
            l2.overflow = Label.Overflow.SHRINK;
            l2.node.setPosition(-W / 2 + 20, 2, 0);
            const bw = (W - 52) / 2;
            const b1 = makeButton(row, 'Land', '供地签约…', bw, 64, 'primary', () => this.openConfirm(o, 'land'));
            b1.node.setPosition(-W / 2 + 16 + bw / 2, -62, 0);
            const b2 = makeButton(row, 'Sub', '补贴签约…', bw, 64, 'secondary', () => this.openConfirm(o, 'subsidy'));
            b2.node.setPosition(W / 2 - 16 - bw / 2, -62, 0);
            // 条件不够的那条按钮变灰（点了还是能看到差什么）
            if (sim.offerBlock && sim.offerBlock(o.id, 'land')) b1.setStyle('secondary');
        } })));
    }

    // ── 招商确认 / 结果卡片（D032）──

    private closeModal(): void {
        if (this._modal && this._modal.isValid) this._modal.destroy();
        this._modal = null;
        this._restoreModal = null;
    }

    /** 盖在面板上的一张小卡片：遮罩吃掉点击，返回卡片节点和宽 */
    private makeModal(h: number): { card: Node; w: number } {
        this.closeModal();
        const host = this.card!;
        const CW = this.cardW, CH = this.cardH;
        const root = makePanelNode(host, 'Modal', CW, CH);
        this._modal = root;
        const sg = root.addComponent(Graphics);
        sg.fillColor = UI_COLOR.shade;
        sg.rect(-CW / 2, -CH / 2, CW, CH);
        sg.fill();
        root.on(Node.EventType.TOUCH_END, () => {}, this);   // 吃掉点击，不穿到下面的列表
        const w = Math.min(CW - 48, 660);
        const card = makePanelNode(root, 'Card', w, h);
        const g = card.addComponent(Graphics);
        g.fillColor = UI_COLOR.panel;
        g.roundRect(-w / 2, -h / 2, w, h, UI_RADIUS * 2);
        g.fill();
        g.strokeColor = UI_COLOR.border;
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, UI_RADIUS * 2);
        g.stroke();
        return { card, w };
    }

    /** 签约确认：写清楚建什么、我们拿到什么、付出什么、成功率；条件不够时签约按钮变灰并写差什么 */
    private openConfirm(o: Offer, mode: 'land' | 'subsidy'): void {
        const sim = this._sim;
        if (!sim || !sim.acceptOffer) return;
        const lines: { text: string; color?: Color }[] = [];
        const name = this.nameOf(o.defId);
        const taxMonths = 12;
        lines.push({ text: `建什么：${name}（建成后是对方的私营企业）` });
        lines.push({ text: '这个产业从此解锁；员工工资、企业税留在县里', color: UI_COLOR.textDim });
        if (mode === 'land') {
            lines.push({ text: `我们出：一块挨着路的地` });
            lines.push({ text: `我们得：交地时土地出让金 ${formatMoney(o.landFee)} 进财政`, color: UI_COLOR.up });
            lines.push({ text: `对方要求：县里有 ${o.needLabor} 个能招的工人（对方在本地招人）`, color: UI_COLOR.textDim });
        } else {
            lines.push({ text: `我们出：一块挨着路的地 + 补贴 ${formatMoney(o.subsidy)}（交地时拨付）` });
            lines.push({ text: `我们得：厂建成时对方带 ${o.workers} 位熟练工人来${o.workerEdu > 0 ? `（${['', '初中', '高中', '大专'][o.workerEdu]}学历）` : ''}`, color: UI_COLOR.up });
            lines.push({ text: '工人要有空房才住得下，住不下的不来', color: UI_COLOR.textDim });
        }
        if (this._taxBreak) lines.push({ text: `附加让税：头 ${taxMonths} 天企业税减半`, color: UI_COLOR.textDim });

        const lineH = 40;
        const h = 150 + lines.length * lineH + 84 + 56 + 110;
        const { card, w } = this.makeModal(h);
        this._restoreModal = () => this.openConfirm(o, mode);
        let y = h / 2 - 50;
        const title = makeLabelLeft(card, 'Title', `和${o.company}签约 · ${mode === 'land' ? '供地' : '补贴'}`, UI_FONT.body + 4, UI_COLOR.text, w - 64);
        title.isBold = true;
        title.overflow = Label.Overflow.SHRINK;
        title.node.setPosition(-w / 2 + 32, y, 0);
        y -= 60;
        for (const ln of lines) {
            const l = makeLabelLeft(card, 'Line', ln.text, 20, ln.color ?? UI_COLOR.text, w - 64);
            l.overflow = Label.Overflow.SHRINK;
            l.node.setPosition(-w / 2 + 32, y, 0);
            y -= lineH;
        }
        y -= 10;
        // 让税开关（改成功率，重画卡片）
        const tb = makeButton(card, 'Tax', `${this._taxBreak ? '✓ ' : ''}附加让税：头 ${taxMonths} 天企业税减半，成功率更高`, w - 64, 56,
            this._taxBreak ? 'primary' : 'secondary', () => { this._taxBreak = !this._taxBreak; this.openConfirm(o, mode); });
        tb.node.setPosition(0, y - 28, 0);
        y -= 84;
        const pct = sim.offerChance ? Math.round(sim.offerChance(o.id, this._taxBreak, mode) * 100) : 0;
        const block = sim.offerBlock ? sim.offerBlock(o.id, mode) : '';
        const info = makeLabelLeft(card, 'Chance', block ? `签不了：${block}` : `成功率 ${pct}%（谈不成这份意向就作废）`,
            UI_FONT.small, block ? UI_COLOR.down : UI_COLOR.text, w - 64);
        info.isBold = true;
        info.overflow = Label.Overflow.SHRINK;
        info.node.setPosition(-w / 2 + 32, y - 10, 0);
        // 按钮
        const bw = (w - 64 - 16) / 2;
        const by = -h / 2 + 32 + 32;
        const no = makeButton(card, 'No', '再想想', bw, 64, 'secondary', () => this.closeModal());
        no.node.setPosition(-w / 2 + 32 + bw / 2, by, 0);
        const yes = makeButton(card, 'Yes', '签约', bw, 64, 'primary', () => this.deal(o, mode));
        yes.node.setPosition(w / 2 - 32 - bw / 2, by, 0);
        if (block) yes.setEnabled(false);
    }

    private deal(o: Offer, mode: 'land' | 'subsidy'): void {
        const sim = this._sim;
        if (!sim || !sim.acceptOffer) return;
        const err = sim.acceptOffer(o.id, mode, this._taxBreak);
        if (this.onChanged) this.onChanged();
        if (err) {
            // 条件不够（按钮本该是灰的，资金可能刚变过）→ 重画确认卡片；谈不成 → 结果卡片
            if (sim.state.offers && sim.state.offers.some((x) => x.id === o.id)) { this.openConfirm(o, mode); return; }
            this.fill();
            this.openResult(`没和${o.company}谈成`, err);
            return;
        }
        this.closeModal();
        const deal = sim.state.pendingDeal;
        if (deal && this.onPlace) { this.onPlace(deal.defId); return; }
        this.fill();
    }

    /** 结果卡片：谈不成的原因和怎么补 */
    private openResult(title: string, text: string): void {
        const h = 330;
        const { card, w } = this.makeModal(h);
        this._restoreModal = () => this.openResult(title, text);
        const t = makeLabel(card, 'Title', title, UI_FONT.body + 4, UI_COLOR.text, w - 64);
        t.isBold = true;
        t.node.setPosition(0, h / 2 - 54, 0);
        const l = makeLabel(card, 'Text', text, UI_FONT.small, UI_COLOR.textDim, w - 80);
        l.overflow = Label.Overflow.RESIZE_HEIGHT;
        l.node.setPosition(0, 20, 0);
        const ok = makeButton(card, 'Ok', '知道了', 240, 64, 'primary', () => this.closeModal());
        ok.node.setPosition(0, -h / 2 + 64, 0);
    }

    private fillSoon(body: Node, H: number, text: string): void {
        const l = makeLabel(body, 'Soon', text, UI_FONT.body, UI_COLOR.textDim, this.W - 80);
        l.overflow = Label.Overflow.RESIZE_HEIGHT;
        l.node.setPosition(0, H / 2 - 120, 0);
    }
}
