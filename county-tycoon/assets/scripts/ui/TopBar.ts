import { _decorator, Color, Component, Graphics, Layers, Label, Node, UITransform, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { SimApi } from '../core/sim/SimApi';
import { monthLabel } from '../core/sim/types';
import { drawPanel, formatNumber, makeLabel, moodLabel, UI_COLOR, UI_FONT } from './UiTheme';

const { ccclass } = _decorator;

/** 时间档位：0 暂停 / 1 正常 / 2 两倍 */
export type Speed = 0 | 1 | 2;

/**
 * 顶栏（T307）：日期、建设资金、人口、平均心情，加一排速度按钮。
 *
 * 数据全部来自 SimApi（state + summary()），不碰模拟实现。
 * 整条栏登记到 InputGuard，否则点速度按钮会穿透到地图上放建筑。
 *
 * 高度取 120，和 GameRoot 里旧的 HUD 同高：旧 HUD 是占位，正式界面上来后
 * 应该由集成删掉（已写进 devlog 的「需要集成」），在删掉之前这一栏正好把它盖住。
 */
@ccclass('TopBar')
export class TopBar extends Component {
    static readonly HEIGHT = 120;

    /** 玩家点了速度按钮 */
    onSpeedChange: ((speed: Speed) => void) | null = null;
    /** 玩家点了「账单」 */
    onReportTap: (() => void) | null = null;
    /** 玩家点了「人口」→ 打开居民总览 */
    onPopulationTap: (() => void) | null = null;

    private _sim: SimApi | null = null;
    private _speed: Speed = 1;

    private _date: Label | null = null;
    private _funds: Label | null = null;
    private _population: Label | null = null;
    private _mood: Label | null = null;
    private _employment: Label | null = null;

    private readonly _speedButtons: { node: Node; g: Graphics; speed: Speed }[] = [];
    private _reportNode: Node | null = null;
    private _reportG: Graphics | null = null;
    private _reportLabel: Label | null = null;
    /** 有没有"还没看过"的新账单（图标旁的小圆点） */
    private _reportFresh = false;

    build(sim: SimApi): void {
        this._sim = sim;
        const visible = view.getVisibleSize();
        const W = visible.width;
        const H = TopBar.HEIGHT;

        this.node.layer = Layers.Enum.UI_2D;
        const trans = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        trans.setContentSize(W, H);
        // 顶栏贴屏幕上沿
        this.node.setPosition(0, visible.height / 2 - H / 2, 0);

        const bg = this.node.addComponent(Graphics);
        // 底色必须完全不透明：GameRoot 里还有一块旧的占位 HUD（同为 120 高、同一位置），
        // 半透明会让那两行旧文字从后面透上来。等集成删掉旧 HUD 后可以改回半透明。
        drawPanel(bg, W, H, new Color(18, 18, 24, 255), null, 0);

        // 按列排，列宽写死。720 宽摆四列，每列宽度见下面的常量。
        // 用 SHRINK 让文字自己缩，不会因为数字变大就溢出列。
        const C1_W = 150;   // 日期
        const C2_W = 200;   // 资金
        const C3_W = 110;   // 人口
        const C4_W = 175;   // 心情
        const PAD = 18;
        const GAP = 6;
        const row1 = 26;

        let x = -W / 2 + PAD + C1_W / 2;
        this._date = makeLabel(this.node, 'Date', '', UI_FONT.number, UI_COLOR.text, C1_W);
        this._date.node.setPosition(x, row1, 0);

        x += C1_W / 2 + GAP + C2_W / 2;
        this._funds = makeLabel(this.node, 'Funds', '', UI_FONT.number, UI_COLOR.gold, C2_W);
        this._funds.node.setPosition(x, row1, 0);

        x += C2_W / 2 + GAP + C3_W / 2;
        this._population = makeLabel(this.node, 'Population', '', UI_FONT.number, UI_COLOR.gold, C3_W);
        this._population.node.setPosition(x, row1, 0);
        // 人口这一列可以点，进居民总览。文字用金色表示"可点"，和旁边只读的心情区分开。
        const popBtn = new Node('PopulationBtn');
        popBtn.layer = Layers.Enum.UI_2D;
        popBtn.addComponent(UITransform).setContentSize(C3_W + 24, 52);
        popBtn.setPosition(x, row1, 0);
        this.node.addChild(popBtn);
        popBtn.on(Node.EventType.TOUCH_END, () => {
            if (this.onPopulationTap) this.onPopulationTap();
        }, this);

        x += C3_W / 2 + GAP + C4_W / 2;
        this._mood = makeLabel(this.node, 'Mood', '', UI_FONT.number, UI_COLOR.up, C4_W);
        this._mood.node.setPosition(x, row1, 0);

        // 第二行：左边就业 + 账单按钮，右边速度按钮
        const row2 = -32;
        const RW = 76;   // 账单按钮宽
        this._employment = makeLabel(this.node, 'Employment', '', UI_FONT.small, UI_COLOR.textDim, W - 2 * PAD - 3 * 74 - RW - 30);
        this._employment.node.setPosition(-W / 2 + PAD, row2, 0);
        this._employment.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._employment.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);

        this.buildSpeedButtons(W, row2);
        this.buildReportButton(W, row2, RW);

        this.refresh();
        InputGuard.add(this.node);
    }

    /** 换月、盖楼后刷新一次。开销很小，直接全量重写文字 */
    refresh(): void {
        const sim = this._sim;
        if (!sim) return;
        const state = sim.state;
        const sum = sim.summary();

        if (this._date) this._date.string = monthLabel(state.month);
        if (this._funds) this._funds.string = `¥${formatNumber(state.finance.funds)}`;
        if (this._population) this._population.string = `${sum.population}人`;
        if (this._mood) {
            this._mood.string = `心情${Math.round(sum.avgMood)}`;
            this._mood.color = sum.avgMood >= 60 ? UI_COLOR.up : (sum.avgMood >= 40 ? UI_COLOR.gold : UI_COLOR.down);
        }
        if (this._employment) {
            const rate = sum.workingAge > 0 ? Math.round((sum.employed / sum.workingAge) * 100) : 0;
            this._employment.string = `就业 ${sum.employed}/${sum.workingAge}（${rate}%）　均薪 ¥${formatNumber(sum.avgSalary)}`;
            this._employment.color = rate >= 60 ? UI_COLOR.textDim : UI_COLOR.down;
        }
        this.refreshSpeedButtons();
    }

    /** 外部（比如 GameRoot 或键盘）改了速度时同步按钮的样子 */
    setSpeed(speed: Speed): void {
        this._speed = speed;
        this.refreshSpeedButtons();
    }

    private buildSpeedButtons(visibleW: number, y: number): void {
        // 从右往左排：2× / 1× / ⏸
        const defs: { speed: Speed; text: string }[] = [
            { speed: 2, text: '×2' },
            { speed: 1, text: '×1' },
            { speed: 0, text: '⏸' },
        ];
        const W = 64;
        const H = 44;
        const GAP = 10;
        let x = visibleW / 2 - 18 - W / 2;
        for (const d of defs) {
            const node = new Node(`Speed_${d.speed}`);
            node.layer = Layers.Enum.UI_2D;
            node.addComponent(UITransform).setContentSize(W, H);
            node.setPosition(x, y, 0);
            this.node.addChild(node);

            const g = node.addComponent(Graphics);
            makeLabel(node, 'Txt', d.text, UI_FONT.body, UI_COLOR.text, W);

            node.on(Node.EventType.TOUCH_END, () => {
                this._speed = d.speed;
                this.refreshSpeedButtons();
                if (this.onSpeedChange) this.onSpeedChange(d.speed);
            }, this);

            this._speedButtons.push({ node, g, speed: d.speed });
            x -= W + GAP;
        }
    }

    /** 「账单」按钮：看上月收支和大事记。有新账单时右下角一个小圆点 */
    private buildReportButton(visibleW: number, y: number, W: number): void {
        const H = 44;
        // 摆在速度按钮左边 10 的空位
        const x = visibleW / 2 - 18 - 3 * 64 - 2 * 10 - 10 - W / 2;

        const node = new Node('ReportBtn');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(W, H);
        node.setPosition(x, y, 0);
        this.node.addChild(node);

        const g = node.addComponent(Graphics);
        this._reportG = g;
        this._reportLabel = makeLabel(node, 'Txt', '账单', UI_FONT.small, UI_COLOR.text, W - 6);

        node.on(Node.EventType.TOUCH_END, () => {
            this._reportFresh = false;
            this.drawReportButton();
            if (this.onReportTap) this.onReportTap();
        }, this);

        this._reportNode = node;
        this.drawReportButton();
    }

    /** 有新账单时亮起来（金边 + 圆点），看过之后恢复常态 */
    setReportFresh(fresh: boolean): void {
        this._reportFresh = fresh;
        this.drawReportButton();
    }

    private drawReportButton(): void {
        const g = this._reportG;
        if (!g) return;
        const W = 76;
        const H = 44;
        g.clear();
        g.fillColor = this._reportFresh ? UI_COLOR.buttonActive : UI_COLOR.button;
        g.roundRect(-W / 2, -H / 2, W, H, 10);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = this._reportFresh ? new Color(255, 240, 190, 255) : UI_COLOR.borderDim;
        g.roundRect(-W / 2, -H / 2, W, H, 10);
        g.stroke();
        if (this._reportLabel) {
            this._reportLabel.color = this._reportFresh ? new Color(40, 30, 20, 255) : UI_COLOR.text;
        }
        if (this._reportFresh) {
            // 右上角的小圆点，提醒"有新的"
            g.fillColor = UI_COLOR.down;
            g.circle(W / 2 - 8, H / 2 - 8, 6);
            g.fill();
        }
    }

    private refreshSpeedButtons(): void {
        const W = 64;
        const H = 44;
        for (const b of this._speedButtons) {
            const active = b.speed === this._speed;
            b.g.clear();
            b.g.fillColor = active ? UI_COLOR.buttonActive : UI_COLOR.button;
            b.g.roundRect(-W / 2, -H / 2, W, H, 10);
            b.g.fill();
            b.g.lineWidth = 2;
            b.g.strokeColor = active ? new Color(255, 240, 190, 255) : UI_COLOR.borderDim;
            b.g.roundRect(-W / 2, -H / 2, W, H, 10);
            b.g.stroke();
            const label = b.node.getChildByName('Txt')?.getComponent(Label);
            if (label) label.color = active ? new Color(40, 30, 20, 255) : UI_COLOR.text;
        }
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }
}
