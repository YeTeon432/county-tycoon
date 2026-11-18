import {
    _decorator, Component, EventTouch, Graphics, Label, Layers, Node, Tween, tween, UIOpacity, UITransform, Vec3, view,
} from 'cc';
import { InputGuard } from '../core/InputGuard';
import {
    drawShadow, makeLabelLeft, makePanelNode, makeRoundButton, makeTag, UI_COLOR, UI_FONT, UI_PALETTE, UI_SHEET_RADIUS,
} from './UiTheme';

const { ccclass } = _decorator;

/**
 * 面板骨架：从底部滑上来的白色抽屉（D022 / DESIGN 8.2）。
 * 建筑详情、居民档案、居民总览、月账单共用，子类只管往 content 里填内容。
 *
 *   1. 浅遮罩：盖住全屏并登记 InputGuard，挡住地图手势；点遮罩 = 关闭。
 *   2. 抽屉：全屏宽，贴底，顶部两个大圆角 + 投影；顶部拖动条，往下拖超过 120 就关。
 *   3. 标题行：左标题 + 类别小标签，右上圆形关闭按钮。下面一条分隔线。
 *   4. content：标题行以下、离底 24 的区域，原点在 content 中心。子类用 contentTop / contentH 排版。
 *
 * 关掉时抽屉往下滑出再销毁；被 UiRoot 直接 destroy（换面板）时不播动画。
 */
@ccclass('Panel')
export class Panel extends Component {
    /** 抽屉卡片（全屏宽） */
    protected card: Node | null = null;
    protected content: Node | null = null;
    protected titleLabel: Label | null = null;
    /** 标题右边的类别小标签（节点）。子类在标题行放按钮时可以挪它 */
    protected subtitleTag: Node | null = null;
    /** 兼容旧代码：以前是一个 Label。现在类别是标签，这里保留为 null */
    protected subtitleLabel: Label | null = null;

    /** 面板被关掉时通知（同一时间只留一个面板，父级用它来清引用） */
    onClosed: (() => void) | null = null;

    /** 抽屉宽（会被夹到屏宽）——抽屉总是全屏宽，这个值只留给旧代码读 */
    protected cardW = 720;
    /** 抽屉高（期望值，会被夹到「屏高 - 顶部留 120」） */
    protected cardH = 720;

    /** 标题区高度：拖动条 + 标题行 + 分隔线 */
    static readonly HEAD_H = 116;
    /** 内容区左右留白 */
    static readonly PAD_X = 32;

    private _shade: Node | null = null;
    private _restY = 0;
    private _closing = false;

    /**
     * 建面板并挂到 parent 下。
     * @param title 标题（建筑名 / 居民名）
     * @param subtitle 标题右边的小标签（类别、性别之类），可以不给
     */
    static open<T extends Panel>(
        cls: new () => T,
        parent: Node,
        title: string,
        subtitle = '',
    ): T {
        const node = new Node(cls.name || 'Panel');
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        const panel = node.addComponent(cls);
        panel.buildShell(title, subtitle);
        return panel;
    }

    /** content 顶边（content 自己坐标系里的 y） */
    protected get contentTop(): number {
        return this.contentH / 2;
    }

    protected get contentH(): number {
        return this.content ? this.content.getComponent(UITransform)!.height : 0;
    }

    protected get contentW(): number {
        return this.content ? this.content.getComponent(UITransform)!.width : 0;
    }

    private buildShell(title: string, subtitle: string): void {
        const visible = view.getVisibleSize();
        const W = visible.width;
        const H = visible.height;

        const root = this.node;
        root.layer = Layers.Enum.UI_2D;
        root.addComponent(UITransform).setContentSize(W, H);

        // 遮罩：浅灰蓝，地图还看得见；点它关闭
        const shade = makePanelNode(root, 'Shade', W, H);
        const sg = shade.addComponent(Graphics);
        sg.fillColor = UI_COLOR.shade;
        sg.rect(-W / 2, -H / 2, W, H);
        sg.fill();
        const so = shade.addComponent(UIOpacity);
        so.opacity = 0;
        tween(so).to(0.2, { opacity: 255 }).start();
        shade.on(Node.EventType.TOUCH_END, () => this.close(), this);
        this._shade = shade;

        // 抽屉：全屏宽，高度夹到屏高 - 120（顶栏的日期资金还露着）
        const cw = W;
        const ch = Math.min(this.cardH, H - 120);
        this.cardW = cw;
        this.cardH = ch;
        const card = makePanelNode(root, 'Card', cw, ch);
        this.card = card;
        const cg = card.addComponent(Graphics);
        // 只要顶部两个圆角：矩形往下多画一个圆角的高度，伸出屏幕底边
        const R = UI_SHEET_RADIUS;
        drawShadow(cg, -cw / 2, -ch / 2 - R, cw, ch + R, R, 4);
        cg.fillColor = UI_COLOR.panel;
        cg.roundRect(-cw / 2, -ch / 2 - R, cw, ch + R, R);
        cg.fill();
        // 卡片吃掉点击，点内容不会穿到遮罩把面板关了
        card.on(Node.EventType.TOUCH_END, () => {}, this);

        this._restY = -H / 2 + ch / 2;
        card.setPosition(0, -H / 2 - ch / 2 - 20, 0);
        tween(card).to(0.26, { position: new Vec3(0, this._restY, 0) }, { easing: 'cubicOut' }).start();

        this.buildHeader(card, cw, ch, title, subtitle);

        // 内容区：标题区以下，离底 24
        const contentH = ch - Panel.HEAD_H - 24;
        const content = makePanelNode(card, 'Content', cw - Panel.PAD_X * 2, contentH);
        content.setPosition(0, ch / 2 - Panel.HEAD_H - contentH / 2, 0);
        this.content = content;

        // 只遮挡卡片本身，遮罩区不登记——让点遮罩时 WorldView 仍能接到 tap，
        // 从而实现「点空处关面板 / 点建筑直接开新详情」（原先登记 root = 全屏，导致任何点击都被拦截）
        if (card) InputGuard.add(card);
    }

