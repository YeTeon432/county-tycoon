import {
    _decorator, Component, Node, UITransform, Layers, Graphics, Color, Label,
    EventTouch, view, Vec3,
} from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { InputGuard } from '../core/InputGuard';
import { hexToColor } from '../core/ColorUtil';

const { ccclass } = _decorator;

/** 一个可点的建筑按钮 */
interface BuildingButton {
    node: Node;
    frame: Graphics;
    def: BuildingDef;
}

/**
 * 底部的建筑选择栏 + 拆除开关。
 *
 * 竖屏只有 720 宽，15 种建筑一屏塞不下，所以做成横向可滑动的一排。
 * 用 Graphics 画按钮而不是 Sprite，理由和地图一样：占位阶段没有美术资源（D003）。
 *
 * 布局约定（容易算错，记在这里）：
 *   所有按钮的 x 是"相对整条栏中心"的坐标，栏中心在屏幕正中，宽度等于屏幕宽。
 *   第 i 个按钮的中心 = -屏宽/2 + 内边距 + 按钮宽/2 + i*(按钮宽+间距) - 滚动量
 *   注意要再加半个按钮宽，否则第一个按钮会有一半跑到屏幕外。
 *
 * 整条栏会登记到 InputGuard，点按钮的时候地图不会跟着响应（D005）。
 */
@ccclass('BuildingBar')
export class BuildingBar extends Component {
    private _defs: BuildingDef[] = [];
    private _buttons: BuildingButton[] = [];

    /** 横向滚动量，0 表示最左；范围 [0, maxScroll] */
    private _scrollX = 0;
    private _dragging = false;
    private _dragDist = 0;

    private _demolishMode = false;
    private _selectedId: string | null = null;

    /** 一条栏的总高 */
    static readonly BAR_HEIGHT = 200;
    /** 按钮尺寸与间距 */
    static readonly ITEM_W = 112;
    static readonly ITEM_H = 128;
    static readonly ITEM_GAP = 10;
    static readonly PADDING = 14;

    onSelect: ((def: BuildingDef | null) => void) | null = null;
    onDemolishToggle: ((on: boolean) => void) | null = null;

    build(defs: BuildingDef[]): void {
        this._defs = defs;

        const visible = view.getVisibleSize();
        const barH = BuildingBar.BAR_HEIGHT;

        this.node.layer = Layers.Enum.UI_2D;
        const trans = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        trans.setContentSize(visible.width, barH);
        this.node.setPosition(0, -visible.height / 2 + barH / 2, 0);

        this.buildBackground(visible.width, barH);
        this.buildItems();
        this.buildDemolishButton(visible.width, barH);
        this.registerBarScroll();
        this.applyScroll();

        // 整条栏吃掉点击，地图不响应
        InputGuard.add(this.node);
    }

    private buildBackground(width: number, height: number): void {
        const bgNode = new Node('BarBg');
        bgNode.layer = Layers.Enum.UI_2D;
        bgNode.addComponent(UITransform).setContentSize(width, height);
        this.node.addChild(bgNode);

        const g = bgNode.addComponent(Graphics);
        g.fillColor = new Color(20, 20, 26, 232);
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();
        // 顶边一条亮线，和地图区分开
        g.fillColor = new Color(120, 120, 140, 200);
        g.rect(-width / 2, height / 2 - 2, width, 2);
        g.fill();
    }

    /** 把建筑按钮排成一排（x 先算好，滚动时再整体位移） */
    private buildItems(): void {
        for (let i = 0; i < this._defs.length; i++) {
            this._buttons.push(this.buildItem(this._defs[i]));
        }
    }

    private buildItem(def: BuildingDef): BuildingButton {
        const w = BuildingBar.ITEM_W;
        const h = BuildingBar.ITEM_H;

        const node = new Node(`Item_${def.id}`);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        this.node.addChild(node);

        // 选中框：默认不画，选中时描一圈亮色 + 浅底
        const frame = node.addComponent(Graphics);

        // 建筑色块：按真实占格比例画，1×1 和 2×2 一眼能分出来
        const swatchNode = new Node('Swatch');
        swatchNode.layer = Layers.Enum.UI_2D;
        swatchNode.addComponent(UITransform).setContentSize(w, h);
        swatchNode.setPosition(0, 16, 0);
        node.addChild(swatchNode);
        const sg = swatchNode.addComponent(Graphics);
        const maxSide = 58;
        const unit = maxSide / Math.max(def.width, def.height);
        const sw = Math.max(10, unit * def.width * 0.86);
        const sh = Math.max(10, unit * def.height * 0.86);
        hexToColor(def.color, sg.fillColor);
        sg.rect(-sw / 2, -sh / 2, sw, sh);
        sg.fill();
        // 顶部一条暗边，有"上面"的方向感
        const roofH = Math.max(4, Math.round(sh / 5));
        sg.fillColor = new Color(0, 0, 0, 70);
        sg.rect(-sw / 2, sh / 2 - roofH, sw, roofH);
        sg.fill();

        // 名字，贴在按钮底部
        const nameNode = new Node('Name');
        nameNode.layer = Layers.Enum.UI_2D;
        nameNode.addComponent(UITransform).setContentSize(w, 30);
        nameNode.setPosition(0, -h / 2 + 18, 0);
        node.addChild(nameNode);
        const label = nameNode.addComponent(Label);
        label.string = def.name;
        label.fontSize = 20;
        label.lineHeight = 24;
        label.color = new Color(235, 235, 240, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;

        node.on(Node.EventType.TOUCH_END, () => {
            // 刚刚是在滑动列表，就不要当成点击
            if (this._dragging) return;
            this.handleItemClick(def);
        }, this);

        return { node, frame, def };
    }

    /** 整条栏负责横向滚动 */
    private registerBarScroll(): void {
        this.node.on(Node.EventType.TOUCH_START, () => {
            this._dragDist = 0;
            this._dragging = false;
        }, this);

        this.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            const d = e.getUIDelta();
            this._dragDist += Math.abs(d.x);
            if (this._dragDist > 6) this._dragging = true;
            if (this._dragging) this.scrollBy(-d.x);
        }, this);

