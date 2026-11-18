import { _decorator, Color, Component, Graphics, Label, Layers, Node, UITransform } from 'cc';

const { ccclass } = _decorator;

/** 追踪的两个目标：人（橙）/ 他家（蓝） */
export type TrackWhat = 'person' | 'home';

const C_PERSON = new Color(242, 140, 40, 255);
const C_HOME = new Color(58, 134, 214, 255);
const C_WHITE = new Color(255, 255, 255, 255);
const C_SHADOW = new Color(0, 0, 0, 50);

/**
 * 居民追踪的画面（T425）。挂在 WorldView 节点下、地图容器之上，用**屏幕坐标**画（不随地图缩放变大变小）。
 *
 *   - 目标在屏幕里：头顶一个往下指的箭头。人 = 橙色圆 + 姓 + 名字条，上下轻轻跳；家 = 蓝色圆「家」。
 *     人在家里时两个箭头会叠在同一个楼顶，人的箭头往上让一截。
 *   - 目标跑出屏幕（或被顶栏 / 底栏挡住）：贴在可见区域边上一个圆，带一个小三角指向目标方向，点一下镜头移过去。
 *
 * 只管画和点边上的圆；人在哪、家在哪由 WorldView 每帧算好传进来。
 */
@ccclass('Tracker')
export class Tracker extends Component {
    /** 可见地图区域的四边让多少（屏幕坐标）：上面让顶栏 + 公告，下面让底栏 + 追踪条 */
    insetTop = 360;
    insetBottom = 360;
    insetSide = 44;

    private _g: Graphics | null = null;
    private _nameL: Label | null = null;
    private _pBadge: Label | null = null;
    private _hBadge: Label | null = null;
    private _t = 0;
    /** 这一帧边上的圆画在哪（点击用）；null = 目标在屏幕里，没有圆 */
    private readonly _edge: Record<TrackWhat, { x: number; y: number } | null> = { person: null, home: null };

    static create(parent: Node): Tracker {
        const node = new Node('Tracker');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        const t = node.addComponent(Tracker);
        t._g = node.addComponent(Graphics);
        t._nameL = Tracker.label(node, 'Name', 20);
        t._pBadge = Tracker.label(node, 'PBadge', 22);
        t._hBadge = Tracker.label(node, 'HBadge', 20);
        t._hBadge.string = '家';
        node.active = false;
        return t;
    }

    private static label(parent: Node, name: string, size: number): Label {
        const n = new Node(name);
        n.layer = Layers.Enum.UI_2D;
        n.addComponent(UITransform);
        parent.addChild(n);
        const l = n.addComponent(Label);
        l.fontSize = size;
        l.lineHeight = size + 4;
        l.isBold = true;
        l.color = C_WHITE;
        l.cacheMode = Label.CacheMode.CHAR;
        return l;
    }

    /** 开始 / 换人追踪：名字用来写名字条，姓写进圆里 */
    begin(name: string): void {
        this.node.active = true;
        if (this._nameL) this._nameL.string = name;
        if (this._pBadge) this._pBadge.string = name.slice(0, 1);
    }

    end(): void {
        this.node.active = false;
        this._edge.person = this._edge.home = null;
    }

    get tracking(): boolean {
        return this.node.active;
    }

    /**
     * 每帧画一次。坐标都是本节点（= WorldView 节点，屏幕中心为原点）的坐标；null = 这一帧没有这个目标。
     * stacked = 人就在家里（两个箭头叠一起，人的往上让）。
     */
    draw(person: { x: number; y: number } | null, home: { x: number; y: number } | null, stacked: boolean, viewW: number, viewH: number, dt: number): void {
        const g = this._g;
        if (!g) return;
        this._t += dt;
        g.clear();
        const box = {
            l: -viewW / 2 + this.insetSide, r: viewW / 2 - this.insetSide,
            b: -viewH / 2 + this.insetBottom, t: viewH / 2 - this.insetTop,
        };
        // 家先画，人后画（人压在上面）
        this._edge.home = home ? this.drawOne(g, 'home', home, 0, box) : null;
        if (!home && this._hBadge) this._hBadge.node.active = false;
        this._edge.person = person ? this.drawOne(g, 'person', person, stacked ? 46 : 0, box) : null;
        if (!person) {
            if (this._pBadge) this._pBadge.node.active = false;
            if (this._nameL) this._nameL.node.active = false;
        }
    }

    /** 点中了边上的哪个圆（坐标同 draw）；在屏幕里的箭头不接点击，点它等于点地图 */
    hit(x: number, y: number): TrackWhat | null {
        for (const w of ['person', 'home'] as TrackWhat[]) {
            const e = this._edge[w];
            if (e && (x - e.x) ** 2 + (y - e.y) ** 2 <= 40 * 40) return w;
        }
        return null;
    }

