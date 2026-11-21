import { _decorator, Component, EventMouse, EventTouch, Mask, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

/** 一行：高度 + 往行节点里填内容 */
export interface ListRow {
    height: number;
    /** 行节点已经挂在列表里、位置也摆好了，只需要往上加子节点 */
    build: (row: Node, index: number) => void;
}

/**
 * 可竖向滚动的一列内容（T308 的名单、T309 的居民总览、T310 的大事记都用它）。
 *
 * 做法：根节点挂 Mask（矩形），里面一个 content 节点上下平移。
 * 行是同高的还是不同高的都行，由调用方给 height 决定，符合"档案里一行一句"这种排法。
 *
 * 注意：Cocos 的 Mask 会打断合批，一屏几百行是没问题的（我们最多几十行），
 * 但别在列表里再嵌 Mask。
 */
@ccclass('ScrollList')
export class ScrollList extends Component {
    private _content: Node | null = null;
    private _viewH = 0;
    private _contentH = 0;
    private _scrollY = 0;
    private _dragging = false;
    private _dragDist = 0;
    private _lastY = 0;

    /** 建一个空列表，挂到 parent 下，尺寸 w×h，锚点居中 */
    static mount(parent: Node, name: string, w: number, h: number): ScrollList {
        const node = new Node(name);
        node.layer = parent.layer;
        node.addComponent(UITransform).setContentSize(w, h);
        parent.addChild(node);

        const mask = node.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        const list = node.addComponent(ScrollList);
        list.init(w, h);
        return list;
    }

    private init(w: number, h: number): void {
        this._viewH = h;

        const content = new Node('Content');
        content.layer = this.node.layer;
        content.addComponent(UITransform).setContentSize(w, 0);
        // 内容原点放在列表顶边，往下排
        content.setPosition(0, h / 2, 0);
        content.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        this.node.addChild(content);
        this._content = content;

        this.node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            this._dragging = true;
            this._dragDist = 0;
            this._lastY = e.getUILocation().y;
        }, this);

        this.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            if (!this._dragging) return;
            const y = e.getUILocation().y;
            const dy = y - this._lastY;
            this._lastY = y;
            this._dragDist += Math.abs(dy);
            this.scrollTo(this._scrollY + dy / this.node.worldScale.y);
        }, this);

        this.node.on(Node.EventType.MOUSE_WHEEL, (e: EventMouse) => {
            // 与 Cocos ScrollView 使用相同的滚轮方向和灵敏度。
            this.scrollTo(this._scrollY - e.getScrollY() * 0.1);
        }, this);

        const end = () => {
            this._dragging = false;
        };
        this.node.on(Node.EventType.TOUCH_END, end, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, end, this);
    }

    /** 清空并重新填行 */
    setRows(rows: ListRow[], keepScroll = false): void {
        if (!this._content) return;
        for (const child of this._content.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }

        let y = 0;
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const row = new Node(`Row_${i}`);
            row.layer = this._content.layer;
            row.addComponent(UITransform).setContentSize(this._content.getComponent(UITransform)!.width, r.height);
            // 行用中心锚点、按行中心的 y 摆：行里的文字/图标都是居中的，
            // 用顶部锚点会让内容挂在行的上边线上，上一半被列表的裁剪框切掉（踩过）。
            row.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            row.setPosition(0, -(y + r.height / 2), 0);
            this._content.addChild(row);
            r.build(row, i);
            y += r.height;
        }

        this._contentH = y;
        const trans = this._content.getComponent(UITransform)!;
        trans.setContentSize(trans.width, Math.max(this._viewH, y));
        // 主动筛选时回到顶部，结算刷新时保留位置并夹到新的范围。
        this.scrollTo(keepScroll ? this._scrollY : 0);
    }

    /** 内容总高 > 可视高时才允许滚动，滚到头停住 */
    private scrollTo(value: number): void {
        const max = Math.max(0, this._contentH - this._viewH);
        this._scrollY = Math.max(0, Math.min(max, value));
        this.applyScroll();
    }

    private applyScroll(): void {
        if (!this._content) return;
        this._content.setPosition(0, this._viewH / 2 + this._scrollY, 0);
    }

    /** 刚刚是在拖动列表吗？行上的点击回调可以用它来忽略"想滚结果点到了行" */
    get dragging(): boolean {
        return this._dragDist > 8;
    }
}
