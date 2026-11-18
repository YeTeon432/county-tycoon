import { _decorator, Component, Graphics, Label, Node, UITransform, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { drawShadow, makeLabel, makePanelNode, makeRoundButton, UI_COLOR, UI_FONT, UI_PALETTE } from './UiTheme';

const { ccclass } = _decorator;

/**
 * 右侧的缩放按钮：＋ / 当前倍率 / －（双指和滚轮之外再给一个明确的入口）。
 * T406 起和顶栏一个风格：白色圆按钮 + 投影，中间一个白色小胶囊写倍率。
 * 只负责按钮本身，真正的缩放交给 onStep（WorldView.zoomStep）。
 */
@ccclass('ZoomButtons')
export class ZoomButtons extends Component {
    /** +1 放大一档，-1 缩小一档 */
    onStep: ((delta: number) => void) | null = null;

    private _label: Label | null = null;
    private _plus: ReturnType<typeof makeRoundButton> | null = null;
    private _minus: ReturnType<typeof makeRoundButton> | null = null;

    private static readonly SIZE = 64;
    private static readonly MID_H = 40;
    private static readonly GAP = 10;

    /** @param bottomReserve 底部被建筑栏占掉的高度 */
    static totalHeight(): number {
        return ZoomButtons.SIZE * 2 + ZoomButtons.MID_H + ZoomButtons.GAP * 2;
    }

    build(bottomReserve: number): void {
        const visible = view.getVisibleSize();
        const S = ZoomButtons.SIZE, G = ZoomButtons.GAP, M = ZoomButtons.MID_H;
        const totalH = S * 2 + M + G * 2;
        const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        ui.setContentSize(S + 12, totalH);
        this.node.setPosition(visible.width / 2 - S / 2 - 16, -visible.height / 2 + bottomReserve + totalH / 2 + 24, 0);

        this._plus = makeRoundButton(this.node, 'ZoomIn', 'plus', S, () => this.onStep && this.onStep(1));
        this._plus.node.setPosition(0, totalH / 2 - S / 2, 0);

        const mid = makePanelNode(this.node, 'ZoomText', S + 8, M);
        const g = mid.addComponent(Graphics);
        drawShadow(g, -(S + 8) / 2, -M / 2, S + 8, M, M / 2, 2);
        g.fillColor = UI_PALETTE.white;
        g.roundRect(-(S + 8) / 2, -M / 2, S + 8, M, M / 2);
        g.fill();
        this._label = makeLabel(mid, 'Txt', '', UI_FONT.small, UI_COLOR.text, S);
        this._label.isBold = true;

        this._minus = makeRoundButton(this.node, 'ZoomOut', 'minus', S, () => this.onStep && this.onStep(-1));
        this._minus.node.setPosition(0, -totalH / 2 + S / 2, 0);
        InputGuard.add(this.node);
    }

    /** 倍率变化后刷新：中间显示当前档，到头的按钮图标变浅 */
    refresh(zoom: number, index: number, count: number): void {
        if (this._label) this._label.string = `×${Math.round(zoom * 10) / 10}`;
        if (this._plus) this._plus.icon.color = index < count - 1 ? UI_PALETTE.ink : UI_COLOR.border;
        if (this._minus) this._minus.icon.color = index > 0 ? UI_PALETTE.ink : UI_COLOR.border;
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }
}
