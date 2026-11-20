import { _decorator, Component, Graphics, Label, Layers, Node, Sprite, tween, Tween, UITransform, Vec3, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { SimApi } from '../core/sim/SimApi';
import { getPlatform } from '../platform/Platform';
import { DayClock } from '../core/DayClock';
import { monthLabel } from '../core/sim/types';
import {
    drawGraphicsOnEnable, drawHudTile, drawShadow, formatNumber, IconName, makeIcon, makeLabel, makeLabelLeft,
    makePanelNode, setIcon, UI_COLOR, UI_HUD,
} from './UiTheme';

const { ccclass } = _decorator;

export type Speed = 0 | 1 | 2 | 3;

@ccclass('TopBar')
export class TopBar extends Component {
    static readonly BODY_HEIGHT = 158;
    static get HEIGHT(): number {
        return TopBar.topInset() + TopBar.BODY_HEIGHT;
    }

    private static _inset: number | null = null;

    /** 微信、抖音宿主胶囊或设备顶部安全区。 */
    static topInset(): number {
        if (TopBar._inset !== null) return TopBar._inset;
        const info = getPlatform().systemInfo();
        const visible = view.getVisibleSize();
        const logical = info.menuButton ? info.menuButton.bottom : info.safeArea.top;
        TopBar._inset = info.screenWidth > 0 ? Math.max(0, Math.round(logical * visible.width / info.screenWidth)) : 0;
        return TopBar._inset;
    }

    onSpeedChange: ((speed: Speed) => void) | null = null;
    onReportTap: (() => void) | null = null;
    onPopulationTap: (() => void) | null = null;
    onCenterTap: (() => void) | null = null;

    private _sim: SimApi | null = null;
    private _speed: Speed = 1;
    private _lastRunSpeed: Speed = 1;
    private _date: Label | null = null;
    private _clock: Label | null = null;
    private _funds: Label | null = null;
    private _population: Label | null = null;
    private _mood: Label | null = null;
    private _goalText: Label | null = null;
    private _goalMeter: Graphics | null = null;
    private _goalProgress = -1;
    private _playIcon: Sprite | null = null;
    private _speedText: Label | null = null;
    private _reportDot: Node | null = null;
    private _centerDot: Node | null = null;
    private _roll: { from: number; t: number; dur: number } | null = null;
    private _holdFunds: number | null = null;

    build(sim: SimApi): void {
        this._sim = sim;
        const visible = view.getVisibleSize();
        const w = visible.width - 28;
        const h = TopBar.BODY_HEIGHT - 16;
        this.node.layer = Layers.Enum.UI_2D;
        const trans = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        trans.setContentSize(w, h);
        this.node.setPosition(0, visible.height / 2 - TopBar.topInset() - 10 - h / 2, 0);
        const g = this.node.addComponent(Graphics);
        drawShadow(g, -w / 2, -h / 2, w, h, 18, 2);
        drawHudTile(g, -w / 2, -h / 2, w, h, 18, UI_HUD.base, UI_HUD.rim);

        this.buildStats(w - 16);
        this.buildActions(w - 16);
        this.refresh();
        this.refreshSpeedButtons();
        InputGuard.add(this.node);
    }

    private buildStats(w: number): void {
        const gap = 6;
        const available = w - gap * 3;
        let left = -w / 2;
        const stat = (name: string, icon: IconName, caption: string, ratio: number, onTap?: () => void) => {
            const width = available * ratio;
            const tile = makePanelNode(this.node, name, width, 66);
            tile.setPosition(left + width / 2, 30, 0);
            left += width + gap;
            drawHudTile(tile.addComponent(Graphics), -width / 2, -33, width, 66, 10,
                onTap ? UI_HUD.key : UI_HUD.recess, UI_HUD.rim);
            makeIcon(tile, icon, 34).node.setPosition(-width / 2 + 25, 0, 0);
            const textX = -width / 2 + 47;
            const detail = makeLabelLeft(tile, 'Caption', caption, 18, UI_HUD.dim, width - 53);
            detail.node.setPosition(textX, 15, 0);
            const value = makeLabelLeft(tile, 'Value', '', 29, UI_HUD.text, width - 53);
            value.node.setPosition(textX, -12, 0);
            value.isBold = true;
            if (onTap) tile.on(Node.EventType.TOUCH_END, onTap, this);
            return { value, detail };
        };

        const date = stat('Date', 'calendar', '', 0.26);
        this._date = date.value;
        this._date.fontSize = 23;
        this._clock = date.detail;
        this._funds = stat('Funds', 'coin', '建设资金', 0.31).value;
        this._population = stat('Population', 'people', '居民 ›', 0.205, () => this.onPopulationTap?.()).value;
        this._mood = stat('Mood', 'smile', '幸福度', 0.225).value;
    }

    private buildActions(w: number): void {
        const gap = 8;
        const reportW = 116;
        const playW = 62;
        const speedW = 104;
        const centerW = w - reportW - playW - speedW - gap * 3;
        let left = -w / 2;
        const key = (name: string, width: number, onTap: () => void) => {
            const node = makePanelNode(this.node, name, width, 51);
            node.setPosition(left + width / 2, -37, 0);
            left += width + gap;
            drawHudTile(node.addComponent(Graphics), -width / 2, -25.5, width, 51, 10, UI_HUD.key, UI_HUD.rim);
            node.on(Node.EventType.TOUCH_START, () => node.setScale(0.97, 0.97, 1));
            node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
            node.on(Node.EventType.TOUCH_END, () => {
                node.setScale(1, 1, 1);
                onTap();
            });
            return node;
        };

        const center = key('CenterBtn', centerW, () => this.onCenterTap?.());
        makeIcon(center, 'center', 34).node.setPosition(-centerW / 2 + 25, 0, 0);
        this._goalText = makeLabelLeft(center, 'Goals', '发展目标', 23, UI_HUD.text, centerW - 155);
        this._goalText.node.setPosition(-centerW / 2 + 48, 0, 0);
        this._goalText.isBold = true;
        const meter = makePanelNode(center, 'GoalMeter', 76, 10);
        meter.setPosition(centerW / 2 - 54, -1, 0);
        this._goalMeter = meter.addComponent(Graphics);
        this._centerDot = this.makeDot(center, centerW);

        const report = key('ReportBtn', reportW, () => {
            this.setReportFresh(false);
            this.onReportTap?.();
        });
        makeIcon(report, 'bill', 25, UI_HUD.text).node.setPosition(-29, 0, 0);
        const reportText = makeLabel(report, 'Title', '账单', 23, UI_HUD.text, 58);
        reportText.node.setPosition(17, 0, 0);
        this._reportDot = this.makeDot(report, reportW);

        const play = key('Speed_play', playW, () => this.pickSpeed(this._speed === 0 ? this._lastRunSpeed : 0));
        this._playIcon = makeIcon(play, 'pause', 26, UI_HUD.text);

        const speed = key('Speed_fast', speedW, () => {
            const next: Speed = this._speed < 2 ? 2 : this._speed === 2 ? 3 : 1;
            this.pickSpeed(next);
        });
        makeIcon(speed, 'fast', 22, UI_HUD.dim).node.setPosition(-25, 0, 0);
        this._speedText = makeLabel(speed, 'Speed', '', 23, UI_HUD.text, 54);
        this._speedText.node.setPosition(15, 0, 0);
        this._speedText.isBold = true;
    }

    private makeDot(parent: Node, w: number): Node {
        const dot = makePanelNode(parent, 'Dot', 16, 16);
        dot.setPosition(w / 2 - 8, 18, 0);
        dot.active = false;
        drawGraphicsOnEnable(dot, (g) => {
            g.fillColor = UI_HUD.key;
            g.circle(0, 0, 8);
            g.fill();
            g.fillColor = UI_COLOR.down;
            g.circle(0, 0, 5);
            g.fill();
        });
        return dot;
    }

    setGoals(done: number, total: number, pendingDeal: boolean): void {
        const ready = total > 0 && done === total;
        if (this._centerDot) this._centerDot.active = pendingDeal || ready;
        if (this._goalText) {
            this._goalText.string = pendingDeal ? '招商待交地' : ready ? '可申请升级' : total ? `发展目标 ${done}/${total}` : '发展中心';
            this._goalText.color = ready || pendingDeal ? UI_HUD.accent : UI_HUD.text;
        }
        const progress = total ? done / total : 0;
        const g = this._goalMeter;
        if (!g || progress === this._goalProgress) return;
        this._goalProgress = progress;
        g.clear();
        g.fillColor = UI_COLOR.border;
        g.roundRect(-38, -5, 76, 10, 5);
        g.fill();
        if (progress > 0) {
            g.fillColor = UI_HUD.accent;
            const width = 76 * progress;
            g.roundRect(-38, -5, width, 10, Math.min(5, width / 2));
            g.fill();
        }
    }

    private pickSpeed(speed: Speed): void {
        this.setSpeed(speed);
        this.onSpeedChange?.(speed);
    }

    refresh(): void {
        const sim = this._sim;
        if (!sim) return;
        const state = sim.state;
        const sum = sim.summary();

        if (this._date) this._date.string = monthLabel(state.month);
        if (this._clock) this._clock.string = DayClock.label();
        if (this._funds && !this._roll && this._holdFunds === null) this.setFundsText(state.finance.funds);
        if (this._population) this._population.string = formatNumber(sum.population);
        if (this._mood) {
            this._mood.string = sum.population > 0 ? `${Math.round(sum.avgMood)}` : '—';
            this._mood.color = sum.population === 0 ? UI_HUD.dim
                : sum.avgMood >= 60 ? UI_COLOR.up : sum.avgMood >= 40 ? UI_COLOR.gold : UI_COLOR.down;
        }
    }

    private setFundsText(v: number): void {
        if (!this._funds) return;
        this._funds.string = `¥${formatNumber(v)}`;
        this._funds.color = v < 0 ? UI_COLOR.down : UI_COLOR.gold;
    }

    setSpeed(speed: Speed): void {
        if (speed !== 0) this._lastRunSpeed = speed;
        this._speed = speed;
        this.refreshSpeedButtons();
    }

    get speed(): Speed {
        return this._speed;
    }

    setReportFresh(fresh: boolean): void {
        if (this._reportDot) this._reportDot.active = fresh;
    }

    /**
     * 开局（T407）：资金从 from 滚到当前值，dur 秒，结束时金额弹一下。
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
        const time = DayClock.label();
        if (this._clock && this._clock.string !== time) this._clock.string = time;
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
            this.pulse(this._funds?.node ?? null);
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
        if (this._playIcon) {
            setIcon(this._playIcon, this._speed === 0 ? 'play' : 'pause');
            this._playIcon.color = this._speed === 0 ? UI_HUD.accent : UI_HUD.text;
        }
        if (this._speedText) {
            this._speedText.string = this._speed === 0 ? '暂停' : `×${this._speed}`;
            this._speedText.color = this._speed === 1 ? UI_HUD.text : UI_HUD.accent;
        }
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
        if (this._funds) Tween.stopAllByTarget(this._funds.node);
    }
}
