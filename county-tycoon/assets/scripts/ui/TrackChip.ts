import { _decorator, Color, Component, EventTouch, Label, Layers, Node, UITransform, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { BuildingBar } from './BuildingBar';
import { drawGraphicsOnEnable, drawShadow, makeIcon, makeLabel, makeLabelLeft, UI_COLOR, UI_FONT, UI_PALETTE } from './UiTheme';

const { ccclass } = _decorator;

const C_PERSON = new Color(242, 140, 40, 255);

/**
 * 追踪条（T425）：底栏上面居中一条白色胶囊。
 *   [橙圆·姓]  张三 · 在超市上班        [家] [×]
 * 点左边（人）→ 镜头移到他；点「家」→ 镜头移到他家；点 × → 结束追踪。
 * 子节点不各自接点击（Cocos 的点击会往父节点冒泡，点 × 也会触发「移到他」），整条一个回调按 x 分区。
 */
@ccclass('TrackChip')
export class TrackChip extends Component {
    static readonly W = 460;
    static readonly H = 64;

    onFocusPerson: (() => void) | null = null;
    onFocusHome: (() => void) | null = null;
    onStop: (() => void) | null = null;

    private _badge: Label | null = null;
    private _text: Label | null = null;

    static create(parent: Node): TrackChip {
        const W = TrackChip.W, H = TrackChip.H;
        const node = new Node('TrackChip');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(W, H);
        node.active = false;
        parent.addChild(node);
        const chip = node.addComponent(TrackChip);

        const bx = -W / 2 + 8 + 24;
        drawGraphicsOnEnable(node, (g) => {
            drawShadow(g, -W / 2, -H / 2, W, H, H / 2, 2);
            g.fillColor = UI_COLOR.panel;
            g.roundRect(-W / 2, -H / 2, W, H, H / 2);
            g.fill();
            // 左边是姓氏，右边是回家和关闭按钮。
            g.fillColor = C_PERSON;
            g.circle(bx, 0, 24);
            g.fill();
            g.fillColor = UI_PALETTE.blue;
            g.circle(W / 2 - 8 - 22 - 52, 0, 22);
            g.fill();
            g.fillColor = UI_COLOR.block;
            g.circle(W / 2 - 8 - 22, 0, 22);
            g.fill();
        });

        chip._badge = makeLabel(node, 'Badge', '', UI_FONT.body, UI_PALETTE.white);
        chip._badge.isBold = true;
        chip._badge.node.setPosition(bx, 0, 0);
        chip._text = makeLabelLeft(node, 'Text', '', UI_FONT.small, UI_COLOR.text, W - 8 - 48 - 12 - 120);
        chip._text.node.setPosition(bx + 24 + 12, 0, 0);
        makeIcon(node, 'home', 26, UI_PALETTE.white).node.setPosition(W / 2 - 8 - 22 - 52, 0, 0);
        makeIcon(node, 'close', 22, UI_COLOR.textDim).node.setPosition(W / 2 - 8 - 22, 0, 0);

        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            const p = node.getComponent(UITransform)!.convertToNodeSpaceAR(e.getUILocation().toVec3());
            if (p.x > W / 2 - 8 - 48) chip.onStop?.();
            else if (p.x > W / 2 - 8 - 48 - 56) chip.onFocusHome?.();
            else chip.onFocusPerson?.();
        });
        chip.layout();
        return chip;
    }

    /** 底栏上面、居中 */
    layout(): void {
        const vis = view.getVisibleSize();
        this.node.setPosition(0, -vis.height / 2 + BuildingBar.BAR_HEIGHT + 24 + TrackChip.H / 2, 0);
    }

    /** 地图可见区域底边要让多少（追踪箭头别躲到这条后面） */
    static get bottomReserve(): number {
        return BuildingBar.BAR_HEIGHT + 24 + TrackChip.H + 16;
    }

    show(name: string): void {
        if (this._badge) this._badge.string = name.slice(0, 1);
        this.setText(name);
        this.node.active = true;
        InputGuard.add(this.node);
    }

    hide(): void {
        this.node.active = false;
        InputGuard.remove(this.node);
    }

    setText(text: string): void {
        if (this._text && this._text.string !== text) this._text.string = text;
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }
}
