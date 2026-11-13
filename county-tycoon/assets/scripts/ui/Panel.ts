import { _decorator, Color, Component, Graphics, Label, Layers, Node, UITransform, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { drawPanel, makeLabel, UI_COLOR, UI_FONT, UI_RADIUS } from './UiTheme';

const { ccclass } = _decorator;

/**
 * 弹窗骨架（T308 的建筑详情、T309 的居民总览、T310 的月账单共用）。
 *
 * 三件事它负责，子类只管往里填内容：
 *   1. 半透明遮罩：盖住全屏并登记 InputGuard，挡住地图手势；点遮罩 = 关闭。
 *   2. 圆角卡片 + 标题 + 右上角关闭按钮。
 *   3. 内容区原点：卡片中心，子类往上摆东西即可。
 *
 * 遮罩是不透明的黑（alpha 大约 150），既挡住背后的点击，也让玩家的注意力进来。
 * 关掉的时候整棵节点销毁，不保留状态——面板每次都是重开的，不缓存。
 */
@ccclass('Panel')
export class Panel extends Component {
    protected card: Node | null = null;
    protected content: Node | null = null;
    protected titleLabel: Label | null = null;

    /** 面板被关掉时通知（同一时间只留一个面板，父级用它来清引用） */
    onClosed: (() => void) | null = null;

    protected cardW = 620;
    protected cardH = 720;

    /**
     * 建面板并挂到 parent 下。
     * @param title 标题（建筑名 / 居民名）
     * @param subtitle 标题右边的小字（类别、年龄之类），可以不给
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

    private buildShell(title: string, subtitle: string): void {
        const visible = view.getVisibleSize();
        const W = visible.width;
        const H = visible.height;

        // 根节点铺满全屏：遮罩和卡片都挂在它下面
        const root = this.node;
        root.layer = Layers.Enum.UI_2D;
        root.addComponent(UITransform).setContentSize(W, H);

        // 遮罩。用一个独立的子节点，点它关闭。
        const shade = new Node('Shade');
        shade.layer = Layers.Enum.UI_2D;
        shade.addComponent(UITransform).setContentSize(W, H);
        root.addChild(shade);
        const sg = shade.addComponent(Graphics);
        sg.fillColor = new Color(0, 0, 0, 152);
        sg.rect(-W / 2, -H / 2, W, H);
        sg.fill();
        shade.on(Node.EventType.TOUCH_END, () => this.close(), this);

        // 卡片。宽 620 在 720 的屏上左右各留 50，竖屏够用。
        const cw = Math.min(this.cardW, W - 60);
        const ch = Math.min(this.cardH, H - 200);
        const card = new Node('Card');
        card.layer = Layers.Enum.UI_2D;
        card.addComponent(UITransform).setContentSize(cw, ch);
        root.addChild(card);
        this.card = card;
        const cg = card.addComponent(Graphics);
        drawPanel(cg, cw, ch, UI_COLOR.panel, UI_COLOR.border, UI_RADIUS + 4);
        // 卡片本身吃掉点击，避免点内容时穿透到遮罩把面板关了
        card.on(Node.EventType.TOUCH_END, () => {}, this);

        // 标题行：贴着卡片左边（卡片宽 cw，左边缘 = -cw/2），右边给副标题和关闭按钮留位置
        this.titleLabel = makeLabel(card, 'Title', title, UI_FONT.title, UI_COLOR.text, cw - 170);
        this.titleLabel.node.setPosition(-cw / 2 + 22, ch / 2 - 46, 0);
        this.titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.titleLabel.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);

        if (subtitle) {
            const sub = makeLabel(card, 'Subtitle', subtitle, UI_FONT.small, UI_COLOR.textDim, 100);
            sub.node.setPosition(cw / 2 - 86, ch / 2 - 46, 0);
            sub.horizontalAlign = Label.HorizontalAlign.RIGHT;
            sub.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
        }

        // 标题下的分隔线
        const line = new Node('Line');
        line.layer = Layers.Enum.UI_2D;
        line.addComponent(UITransform).setContentSize(cw - 40, 2);
        line.setPosition(0, ch / 2 - 78, 0);
        card.addChild(line);
        const lg = line.addComponent(Graphics);
        lg.fillColor = UI_COLOR.borderDim;
        lg.rect(-(cw - 40) / 2, -1, cw - 40, 2);
        lg.fill();

        // 右上角关闭
        this.buildCloseButton(card, cw, ch);

        // 内容区：卡片中心往下一点，子类往这里摆
        const content = new Node('Content');
        content.layer = Layers.Enum.UI_2D;
        content.addComponent(UITransform).setContentSize(cw - 40, ch - 120);
        content.setPosition(0, -30, 0);
        card.addChild(content);
        this.content = content;

        // 整块盖住地图
        InputGuard.add(root);
    }

    private buildCloseButton(card: Node, cw: number, ch: number): void {
        const S = 52;
        const node = new Node('Close');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(S, S);
        node.setPosition(cw / 2 - S / 2 - 12, ch / 2 - S / 2 - 16, 0);
        card.addChild(node);

        const g = node.addComponent(Graphics);
        g.fillColor = UI_COLOR.button;
        g.roundRect(-S / 2, -S / 2, S, S, 10);
        g.fill();

        const label = makeLabel(node, 'Txt', '✕', 28, UI_COLOR.text, S);
        label.node.setPosition(0, 0, 0);

        node.on(Node.EventType.TOUCH_END, () => this.close(), this);
    }

    /** 关掉：销毁整棵节点，并通知外面 */
    close(): void {
        if (!this.node || !this.node.isValid) return;
        this.onClosed?.();
        this.node.destroy();
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }
}
