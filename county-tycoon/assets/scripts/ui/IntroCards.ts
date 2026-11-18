import { _decorator, Color, Component, EventTouch, Graphics, Label, Layers, Node, tween, Tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { TopBar } from './TopBar';
import {
    drawCard, formatNumber, IconName, makeIcon, makeLabel, makePanelNode, UI_COLOR, UI_FONT, UI_PALETTE,
} from './UiTheme';

const { ccclass } = _decorator;

/** 一张开场卡片 */
interface IntroPage {
    icon: IconName;
    /** 正文（可以两行） */
    text: string;
    /** 大字（金额），可选 */
    big?: string;
}

/**
 * 开场 3 张白卡片（T407，DESIGN 13）。只在新档播。
 *
 *   1. 在外打拼多年，你回到了老家。
 *   2. 这次回来，你带了一笔启动资金：¥100,000（金额读 economy.json 的 startFunds）
 *   3. 先修条路、盖几家店，让乡亲们有活干、有钱花。
 *
 * 点任意处翻页，右上「跳过」直接结束。全屏遮罩登记 InputGuard，播放期间地图不响应。
 * 用词：只说「启动资金」，不说是谁给的（D018）。
 */
@ccclass('IntroCards')
export class IntroCards extends Component {
    /** 看完或跳过 */
    onDone: (() => void) | null = null;

    private _pages: IntroPage[] = [];
    private _index = -1;
    private _card: Node | null = null;
    private _done = false;

    static show(parent: Node, startFunds: number): IntroCards {
        const node = new Node('IntroCards');
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        const intro = node.addComponent(IntroCards);
        intro.build(startFunds);
        return intro;
    }

    private build(startFunds: number): void {
        const { width: W, height: H } = view.getVisibleSize();
        this.node.addComponent(UITransform).setContentSize(W, H);

        this._pages = [
            { icon: 'home', text: '在外打拼多年，\n你回到了老家。' },
            { icon: 'coin', text: '这次回来，你带了一笔启动资金', big: `¥${formatNumber(startFunds)}` },
            { icon: 'shop', text: '先修条路、盖几家店，\n让乡亲们有活干、有钱花。' },
        ];

        // 遮罩：比抽屉的深一点，让卡片成为唯一焦点；点任意处翻页
        const shade = makePanelNode(this.node, 'Shade', W, H);
        const g = shade.addComponent(Graphics);
        g.fillColor = new Color(24, 36, 52, 150);
        g.rect(-W / 2, -H / 2, W, H);
        g.fill();
        const so = shade.addComponent(UIOpacity);
        so.opacity = 0;
        tween(so).to(0.3, { opacity: 255 }).start();
        this.node.on(Node.EventType.TOUCH_END, () => this.next(), this);

        // 右上「跳过」：白色胶囊。放在顶栏下面（顶栏高度含灵动岛 / 胶囊避让），不和资金胶囊叠在一起
        const sw = 112, sh = 52;
        const skip = makePanelNode(this.node, 'Skip', sw, sh);
        skip.setPosition(W / 2 - 24 - sw / 2, H / 2 - TopBar.HEIGHT - 18 - sh / 2, 0);
        const sg = skip.addComponent(Graphics);
        sg.fillColor = new Color(255, 255, 255, 230);
        sg.roundRect(-sw / 2, -sh / 2, sw, sh, sh / 2);
        sg.fill();
        makeLabel(skip, 'Txt', '跳过', UI_FONT.small, UI_COLOR.text, sw - 16);
        skip.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            this.finish();
        }, this);

        InputGuard.add(this.node);
        this.next();
    }

    private next(): void {
        if (this._done) return;
        this._index++;
        if (this._index >= this._pages.length) {
            this.finish();
            return;
        }
        const old = this._card;
        if (old) {
            Tween.stopAllByTarget(old);
            tween(old).to(0.18, { position: new Vec3(-120, 0, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'cubicIn' })
                .call(() => old.destroy()).start();
            const oo = old.getComponent(UIOpacity);
            if (oo) tween(oo).to(0.18, { opacity: 0 }).start();
        }
        this._card = this.buildCard(this._pages[this._index]);
    }

    private buildCard(p: IntroPage): Node {
        const CW = 580, CH = 520;
        const card = makePanelNode(this.node, 'Card', CW, CH);
        const g = card.addComponent(Graphics);
        drawCard(g, CW, CH, UI_COLOR.panel, 28);

        // 图标放在一个浅色圆里
        const iconY = CH / 2 - 130;
        const circle = makePanelNode(card, 'IconBg', 150, 150);
        circle.setPosition(0, iconY, 0);
        const cg = circle.addComponent(Graphics);
        cg.fillColor = UI_COLOR.block;
        cg.circle(0, 0, 75);
        cg.fill();
        const icon = makeIcon(circle, p.icon, 100);
        icon.node.setPosition(0, 0, 0);

        const text = makeLabel(card, 'Text', p.text, UI_FONT.title, UI_COLOR.text);
        text.node.getComponent(UITransform)!.setContentSize(CW - 80, 120);
        text.overflow = Label.Overflow.SHRINK;
        text.lineHeight = 46;
        text.node.setPosition(0, p.big ? -40 : -70, 0);

        if (p.big) {
            const big = makeLabel(card, 'Big', p.big, 64, UI_COLOR.gold, CW - 80);
            big.isBold = true;
            big.node.setPosition(0, -120, 0);
        }

        // 页码点 + 点击继续
        const dotsNode = makePanelNode(card, 'Dots', 100, 20);
        dotsNode.setPosition(0, -CH / 2 + 70, 0);
        const dg = dotsNode.addComponent(Graphics);
        for (let i = 0; i < this._pages.length; i++) {
            const on = i === this._index;
            dg.fillColor = on ? UI_PALETTE.blue : UI_COLOR.border;
            const x = (i - (this._pages.length - 1) / 2) * 26;
            if (on) dg.roundRect(x - 12, -5, 24, 10, 5); else dg.circle(x, 0, 5);
            dg.fill();
        }
        const tip = makeLabel(card, 'Tip', this._index < this._pages.length - 1 ? '点击继续' : '点击开始', UI_FONT.small, UI_COLOR.textDim, 200);
        tip.node.setPosition(0, -CH / 2 + 36, 0);

        // 进场：从右边滑进来 + 淡入
        const op = card.addComponent(UIOpacity);
        op.opacity = 0;
        card.setPosition(120, 0, 0);
        card.setScale(0.96, 0.96, 1);
        tween(card).to(0.26, { position: new Vec3(0, 0, 0), scale: new Vec3(1, 1, 1) }, { easing: 'cubicOut' }).start();
        tween(op).to(0.22, { opacity: 255 }).start();
        return card;
    }

    private finish(): void {
        if (this._done) return;
        this._done = true;
        const root = this.node;
        const op = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        tween(op).to(0.2, { opacity: 0 }).call(() => {
            if (root.isValid) root.destroy();
        }).start();
        // 淡出期间就让地图能点、通知外面开始滚资金：不让玩家多等 0.2 秒
        InputGuard.remove(root);
        if (this.onDone) this.onDone();
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
        if (this._card) Tween.stopAllByTarget(this._card);
    }
}