    /** 画一个目标；返回边上圆的位置（目标在屏幕里返回 null） */
    private drawOne(g: Graphics, what: TrackWhat, p: { x: number; y: number }, lift: number,
        box: { l: number; r: number; b: number; t: number }): { x: number; y: number } | null {
        const isP = what === 'person';
        const color = isP ? C_PERSON : C_HOME;
        const badge = isP ? this._pBadge : this._hBadge;
        const R = isP ? 20 : 17;
        // 圆心要在可见区域里：留出圆 + 名字条的高度
        const inside = p.x >= box.l && p.x <= box.r && p.y >= box.b && p.y + lift + 70 <= box.t;
        if (inside) {
            const bob = isP ? Math.sin(this._t * 5) * 4 : 0;
            const tipY = p.y + 6 + lift + bob;
            const cy = tipY + 14 + R;
            // 影子 + 往下指的三角 + 圆
            g.fillColor = C_SHADOW;
            g.circle(p.x + 2, cy - 2, R + 3);
            g.fill();
            g.fillColor = C_WHITE;
            g.moveTo(p.x - 11, cy - R + 6); g.lineTo(p.x + 11, cy - R + 6); g.lineTo(p.x, tipY - 3); g.close();
            g.fill();
            g.circle(p.x, cy, R + 3);
            g.fill();
            g.fillColor = color;
            g.moveTo(p.x - 8, cy - R + 4); g.lineTo(p.x + 8, cy - R + 4); g.lineTo(p.x, tipY); g.close();
            g.fill();
            g.circle(p.x, cy, R);
            g.fill();
            this.placeBadge(badge, p.x, cy);
            if (isP && this._nameL) {
                // 名字条：圆上面一条橙色胶囊
                const n = this._nameL;
                const w = Math.max(56, n.string.length * n.fontSize + 20), h = 30;
                const ny = cy + R + 8 + h / 2;
                g.fillColor = C_WHITE;
                g.roundRect(p.x - w / 2 - 2, ny - h / 2 - 2, w + 4, h + 4, h / 2 + 2);
                g.fill();
                g.fillColor = color;
                g.roundRect(p.x - w / 2, ny - h / 2, w, h, h / 2);
                g.fill();
                n.node.active = true;
                n.node.setPosition(p.x, ny, 0);
            }
            return null;
        }
        if (isP && this._nameL) this._nameL.node.active = false;
        // 出了可见区域：从区域中心往目标连线，和区域边框的交点就是圆的位置
        const cx0 = (box.l + box.r) / 2, cy0 = (box.b + box.t) / 2;
        const dx = p.x - cx0, dy = p.y + lift - cy0;
        const sx = dx !== 0 ? ((dx > 0 ? box.r : box.l) - cx0) / dx : Infinity;
        const sy = dy !== 0 ? ((dy > 0 ? box.t : box.b) - cy0) / dy : Infinity;
        const s = Math.min(sx, sy, 1);
        let ex = cx0 + dx * s, ey = cy0 + dy * s;
        // 家和人在同一方向时错开一点，别叠成一个（家先画，人避开家）
        if (isP && this._edge.home && (ex - this._edge.home.x) ** 2 + (ey - this._edge.home.y) ** 2 < 60 * 60) {
            if (Math.abs(ex - box.l) < 1 || Math.abs(ex - box.r) < 1) ey += ey > this._edge.home.y ? 30 : -30; else ex += ex > this._edge.home.x ? 30 : -30;
        }
        const ang = Math.atan2(dy, dx);
        const ER = 26;
        // 指向目标的小三角（在圆外沿）
        const tx = ex + Math.cos(ang) * (ER + 14), ty = ey + Math.sin(ang) * (ER + 14);
        const lx = ex + Math.cos(ang + 0.5) * (ER - 2), ly = ey + Math.sin(ang + 0.5) * (ER - 2);
        const rx = ex + Math.cos(ang - 0.5) * (ER - 2), ry = ey + Math.sin(ang - 0.5) * (ER - 2);
        g.fillColor = C_SHADOW;
        g.circle(ex + 2, ey - 2, ER + 4);
        g.fill();
        g.fillColor = color;
        g.moveTo(lx, ly); g.lineTo(tx, ty); g.lineTo(rx, ry); g.close();
        g.fill();
        g.fillColor = C_WHITE;
        g.circle(ex, ey, ER + 3);
        g.fill();
        g.fillColor = color;
        g.circle(ex, ey, ER);
        g.fill();
        this.placeBadge(badge, ex, ey);
        return { x: ex, y: ey };
    }

    private placeBadge(l: Label | null, x: number, y: number): void {
        if (!l) return;
        l.node.active = true;
        l.node.setPosition(x, y, 0);
    }
}
