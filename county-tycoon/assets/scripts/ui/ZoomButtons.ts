import { _decorator, Color, Component, Graphics, Label, Layers, Node, UITransform, view } from 'cc';
import { InputGuard } from '../core/InputGuard';

const { ccclass } = _decorator;

/**
 * 右侧的缩放按钮：＋ / 当前倍率 / －（用户提出，双指和滚轮之外再给一个明确的入口）。
 * 只负责按钮本身，真正的缩放交给 onStep 回调（WorldView.zoomStep）。
 * 整块登记到 InputGuard，点按钮时地图不会误放建筑。
 */
@ccclass('ZoomButtons')
export class ZoomButtons extends Component {
    /** +1 放大一档，-1 缩小一档 */
    onStep: ((delta: number) => void) | null = null;

    private _label: Label | null = null;
    private _plus: Graphics | null = null;
    private _minus: Graphics | null = null;

    private static readonly SIZE = 76;
    private static readonly GAP = 8;

    /** @param bottomReserve 底部被建筑栏占掉的高度 */
    build(bottomReserve: number): void {
        const visible = view.getVisibleSize();
        const S = ZoomButtons.SIZE, G = ZoomButtons.GAP;
        const totalH = S * 2 + 44 + G * 2;
        const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        ui.setContentSize(S, totalH);
        this.node.setPosition(visible.width / 2 - S / 2 - 16, -visible.height / 2 + bottomReserve + totalH / 2 + 20, 0);

        this._plus = this.makeButton('ZoomIn', '＋', totalH / 2 - S / 2, () => this.onStep && this.onStep(1));
        this._label = this.makeLabel(0);
        this._minus = this.makeButton('ZoomOut', '－', -totalH / 2 + S / 2, () => this.onStep && this.onStep(-1));
        InputGuard.add(this.node);
    }

    /** 倍率变化后刷新：中间显示当前档，到头的按钮变灰 */
    refresh(zoom: number, index: number, count: number): void {
        if (this._label) this._label.string = `×${zoom}`;
        this.drawButton(this._plus, index < count - 1);
        this.drawButton(this._minus, index > 0);
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }

    private makeButton(name: string, text: string, y: number, onTap: () => void): Graphics {
        const S = ZoomButtons.SIZE;
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(S, S);
        node.setPosition(0, y, 0);
        this.node.addChild(node);
        const g = node.addComponent(Graphics);
        this.drawButton(g, true);

        const t = new Node('Txt');
        t.layer = Layers.Enum.UI_2D;
        t.addComponent(UITransform).setContentSize(S, S);
        node.addChild(t);
        const label = t.addComponent(Label);
        label.string = text;
        label.fontSize = 44;
        label.lineHeight = 48;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        node.on(Node.EventType.TOUCH_END, onTap, this);
        return g;
    }

    private makeLabel(y: number): Label {
        const node = new Node('ZoomText');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(ZoomButtons.SIZE, 44);
        node.setPosition(0, y, 0);
        this.node.addChild(node);
        const label = node.addComponent(Label);
        label.fontSize = 26;
        label.lineHeight = 30;
        label.color = new Color(255, 255, 255, 255);
        label.enableOutline = true;
        label.outlineColor = new Color(26, 18, 24, 255);
        label.outlineWidth = 2;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private drawButton(g: Graphics | null, enabled: boolean): void {
        if (!g) return;
        const S = ZoomButtons.SIZE;
        g.clear();
        g.fillColor = enabled ? new Color(46, 34, 47, 220) : new Color(46, 34, 47, 110);
        g.roundRect(-S / 2, -S / 2, S, S, 14);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = enabled ? new Color(232, 228, 240, 230) : new Color(138, 138, 158, 140);
        g.roundRect(-S / 2, -S / 2, S, S, 14);
        g.stroke();
    }
}