        const end = () => {
            this._dragging = false;
            this._dragDist = 0;
        };
        this.node.on(Node.EventType.TOUCH_END, end, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, end, this);
    }

    /** 内容总宽（含两侧内边距） */
    private contentWidth(): number {
        const n = this._defs.length;
        if (n === 0) return 0;
        return BuildingBar.PADDING * 2 + n * BuildingBar.ITEM_W + (n - 1) * BuildingBar.ITEM_GAP;
    }

    private maxScroll(): number {
        return Math.max(0, this.contentWidth() - view.getVisibleSize().width);
    }

    private scrollBy(px: number): void {
        this._scrollX += px;
        this.applyScroll();
    }

    /** 按当前滚动量摆放所有按钮 */
    private applyScroll(): void {
        const visibleW = view.getVisibleSize().width;
        const max = this.maxScroll();
        if (this._scrollX < 0) this._scrollX = 0;
        if (this._scrollX > max) this._scrollX = max;

        const startX = -visibleW / 2 + BuildingBar.PADDING + BuildingBar.ITEM_W / 2;
        for (let i = 0; i < this._buttons.length; i++) {
            const x = startX + i * (BuildingBar.ITEM_W + BuildingBar.ITEM_GAP) - this._scrollX;
            // 按钮中心随滚动移到栏外时，直接靠裁剪交给 GPU（不显式隐藏，避免闪烁）
            this._buttons[i].node.setPosition(x, 0, 0);
        }
    }

    private handleItemClick(def: BuildingDef): void {
        // 再点一次已选中的 → 取消选择
        if (this._selectedId === def.id) {
            this._selectedId = null;
            this.refreshSelection();
            if (this.onSelect) this.onSelect(null);
            return;
        }
        this._selectedId = def.id;
        this._demolishMode = false;
        this.refreshSelection();
        if (this.onSelect) this.onSelect(def);
        if (this.onDemolishToggle) this.onDemolishToggle(false);
    }

    /** 右上角的拆除开关，浮在建筑列表上方 */
    private buildDemolishButton(visibleW: number, barH: number): void {
        const w = 96;
        const h = 54;
        const node = new Node('DemolishBtn');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(w, h);
        // 放在栏的右上角内侧
        node.setPosition(visibleW / 2 - w / 2 - 12, barH / 2 - h / 2 - 8, 0);
        this.node.addChild(node);

        const g = node.addComponent(Graphics);
        this.drawDemolish(g, w, h, false);

        const labelNode = new Node('Txt');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform).setContentSize(w, h);
        node.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.string = '拆除';
        label.fontSize = 24;
        label.lineHeight = 28;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        node.on(Node.EventType.TOUCH_END, () => {
            if (this._dragging) return;
            this._demolishMode = !this._demolishMode;
            if (this._demolishMode) this._selectedId = null;
            this.drawDemolish(g, w, h, this._demolishMode);
            this.refreshSelection();
            // 只走这一个回调：进入拆除模式时 WorldView 自己会清掉选中的建筑。
            // 这里不要再调 onSelect(null)，否则 selectBuilding 会把刚设好的拆除状态又清掉。
            if (this.onDemolishToggle) this.onDemolishToggle(this._demolishMode);
        }, this);
    }

    private drawDemolish(g: Graphics, w: number, h: number, active: boolean): void {
        g.clear();
        g.fillColor = active ? new Color(180, 40, 40, 240) : new Color(60, 60, 72, 230);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = active ? new Color(255, 140, 140, 255) : new Color(120, 120, 140, 255);
        g.rect(-w / 2, -h / 2, w, h);
        g.stroke();
    }

    /** 高亮当前选中项 */
    private refreshSelection(): void {
        const w = BuildingBar.ITEM_W;
        const h = BuildingBar.ITEM_H;
        for (let i = 0; i < this._buttons.length; i++) {
            const btn = this._buttons[i];
            const active = btn.def.id === this._selectedId;
            btn.frame.clear();
            if (active) {
                btn.frame.fillColor = new Color(255, 214, 90, 34);
                btn.frame.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
                btn.frame.fill();
                btn.frame.lineWidth = 3;
                btn.frame.strokeColor = new Color(255, 214, 90, 255);
                btn.frame.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
                btn.frame.stroke();
            }
            const s = active ? 1.06 : 1;
            btn.node.setScale(s, s, 1);
        }
    }

    /** 取消所有选中 */
    clearSelection(): void {
        this._selectedId = null;
        this.refreshSelection();
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
    }
}
