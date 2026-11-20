import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform, view } from 'cc';
import { getPlatform } from '../platform/Platform';
import { InputGuard } from '../core/InputGuard';
import { drawHudTile, IconName, makeIcon, makeLabel, makePanelNode, UI_HUD } from './UiTheme';

const { ccclass } = _decorator;

/** 地图右侧工具台。镜头和环境图层由 WorldView 控制。 */
@ccclass('ZoomButtons')
export class ZoomButtons extends Component {
    onStep: ((delta: number) => void) | null = null;
    onRotate: (() => void) | null = null;
    onEnvironment: (() => boolean) | null = null;
    onSettings: (() => void) | null = null;

    private _label: Label | null = null;
    private _plus: Sprite | null = null;
    private _minus: Sprite | null = null;

    build(bottomReserve: number): void {
        const w = 88, keyW = 74, keyH = 48, step = 53;
        const h = step * (this.onRotate ? 5 : 4) + 42;
        const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        ui.setContentSize(w, h);
        const align = () => {
            const visible = view.getVisibleSize();
            const info = getPlatform().systemInfo();
            const right = info.screenWidth > 0 ? (info.screenWidth - info.safeArea.right) * visible.width / info.screenWidth : 0;
            this.node.setPosition(visible.width / 2 - Math.max(0, right) - w / 2 - 14, -visible.height / 2 + bottomReserve + h / 2 + 8, 0);
        };
        align();
        view.on('canvas-resize', align, this);
        const g = this.node.addComponent(Graphics);
        drawHudTile(g, -w / 2, -h / 2, w, h, 14, UI_HUD.base, UI_HUD.rim);

        let y = h / 2 - keyH / 2 - 7;
        const key = (name: string, onTap: () => void, icon?: IconName, title = '') => {
            const node = makePanelNode(this.node, name, keyW, keyH);
            node.setPosition(0, y, 0);
            y -= step;
            const graphics = node.addComponent(Graphics);
            const image = icon ? makeIcon(node, icon, 26, UI_HUD.text) : null;
            const label = title ? makeLabel(node, 'Text', title, 21, UI_HUD.text, keyW - 6) : null;
            if (label) label.isBold = true;
            const draw = (active: boolean) => {
                graphics.clear();
                drawHudTile(graphics, -keyW / 2, -keyH / 2, keyW, keyH, 9,
                    active ? UI_HUD.accent : UI_HUD.key, active ? UI_HUD.accentRim : UI_HUD.rim);
                if (label) label.color = active ? UI_HUD.onAccent : UI_HUD.text;
            };
            draw(false);
            node.on(Node.EventType.TOUCH_END, onTap, this);
            return { image, draw };
        };

        key('SettingsBtn', () => this.onSettings?.(), undefined, '设置');
        const environment = key('EnvBtn', () => environment.draw(this.onEnvironment?.() ?? false), undefined, '环境');
        if (this.onRotate) key('RotateBtn', () => this.onRotate?.(), 'rotate');
        this._plus = key('ZoomIn', () => this.onStep?.(1), 'plus').image;
        this._label = makeLabel(this.node, 'ZoomText', '', 20, UI_HUD.dim, keyW - 6);
        this._label.isBold = true;
        this._label.node.setPosition(0, y + 9, 0);
        y -= 34;
        this._minus = key('ZoomOut', () => this.onStep?.(-1), 'minus').image;
        InputGuard.add(this.node);
    }

    refresh(zoom: number, index: number, count: number): void {
        if (this._label) this._label.string = `×${Math.round(zoom * 10) / 10}`;
        const disabled = new Color(160, 134, 109);
        if (this._plus) this._plus.color = index < count - 1 ? UI_HUD.text : disabled;
        if (this._minus) this._minus.color = index > 0 ? UI_HUD.text : disabled;
    }

    protected onDestroy(): void {
        view.targetOff(this);
        InputGuard.remove(this.node);
    }
}