    private buildHeader(card: Node, cw: number, ch: number, title: string, subtitle: string): void {
        const top = ch / 2;

        // 拖动区（整条标题区都能拖，手指不用对准那根小横条）
        const head = makePanelNode(card, 'Header', cw, Panel.HEAD_H);
        head.setPosition(0, top - Panel.HEAD_H / 2, 0);

        // 拖动条
        const handle = makePanelNode(head, 'Handle', 72, 8);
        handle.setPosition(0, Panel.HEAD_H / 2 - 16, 0);
        const hg = handle.addComponent(Graphics);
        hg.fillColor = UI_COLOR.border;
        hg.roundRect(-36, -4, 72, 8, 4);
        hg.fill();

        const titleY = Panel.HEAD_H / 2 - 60;
        const closeS = 56;
        const titleMaxW = cw - Panel.PAD_X * 2 - closeS - 150;
        this.titleLabel = makeLabelLeft(head, 'Title', title, UI_FONT.title, UI_COLOR.text, titleMaxW);
        this.titleLabel.isBold = true;
        this.titleLabel.node.setPosition(-cw / 2 + Panel.PAD_X, titleY, 0);
        this.titleLabel.overflow = Label.Overflow.SHRINK;

        if (subtitle) {
            const tag = makeTag(head, subtitle, UI_PALETTE.blue);
            // 标签紧跟标题：估标题宽（中文一字 ≈ 字号）
            const tw = Math.min(titleMaxW, title.length * UI_FONT.title);
            const tagW = tag.getComponent(UITransform)!.width;
            tag.setPosition(-cw / 2 + Panel.PAD_X + tw + 14 + tagW / 2, titleY, 0);
            this.subtitleTag = tag;
        }

        // 右上关闭：浅灰圆底 + 深灰叉
        const close = makeRoundButton(head, 'Close', 'close', closeS, () => this.close(), UI_COLOR.textDim, UI_PALETTE.blue, false);
        close.node.setPosition(cw / 2 - Panel.PAD_X - closeS / 2 + 8, titleY, 0);

        // 分隔线
        const line = makePanelNode(head, 'Line', cw - Panel.PAD_X * 2, 2);
        line.setPosition(0, -Panel.HEAD_H / 2 + 8, 0);
        const lg = line.addComponent(Graphics);
        lg.fillColor = UI_COLOR.borderDim;
        lg.rect(-(cw - Panel.PAD_X * 2) / 2, -1, cw - Panel.PAD_X * 2, 2);
        lg.fill();

        this.bindDrag(head);
    }

    /** 标题区往下拖：跟手，松开超过 120 就关，否则弹回 */
    private bindDrag(head: Node): void {
        let dragged = 0;
        head.on(Node.EventType.TOUCH_START, () => { dragged = 0; }, this);
        head.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            const card = this.card;
            if (!card || this._closing) return;
            dragged = Math.max(0, dragged - e.getUIDelta().y);
            card.setPosition(0, this._restY - dragged, 0);
        }, this);
        const end = () => {
            const card = this.card;
            if (!card || this._closing) return;
            if (dragged > 120) {
                this.close();
            } else if (dragged > 0) {
                tween(card).to(0.15, { position: new Vec3(0, this._restY, 0) }, { easing: 'cubicOut' }).start();
            }
            dragged = 0;
        };
        head.on(Node.EventType.TOUCH_END, end, this);
        head.on(Node.EventType.TOUCH_CANCEL, end, this);
    }

    /** 关掉：抽屉滑下去再销毁整棵节点，并马上通知外面 */
    close(): void {
        if (!this.node || !this.node.isValid || this._closing) return;
        this._closing = true;
        this.onClosed?.();
        const card = this.card;
        const H = view.getVisibleSize().height;
        if (this._shade) {
            const so = this._shade.isValid ? this._shade.getComponent(UIOpacity) : null;
            if (so) tween(so).to(0.18, { opacity: 0 }).start();
        }
        if (!card) {
            this.node.destroy();
            return;
        }
        tween(card)
            .to(0.18, { position: new Vec3(0, -H / 2 - this.cardH / 2 - 20, 0) }, { easing: 'cubicIn' })
            .call(() => { if (this.node && this.node.isValid) this.node.destroy(); })
            .start();
    }

    protected onDestroy(): void {
        if (this.card) InputGuard.remove(this.card);
        // 动画进行中被 UiRoot 直接销毁时，别让 tween 继续改已销毁的节点
        // 销毁时子节点可能已经先被销毁（组件表已清空），先查 isValid 再碰，否则 getComponent 会抛错
        if (this.card && this.card.isValid) Tween.stopAllByTarget(this.card);
        const so = this._shade && this._shade.isValid ? this._shade.getComponent(UIOpacity) : null;
        if (so) Tween.stopAllByTarget(so);
    }
}
