import { _decorator, Color, Component, Graphics, Label, Layers, Node, UITransform, Vec3 } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { PendingPlace, WorldView } from './WorldView';

const { ccclass } = _decorator;

/**
 * 放置确认条（D022，DESIGN 12）：预览上方浮出「换朝向 / 确定 / ✕」。
 *
 * - 每帧问 WorldView 预览在屏幕上的位置，跟着走（拖地图、缩放都跟得上）；靠边时夹回屏幕内。
 * - 放不下时「确定」变灰，下面一行红字说原因。
 * - 整条登记 InputGuard，点按钮不会穿透成「点地块」。
 * - 自己画按钮，配色按 DESIGN 8.2（白卡片、草绿确定、珊瑚红取消），不依赖 UiTheme 的实现细节。
 */
@ccclass('PlaceControls')
export class PlaceControls extends Component {
    private _view: WorldView | null = null;
    private _row: Node | null = null;
    private _rotate: Btn | null = null;
    private _ok: Btn | null = null;
    private _cancel: Btn | null = null;
    private _reason: Label | null = null;
    private _reasonBg: Graphics | null = null;
    private _top = 0;
    private _bottom = 0;
    private readonly _tmp = new Vec3();

    static readonly W = 420;
    static readonly H = 72;

    /**
     * @param top    屏幕上方被顶栏占掉的高度（从屏幕顶往下算）
     * @param bottom 屏幕下方被底栏占掉的高度
     */
    setup(view: WorldView, top: number, bottom: number): void {
        this._view = view;
        this._top = top;
        this._bottom = bottom;
        const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        ui.setContentSize(PlaceControls.W, PlaceControls.H + 44);

        const row = new Node('Row');
        row.layer = Layers.Enum.UI_2D;
        row.addComponent(UITransform).setContentSize(PlaceControls.W, PlaceControls.H);
        this.node.addChild(row);
        this._row = row;
        row.setPosition(0, 22, 0);

        this._rotate = makeBtn(row, '↻ 换朝向', 156, C.white, C.text, -122, () => view.rotatePending());
        this._ok = makeBtn(row, '✓ 确定', 156, C.green, C.white, 44, () => view.confirmPending());
        this._cancel = makeBtn(row, '✕', 64, C.white, C.red, 170, () => view.cancelPending());

        const rn = new Node('Reason');
        rn.layer = Layers.Enum.UI_2D;
        rn.addComponent(UITransform).setContentSize(260, 36);
        this.node.addChild(rn);
        rn.setPosition(0, -30, 0);
        this._reasonBg = rn.addComponent(Graphics);
        const ln = new Node('Txt');
        ln.layer = Layers.Enum.UI_2D;
        ln.addComponent(UITransform).setContentSize(250, 36);
        // 文字放不下时缩字号，不换行
        rn.addChild(ln);
        this._reason = ln.addComponent(Label);
        this._reason.fontSize = 22;
        this._reason.lineHeight = 28;
        this._reason.color = C.white;
        this._reason.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._reason.verticalAlign = Label.VerticalAlign.CENTER;
        this._reason.overflow = Label.Overflow.SHRINK;

        InputGuard.add(this.node);
        this.node.active = false;
        view.onPendingChanged = (p) => this.refresh(p);
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }

    private refresh(p: PendingPlace | null): void {
        this.node.active = !!p;
        if (!p) return;
        this._rotate!.setEnabled(p.canRotate);
        this._ok!.setEnabled(p.ok);
        const show = !p.ok && !!p.reason;
        this._reason!.node.parent!.active = show;
        if (show) {
            this._reason!.string = p.reason;
            // 红条宽度按字数估（中文 22 号约 22 像素 / 字），放得下「预算不够（还差 ¥12,345）」
            const w = Math.min(PlaceControls.W, Math.max(160, p.reason.length * 22 + 36));
            this._reason!.node.getComponent(UITransform)!.setContentSize(w - 20, 36);
            this._reason!.node.parent!.getComponent(UITransform)!.setContentSize(w, 36);
            const g = this._reasonBg!;
            g.clear();
            g.fillColor = C.red;
            g.roundRect(-w / 2, -18, w, 36, 18);
            g.fill();
        }
        this.follow();
    }

    protected lateUpdate(): void {
        if (this.node.active) this.follow();
    }

    /** 放到预览上方 24 像素；超出屏幕就夹回来（上面放不下就放到预览下方也看不见，干脆贴着顶栏） */
    private follow(): void {
        const view = this._view, parent = this.node.parent;
        if (!view || !parent) return;
        const a = view.pendingAnchorUI(this._tmp);
        if (!a) return;
        const pui = parent.getComponent(UITransform)!;
        pui.convertToNodeSpaceAR(a, a);
        const halfW = pui.width / 2, halfH = pui.height / 2;
        const w = PlaceControls.W / 2 + 12, h = (PlaceControls.H + 44) / 2;
        const x = Math.max(-halfW + w, Math.min(halfW - w, a.x));
        const y = Math.max(-halfH + this._bottom + h, Math.min(halfH - this._top - h, a.y + 24 + h));
        this.node.setPosition(x, y, 0);
    }
}

// ---------------------------------------------------------------- 小按钮
const C = {
    white: new Color(255, 255, 255, 255),
    text: new Color(51, 54, 61, 255),
    green: new Color(76, 174, 76, 255),
    red: new Color(232, 87, 74, 255),
    grey: new Color(200, 204, 210, 255),
    shadow: new Color(0, 0, 0, 40),
};

interface Btn {
    node: Node;
    setEnabled: (on: boolean) => void;
}

function makeBtn(parent: Node, text: string, w: number, fill: Color, fg: Color, x: number, onTap: () => void): Btn {
    const h = PlaceControls.H - 8;
    const node = new Node(`Btn_${text}`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    parent.addChild(node);
    node.setPosition(x, 0, 0);
    const g = node.addComponent(Graphics);
    const ln = new Node('Txt');
    ln.layer = Layers.Enum.UI_2D;
    ln.addComponent(UITransform).setContentSize(w - 12, h);
    node.addChild(ln);
    const label = ln.addComponent(Label);
    label.string = text;
    label.fontSize = 26;
    label.lineHeight = 32;
    label.isBold = true;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;

    let enabled = true;
    const draw = () => {
        g.clear();
        g.fillColor = C.shadow;
        g.roundRect(-w / 2, -h / 2 - 4, w, h, h / 2);
        g.fill();
        g.fillColor = enabled ? fill : C.grey;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();
        label.color = enabled ? fg : C.white;
    };
    draw();
    node.on(Node.EventType.TOUCH_END, () => { if (enabled) onTap(); });
    return {
        node,
        setEnabled: (on: boolean) => { if (on !== enabled) { enabled = on; draw(); } },
    };
}
