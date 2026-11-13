import { Color, Graphics, Label, Layers, Node, UITransform } from 'cc';

/**
 * 经营界面的统一外观（支线 B）。
 *
 * 场景是像素风，界面按 D003 的约定做高清：清晰字体、圆角面板、半透明深底。
 * 颜色和字号集中在这里，改一处就是全局，避免每个面板各写一套。
 */

export const UI_COLOR = {
    /** 面板底色（深，压在浅色地图上不刺眼） */
    panel: new Color(20, 20, 26, 232),
    /** 次级块的底色，比面板亮一点 */
    block: new Color(42, 42, 54, 240),
    /** 按钮常态 */
    button: new Color(46, 34, 47, 230),
    /** 按钮按下 / 选中 */
    buttonActive: new Color(255, 214, 90, 235),
    /** 面板和按钮的描边 */
    border: new Color(120, 120, 140, 200),
    borderDim: new Color(120, 120, 140, 110),
    /** 正文 */
    text: new Color(235, 235, 240, 255),
    /** 次要文字：单位、说明 */
    textDim: new Color(150, 150, 170, 255),
    /** 数字强调（资金、日期） */
    gold: new Color(255, 214, 90, 255),
    /** 上涨 */
    up: new Color(120, 220, 140, 255),
    /** 下跌 */
    down: new Color(255, 120, 120, 255),
};

export const UI_FONT = {
    /** 面板标题 */
    title: 30,
    /** 顶栏里的主要数字 */
    number: 30,
    /** 正文 */
    body: 24,
    /** 小字、单位 */
    small: 20,
};

/** 半径统一，圆角看起来是一套东西 */
export const UI_RADIUS = 14;

/**
 * 造一个居中的文字节点（Label 只能挂在有 UITransform 的节点上）。
 *
 * 竖屏 720 宽，手排的位置很容易被长文字撑出屏幕，所以支持给一个宽度：
 * 给了宽度就按宽度收缩字号（SHRINK），文字再长也不会溢出格子。
 */
export function makeLabel(
    parent: Node,
    name: string,
    text: string,
    fontSize: number,
    color: Color = UI_COLOR.text,
    width?: number,
): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    const trans = node.addComponent(UITransform);
    parent.addChild(node);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    if (width !== undefined) {
        trans.setContentSize(width, label.lineHeight);
        label.overflow = Label.Overflow.SHRINK;
    }
    return label;
}

/** 在节点自己的 Graphics 上画一个圆角面板（不新建子节点） */
export function drawPanel(
    g: Graphics,
    w: number,
    h: number,
    fill: Color = UI_COLOR.panel,
    stroke: Color | null = UI_COLOR.border,
    radius: number = UI_RADIUS,
): void {
    g.clear();
    g.fillColor = fill;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    if (stroke) {
        g.lineWidth = 2;
        g.strokeColor = stroke;
        g.roundRect(-w / 2, -h / 2, w, h, radius);
        g.stroke();
    }
}

/** 整块面板按住不穿透地图：建好后调用一次 */
export function makePanelNode(parent: Node, name: string, w: number, h: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    parent.addChild(node);
    return node;
}

/** 50000 → "50,000"；负数保留符号 */
export function formatNumber(n: number): string {
    const v = Math.round(n);
    const sign = v < 0 ? '-' : '';
    return sign + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 0..100 → 一句话评价，顶栏心情后面用 */
export function moodLabel(mood: number): string {
    if (mood >= 80) return '很好';
    if (mood >= 65) return '不错';
    if (mood >= 45) return '一般';
    if (mood >= 30) return '低落';
    return '很差';
}
