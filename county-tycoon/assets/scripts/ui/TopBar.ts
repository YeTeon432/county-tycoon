import { _decorator, Color, Component, Graphics, Label, Layers, Node, tween, Tween, UITransform, Vec3, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { SimApi } from '../core/sim/SimApi';
import { getPlatform } from '../platform/Platform';
import { DayClock } from '../core/DayClock';
import { monthLabel } from '../core/sim/types';
import {
    drawShadow, formatNumber, IconName, makeIcon, makeLabel, makeLabelLeft, makePanelNode, makeRoundButton,
    UI_COLOR, UI_FONT, UI_PALETTE,
} from './UiTheme';

const { ccclass } = _decorator;

/** 时间档位：0 暂停 / 1 正常 / 2 两倍 / 3 三倍（D025） */
export type Speed = 0 | 1 | 2 | 3;

/**
 * 顶栏（T307，T406 改成明亮风，DESIGN 8.2）。
 *
 *   第一行：四个白色胶囊，每个 = 图标 + 数字：日历「2年3月」/ 硬币「¥50,781」/ 人「5」/ 笑脸「57」
 *           人口胶囊可点 → 居民总览。
 *   第二行：左边一条半透明白提示（放置：火锅店 / 拆除模式 / 就业情况），
 *           右边三个圆形图标按钮：播放·暂停 / 快进（两倍速）/ 账单（有新账单时右上红点）。
 *
 * 没有整条底色：胶囊浮在地图上，空隙里还能点地图。所以 InputGuard 登记的是每个胶囊和按钮，
 * 不是整条栏。
 */
@ccclass('TopBar')
export class TopBar extends Component {
    /** 顶栏自身高度：上边距 16 + 胶囊 56 + 行距 14 + 按钮 64 + 8 */
    static readonly BODY_HEIGHT = 158;
    /** 顶栏占掉的高度（地图上方被遮住的部分）= 避让 + 自身高度 */
    static get HEIGHT(): number {
        return TopBar.topInset() + TopBar.BODY_HEIGHT;
    }

    private static _inset: number | null = null;
    /**
     * 屏幕最上面要让出来的高度（设计分辨率像素）：
     * 有宿主胶囊（微信 / 抖音）就让到胶囊下面，否则让到安全区（灵动岛 / 刘海 / 状态栏）下面。
     */
    static topInset(): number {
        if (TopBar._inset !== null) return TopBar._inset;
        let inset = 0;
        const info = getPlatform().systemInfo();
        const visible = view.getVisibleSize();
        if (info.screenWidth > 0) {
            const k = visible.width / info.screenWidth;
            const logical = info.menuButton ? info.menuButton.bottom : info.safeArea.top;
            inset = Math.max(0, Math.round(logical * k));
        }
        TopBar._inset = inset;
        return inset;
    }
    static readonly MARGIN_TOP = 16;
    static readonly CHIP_H = 56;
    static readonly BTN = 64;

    /** 玩家点了速度按钮 */
    onSpeedChange: ((speed: Speed) => void) | null = null;
    /** 玩家点了「账单」 */
    onReportTap: (() => void) | null = null;
    /** 玩家点了「人口」→ 打开居民总览 */
    onPopulationTap: (() => void) | null = null;
    /** 玩家点了「县发展中心」按钮 */
    onCenterTap: (() => void) | null = null;

    private _sim: SimApi | null = null;
    private _speed: Speed = 1;
    /** 暂停前的档位：点「播放」时回到它 */
    private _lastRunSpeed: Speed = 1;

    private _date: Label | null = null;
    private _funds: Label | null = null;
    private _fundsChip: Node | null = null;
    private _population: Label | null = null;
    private _mood: Label | null = null;
    private _hint: Label | null = null;
    private _hintBox: Node | null = null;
    private _hintText = '';
    private _dayText = '';

    private _play: ReturnType<typeof makeRoundButton> | null = null;
    private _fast: ReturnType<typeof makeRoundButton> | null = null;
    private _report: ReturnType<typeof makeRoundButton> | null = null;
    private _reportDot: Node | null = null;
    /** 县发展中心按钮右上角的红点：目标全完成、可以申请升级时亮 */
    private _centerDot: Node | null = null;
    private _fastBadge: Label | null = null;
    /** 有没有"还没看过"的新账单 */
    private _reportFresh = false;

    /** 资金滚动动画（开局 T407）：from → 当前值 */
    private _roll: { from: number; t: number; dur: number } | null = null;
    /** 开场卡片期间资金定格在某个数（T407：先显示 ¥0，卡片关了再滚上来） */
    private _holdFunds: number | null = null;
    private readonly _guarded: Node[] = [];

    build(sim: SimApi): void {
        this._sim = sim;
        const visible = view.getVisibleSize();
        const W = visible.width;
        const H = TopBar.BODY_HEIGHT;

        this.node.layer = Layers.Enum.UI_2D;
        const trans = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        trans.setContentSize(W, H);
        this.node.setPosition(0, visible.height / 2 - TopBar.topInset() - H / 2, 0);

        this.buildChips(W, H);
        this.buildSecondRow(W, H);
        this.refresh();
    }

    // ───────────────────────── 第一行：胶囊 ─────────────────────────

    private buildChips(W: number, H: number): void {
        const y = H / 2 - TopBar.MARGIN_TOP - TopBar.CHIP_H / 2;
        // 宽度：日期 / 资金 / 人口 / 心情。资金最长（¥1,234,567），给最多
        const widths = [158, 220, 116, 116];
        const sum = widths.reduce((a, b) => a + b, 0);
        const gap = Math.max(8, (W - 32 - sum) / 3);
        let x = -W / 2 + 16;
        const make = (i: number, name: string, icon: IconName, color = UI_COLOR.text) => {
            const w = widths[i];
            const chip = this.makeChip(name, icon, w, color);
            chip.node.setPosition(x + w / 2, y, 0);
            x += w + gap;
            return chip;
        };
        // 日期胶囊两行：「1 年 11 月」+「上午 8 点」（D024，一个月演成一天）
        const date = make(0, 'Date', 'calendar');
        this._date = date.label;
        this._date.fontSize = 20;
        this._date.lineHeight = 22;
        this._date.overflow = Label.Overflow.SHRINK;
        this._date.node.getComponent(UITransform)!.setContentSize(widths[0] - 64, TopBar.CHIP_H - 8);
        const funds = make(1, 'Funds', 'coin');
        this._funds = funds.label;
        this._fundsChip = funds.node;
        const pop = make(2, 'Population', 'people');
        this._population = pop.label;
        pop.node.on(Node.EventType.TOUCH_END, () => { if (this.onPopulationTap) this.onPopulationTap(); }, this);
        this._mood = make(3, 'Mood', 'smile').label;
    }

    /** 白色胶囊：左图标（36）+ 数字（粗体 26） */
    private makeChip(name: string, icon: IconName, w: number, color = UI_COLOR.text): { node: Node; label: Label } {
        const h = TopBar.CHIP_H;
        const node = makePanelNode(this.node, name, w, h);
        const g = node.addComponent(Graphics);
        drawShadow(g, -w / 2, -h / 2, w, h, h / 2, 3);
        g.fillColor = UI_PALETTE.white;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();

        const ic = makeIcon(node, icon, 38);
        ic.node.setPosition(-w / 2 + 10 + 19, 0, 0);
        const label = makeLabelLeft(node, 'Txt', '', UI_FONT.number, color, w - 64);
        label.isBold = true;
        label.node.setPosition(-w / 2 + 54, 0, 0);
        this.guard(node);
        return { node, label };
    }

    // ───────────────────────── 第二行：提示 + 圆按钮 ─────────────────────────

    private buildSecondRow(W: number, H: number): void {
        const S = TopBar.BTN;
        const y = H / 2 - TopBar.MARGIN_TOP - TopBar.CHIP_H - 14 - S / 2;
        const GAP = 12;

        // 从右往左：账单 / 县发展中心 / 快进 / 播放·暂停
        let x = W / 2 - 16 - S / 2;
        const report = makeRoundButton(this.node, 'ReportBtn', 'bill', S, () => {
            this.setReportFresh(false);
            if (this.onReportTap) this.onReportTap();
        });
        report.node.setPosition(x, y, 0);
        this._report = report;
        this._reportDot = this.makeDot(report.node, S);
        this.guard(report.node);

        x -= S + GAP;
        // 县发展中心：研究、目标、升级、人才引进都在里面，不用再满地图找那栋楼（彩色图标，不染色）
        const center = makeRoundButton(this.node, 'CenterBtn', 'center', S, () => {
            if (this.onCenterTap) this.onCenterTap();
        }, UI_PALETTE.white);
        center.node.setPosition(x, y, 0);
        this._centerDot = this.makeDot(center.node, S);
        this.guard(center.node);

        x -= S + GAP;
        // 快进：点一下换一档 1× → 2× → 3× → 1×；暂停中点它 = 直接 2×
        const fast = makeRoundButton(this.node, 'Speed_fast', 'fast', S, () => {
            const next: Speed = this._speed === 0 || this._speed === 1 ? 2 : this._speed === 2 ? 3 : 1;
            this.pickSpeed(next);
        });
        fast.node.setPosition(x, y, 0);
        this._fast = fast;
        // 右下角小角标「×2 / ×3」
        const badge = makePanelNode(fast.node, 'Badge', 34, 22);
        badge.setPosition(S / 2 - 10, -S / 2 + 8, 0);
        const bgx = badge.addComponent(Graphics);
        bgx.fillColor = UI_PALETTE.white;
        bgx.roundRect(-17, -11, 34, 22, 11);
        bgx.fill();
        bgx.fillColor = UI_PALETTE.coral;
        bgx.roundRect(-15, -9, 30, 18, 9);
        bgx.fill();
        this._fastBadge = makeLabel(badge, 'Txt', '', 15, UI_PALETTE.white, 30);
        this._fastBadge.isBold = true;
        badge.active = false;
        this.guard(fast.node);

        x -= S + GAP;
        const play = makeRoundButton(this.node, 'Speed_play', 'pause', S, () => {
            this.pickSpeed(this._speed === 0 ? this._lastRunSpeed : 0);
        });
        play.node.setPosition(x, y, 0);
        this._play = play;
        this.guard(play.node);

        // 提示条：左边到播放按钮之间
        const hintW = x - S / 2 - GAP - (-W / 2 + 16);
        const hh = 44;
        const box = makePanelNode(this.node, 'HintBox', hintW, hh);
        box.setPosition(-W / 2 + 16 + hintW / 2, y, 0);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(255, 255, 255, 215);
        bg.roundRect(-hintW / 2, -hh / 2, hintW, hh, hh / 2);
        bg.fill();
        this._hint = makeLabelLeft(box, 'Hint', '', UI_FONT.small, UI_COLOR.text, hintW - 32);
        this._hint.node.setPosition(-hintW / 2 + 18, 0, 0);
        this._hintBox = box;
        // 提示条不登记 InputGuard：它只是文字，点它应该照样能点到地图
    }

    /** 圆按钮右上角的红点（白边），默认藏着 */
    private makeDot(parent: Node, S: number): Node {
        const dot = makePanelNode(parent, 'Dot', 22, 22);
        dot.setPosition(S / 2 - 8, S / 2 - 8, 0);
        const dg = dot.addComponent(Graphics);
        dg.fillColor = UI_PALETTE.white;
        dg.circle(0, 0, 11);
        dg.fill();
        dg.fillColor = UI_PALETTE.coral;
        dg.circle(0, 0, 8);
        dg.fill();
        dot.active = false;
        return dot;
    }

    /** 发展目标全部完成（可以申请升级）时，县发展中心按钮亮红点 */
    setCenterReady(ready: boolean): void {
        if (this._centerDot) this._centerDot.active = ready;
    }

    private pickSpeed(speed: Speed): void {
        this.setSpeed(speed);
        if (this.onSpeedChange) this.onSpeedChange(speed);
    }

    // ───────────────────────── 对外 ─────────────────────────

    /**
     * 第二行的提示文字（放置：火锅店 / 拆除模式）。空字符串 → 显示就业情况。
     */
    setHint(text: string): void {
        this._hintText = text;
        this.refreshHint();
    }

    private refreshHint(): void {
        const label = this._hint;
        const sim = this._sim;
        if (!label || !sim) return;
        if (this._hintText) {
            label.string = this._hintText;
            label.color = UI_COLOR.text;
            return;
        }
        const sum = sim.summary();
        const rate = sum.workingAge > 0 ? Math.round((sum.employed / sum.workingAge) * 100) : 0;
        label.string = `就业 ${sum.employed}/${sum.workingAge}（${rate}%）· 均薪 ¥${formatNumber(sum.avgSalary)}`;
        label.color = rate >= 60 || sum.workingAge === 0 ? UI_COLOR.textDim : UI_COLOR.down;
    }

    /** 换月、盖楼后刷新一次。开销很小，直接全量重写文字 */
    refresh(): void {
        const sim = this._sim;
        if (!sim) return;
        const state = sim.state;
        const sum = sim.summary();

        this._dayText = DayClock.label();
        if (this._date) this._date.string = `${monthLabel(state.month)}\n${this._dayText}`;
        if (this._funds && !this._roll && this._holdFunds === null) this.setFundsText(state.finance.funds);
        if (this._population) this._population.string = `${sum.population}`;
        if (this._mood) {
            // 没有居民时心情没有意义，显示「—」而不是 0
            this._mood.string = sum.population > 0 ? `${Math.round(sum.avgMood)}` : '—';
            this._mood.color = sum.population === 0 ? UI_COLOR.textDim
                : sum.avgMood >= 60 ? UI_COLOR.up : (sum.avgMood >= 40 ? UI_COLOR.gold : UI_COLOR.down);
        }
        this.refreshHint();
        this.refreshSpeedButtons();
    }

    private setFundsText(v: number): void {
        if (!this._funds) return;
        this._funds.string = `¥${formatNumber(v)}`;
        this._funds.color = v < 0 ? UI_COLOR.down : UI_COLOR.text;
    }

    /** 外部（GameRoot、开场、键盘）改了速度时同步按钮的样子 */
    setSpeed(speed: Speed): void {
        if (speed !== 0) this._lastRunSpeed = speed;
        this._speed = speed;
        this.refreshSpeedButtons();
    }

    get speed(): Speed {
        return this._speed;
    }

    /** 有新账单时右上角红点，看过之后消失 */
    setReportFresh(fresh: boolean): void {
        this._reportFresh = fresh;
        if (this._reportDot) this._reportDot.active = fresh;
    }

    /**
     * 开局（T407）：资金从 from 滚到当前值，dur 秒，结束时胶囊弹一下。
     * 滚动期间 refresh() 不覆盖资金文字。
     */
    rollFunds(from: number, dur = 1): void {
        this._holdFunds = null;
        this._roll = { from, t: 0, dur: Math.max(0.05, dur) };
        this.setFundsText(from);
    }

    /** 资金定格显示 value（null = 恢复显示真实值） */
    holdFunds(value: number | null): void {
        this._holdFunds = value;
        if (value !== null) this.setFundsText(value); else this.refresh();
    }

    protected update(dt: number): void {
        // 钟点变了才改字（每游戏小时一次）
        if (this._date && this._sim && DayClock.label() !== this._dayText) {
            this._dayText = DayClock.label();
            this._date.string = `${monthLabel(this._sim.state.month)}\n${this._dayText}`;
        }
        const roll = this._roll;
        if (!roll || !this._sim) return;
        roll.t += dt;
        const to = this._sim.state.finance.funds;
        const k = Math.min(1, roll.t / roll.dur);
        const e = 1 - Math.pow(1 - k, 3);   // cubicOut：前快后慢，最后几位数字看得清
        this.setFundsText(roll.from + (to - roll.from) * e);
        if (k >= 1) {
            this._roll = null;
            this.setFundsText(to);
            this.pulse(this._fundsChip);
        }
    }

    /** 弹一下：放大 1.15 再回来 */
    private pulse(node: Node | null): void {
        if (!node) return;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.12, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' })
            .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' })
            .start();
    }

    private refreshSpeedButtons(): void {
        if (this._play) {
            // 运行中显示「暂停」图标，暂停时显示「播放」并点亮
            this._play.setIcon(this._speed === 0 ? 'play' : 'pause');
            this._play.setActive(this._speed === 0);
        }
        if (this._fast) this._fast.setActive(this._speed >= 2);
        if (this._fastBadge) {
            this._fastBadge.node.parent!.active = this._speed >= 2;
            this._fastBadge.string = `×${this._speed}`;
        }
    }

    private guard(node: Node): void {
        InputGuard.add(node);
        this._guarded.push(node);
    }

    protected onDestroy(): void {
        for (const n of this._guarded) InputGuard.remove(n);
        if (this._fundsChip) Tween.stopAllByTarget(this._fundsChip);
    }
}
