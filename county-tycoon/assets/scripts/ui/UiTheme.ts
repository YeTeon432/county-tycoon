import {
    _decorator, Color, Component, EventTouch, Graphics, ImageAsset, Label, Layers, Node, resources, Sprite, SpriteFrame, UITransform,
} from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';

/**
 * 经营界面的统一外观（支线 B）。
 *
 * 地图上的工具台用麦色和陶砖橙，详情面板用暖白纸面。
 */

const hex = (s: string, a = 255): Color => {
    const v = parseInt(s.replace('#', ''), 16);
    return new Color((v >> 16) & 255, (v >> 8) & 255, v & 255, a);
};

export const UI_PALETTE = {
    /** 草绿：确定、正向数值 */
    green: hex('#397451'),
    /** 青蓝：信息、选中 */
    blue: hex('#286b81'),
    /** 暖黄：资金、强调（填充用；白底上写字用 UI_COLOR.gold，更深一点才看得清） */
    yellow: hex('#f4cb68'),
    /** 珊瑚红：警告、负数、拆除 */
    coral: hex('#b74331'),
    /** 正文 */
    ink: hex('#3e2d22'),
    /** 次要文字 */
    sub: hex('#6b5140'),
    white: hex('#ffffff'),
};

export const UI_HUD = {
    rim: hex('#9a6b46'),
    base: hex('#f0d4a7'),
    recess: hex('#fff2d9'),
    key: hex('#fce7c4'),
    accent: hex('#a34e29'),
    accentRim: hex('#78371e'),
    onAccent: hex('#fff8ec'),
    text: UI_PALETTE.ink,
    dim: UI_PALETTE.sub,
    goldRim: hex('#bb8a39'),
    paper: hex('#f2e3c7'),
    well: hex('#fff8e9'),
};

export const UI_COLOR = {
    /** 面板 / 卡片底色 */
    panel: hex('#fffaee'),
    /** 卡片里的次级块（数值格、输入区） */
    block: hex('#f4eddd'),
    /** 按钮常态（浅灰底，配深灰字） */
    button: hex('#ede4d2'),
    /** 按钮选中（天蓝底，配白字） */
    buttonActive: UI_PALETTE.blue,
    /** 卡片描边 */
    border: hex('#d6c8ab'),
    /** 分隔线 */
    borderDim: hex('#e7dcc5'),
    /** 正文 */
    text: UI_PALETTE.ink,
    /** 次要文字：单位、说明 */
    textDim: UI_PALETTE.sub,
    /** 浅底上的金额 / 强调字 */
    gold: hex('#8b5a17'),
    /** 上涨 / 正数 */
    up: UI_PALETTE.green,
    /** 下跌 / 负数 / 警告 */
    down: UI_PALETTE.coral,
    /** 可点的名字、链接 */
    link: UI_PALETTE.blue,
    /** 白字（彩色按钮上） */
    onColor: UI_PALETTE.white,
    /** 选中卡片的浅蓝底 */
    selectedFill: hex('#eaf3fc'),
    /** 头像底色：男浅蓝、女浅珊瑚 */
    avatarM: hex('#e3effb'),
    avatarF: hex('#fdece8'),
    /** 投影颜色（叠几层，见 drawCard） */
    shadow: new Color(0, 0, 0, 14),
    /** 抽屉、开场卡片后面的遮罩（浅，不压暗地图太多） */
    shade: new Color(20, 28, 40, 90),
};

export const UI_FONT = {
    /** 面板标题 */
    title: 32,
    /** 顶栏里的主要数字 */
    number: 26,
    /** 正文 */
    body: 26,
    /** 小字、单位、辅助 */
    small: 22,
};

/** 卡片圆角（DESIGN 8.2：16） */
export const UI_RADIUS = 16;
/** 抽屉顶部的圆角，比卡片大一点，像一张从下面推上来的纸 */
export const UI_SHEET_RADIUS = 28;

/** 控制台和工具键的边缘与台面。保留 Graphics，供成组的按键共用。 */
export function drawHudTile(
    g: Graphics, x: number, y: number, w: number, h: number, radius: number, fill: Color, edge: Color,
): void {
    g.fillColor = edge;
    g.roundRect(x, y - 4, w, h + 4, radius);
    g.fill();
    g.fillColor = fill;
    g.roundRect(x + 2, y + 2, w - 4, h - 4, radius - 2);
    g.fill();
}

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
    label.lineHeight = Math.round(fontSize * 1.3);
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    if (width !== undefined) {
        trans.setContentSize(width, label.lineHeight);
        label.overflow = Label.Overflow.SHRINK;
    }
    return label;
}

/** makeLabel 的左对齐版：节点锚点在左边缘中点，setPosition 给的就是文字左端 */
export function makeLabelLeft(
    parent: Node, name: string, text: string, fontSize: number, color: Color = UI_COLOR.text, width = 200,
): Label {
    const l = makeLabel(parent, name, text, fontSize, color, width);
    l.horizontalAlign = Label.HorizontalAlign.LEFT;
    l.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    return l;
}

/** makeLabel 的右对齐版：锚点在右边缘中点 */
export function makeLabelRight(
    parent: Node, name: string, text: string, fontSize: number, color: Color = UI_COLOR.text, width = 200,
): Label {
    const l = makeLabel(parent, name, text, fontSize, color, width);
    l.horizontalAlign = Label.HorizontalAlign.RIGHT;
    l.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
    return l;
}

/**
 * 柔和投影：Graphics 没有模糊，用几层逐渐变大的半透明圆角矩形叠出来，往下偏 4。
 * 对应 DESIGN 8.2 的 `0 4 12 rgba(0,0,0,0.15)`（4 层 × alpha 14 ≈ 0.15 的中心浓度）。
 * 不 clear，调用方先 clear 再画投影、再画卡片。
 */
export function drawShadow(g: Graphics, x: number, y: number, w: number, h: number, radius: number, layers = 4): void {
    for (let i = layers; i >= 1; i--) {
        const e = i * 3;
        g.fillColor = UI_COLOR.shadow;
        g.roundRect(x - e, y - 4 - e, w + 2 * e, h + 2 * e, radius + e);
        g.fill();
    }
}

@_decorator.ccclass('RedrawOnEnable')
class RedrawOnEnable extends Component {
    redraw: (() => void) | null = null;

    protected onEnable(): void {
        this.redraw?.();
    }
}

/** 静态图形在自己或父节点重新显示时重画，避免原生渲染丢失隐藏前的绘制。 */
export function drawGraphicsOnEnable(node: Node, draw: (g: Graphics) => void): Graphics {
    const g = node.addComponent(Graphics);
    const lifecycle = node.addComponent(RedrawOnEnable);
    lifecycle.redraw = () => {
        g.clear();
        draw(g);
    };
    if (node.activeInHierarchy) lifecycle.redraw();
    return g;
}

/** 白色圆角卡片 + 投影（居中，宽 w 高 h）。会先 clear */
export function drawCard(
    g: Graphics, w: number, h: number,
    fill: Color = UI_COLOR.panel, radius: number = UI_RADIUS, shadow = true, stroke: Color | null = null,
): void {
    g.clear();
    if (shadow) drawShadow(g, -w / 2, -h / 2, w, h, radius);
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

/**
 * 在节点自己的 Graphics 上画一个圆角面板（不新建子节点）。
 * 旧签名保留：fill 默认白、stroke 默认浅灰描边；明亮风下多数地方用 drawCard 带投影更好看。
 */
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

/** 空节点（带 UITransform）挂到 parent 下 */
export function makePanelNode(parent: Node, name: string, w: number, h: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    parent.addChild(node);
    return node;
}

/** 一条水平分隔线（宽 w，居中在 y） */
export function makeDivider(parent: Node, w: number, y: number, color: Color = UI_COLOR.borderDim): Node {
    const node = makePanelNode(parent, 'Divider', w, 2);
    node.setPosition(0, y, 0);
    const g = node.addComponent(Graphics);
    g.fillColor = color;
    g.rect(-w / 2, -1, w, 2);
    g.fill();
    return node;
}

/** 50000 → "50,000"；负数保留符号 */
export function formatNumber(n: number): string {
    const v = Math.round(n);
    const sign = v < 0 ? '-' : '';
    return sign + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 金额：正数 ¥1,234，负数 -¥1,234 */
export function formatMoney(n: number): string {
    const v = Math.round(n);
    return (v < 0 ? '-' : '') + '¥' + formatNumber(Math.abs(v));
}

/** 0..100 → 一句话评价，顶栏心情后面用 */
export function moodLabel(mood: number): string {
    if (mood >= 80) return '很好';
    if (mood >= 65) return '不错';
    if (mood >= 45) return '一般';
    if (mood >= 30) return '低落';
    return '很差';
}

/** 按心情取颜色：好绿、中黄（压深）、差红 */
export function moodColor(mood: number): Color {
    if (mood >= 60) return UI_COLOR.up;
    if (mood >= 40) return UI_COLOR.gold;
    return UI_COLOR.down;
}

// ───────────────────────── 图标（docs/ui/gen_icons.py 生成） ─────────────────────────

/**
 * 图标名 = assets/resources/ui/icons/<name>.png。
 * 彩色：calendar coin people smile bill home shop
 * 单色白（用 color 参数染色）：pause play fast close cross check rotate lock demolish arrow-down plus minus
 */
export type IconName =
    | 'calendar' | 'coin' | 'people' | 'smile' | 'bill' | 'home' | 'shop' | 'center'
    | 'pause' | 'play' | 'fast' | 'close' | 'cross' | 'check' | 'rotate' | 'lock' | 'demolish'
    | 'arrow-down' | 'plus' | 'minus';

const _iconCache = new Map<string, SpriteFrame | null>();
const _iconWaiting = new Map<string, ((f: SpriteFrame | null) => void)[]>();

/**
 * 读一个图标（缓存，同名只读一次）。
 * 按 ImageAsset 读、自己建纹理和 SpriteFrame：不依赖导入面板把图片设成 sprite-frame 类型，
 * 新加的 png 不用手改 .meta 就能用（和 ArtLibrary 同一个做法）。
 */
export function loadIcon(name: IconName, cb: (frame: SpriteFrame | null) => void): void {
    if (_iconCache.has(name)) {
        cb(_iconCache.get(name)!);
        return;
    }
    const waiting = _iconWaiting.get(name);
    if (waiting) {
        waiting.push(cb);
        return;
    }
    _iconWaiting.set(name, [cb]);
    resources.load(`ui/icons/${name}`, ImageAsset, (err, image) => {
        let frame: SpriteFrame | null = null;
        if (err || !image) {
            console.warn(`[UiTheme] 图标 ui/icons/${name} 没读到`, err);
        } else {
            // 倍率 > 1 → 线性过滤（图标是 96px 缩小显示，要平滑）
            frame = ArtLibrary.makePixelFrame(ArtLibrary.makeTexture(image, 2));
        }
        _iconCache.set(name, frame);
        const list = _iconWaiting.get(name) ?? [];
        _iconWaiting.delete(name);
        for (const f of list) f(frame);
    });
}

/**
 * 造一个图标节点（size×size，居中）。图片异步到，先占位不显示。
 * @param color 单色图标的颜色（白图 × color）；彩色图标保持白色 = 原色
 */
export function makeIcon(parent: Node, name: IconName, size: number, color: Color = UI_PALETTE.white): Sprite {
    const node = new Node(`Icon_${name}`);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(size, size);
    parent.addChild(node);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.color = color;
    setIcon(sprite, name);
    return sprite;
}

/** 换图标（播放 ↔ 暂停之类）。尺寸不变 */
export function setIcon(sprite: Sprite, name: IconName): void {
    (sprite as unknown as { __icon?: string }).__icon = name;
    loadIcon(name, (frame) => {
        if (!sprite.isValid) return;
        // 异步回来时可能已经又换了别的图标
        if ((sprite as unknown as { __icon?: string }).__icon !== name) return;
        const trans = sprite.node.getComponent(UITransform)!;
        const w = trans.width, h = trans.height;
        sprite.spriteFrame = frame;
        trans.setContentSize(w, h);
    });
}

// ───────────────────────── 按钮 ─────────────────────────

export type ButtonStyle = 'primary' | 'secondary' | 'danger' | 'white';

function buttonColors(style: ButtonStyle): { fill: Color; text: Color } {
    switch (style) {
        case 'primary': return { fill: UI_PALETTE.green, text: UI_PALETTE.white };
        case 'danger': return { fill: UI_PALETTE.coral, text: UI_PALETTE.white };
        case 'white': return { fill: UI_PALETTE.white, text: UI_PALETTE.ink };
        case 'secondary':
        default: return { fill: UI_COLOR.button, text: UI_PALETTE.ink };
    }
}

/**
 * 胶囊按钮（确定 / 取消 / 换朝向……）：圆角 = 高度一半，可带图标（在文字左边）。
 * 返回节点和重画函数；按下时缩一下给手感。
 */
export function makeButton(
    parent: Node,
    name: string,
    text: string,
    w: number,
    h: number,
    style: ButtonStyle,
    onTap: () => void,
    icon?: IconName,
): { node: Node; label: Label; icon: Sprite | null; setStyle: (s: ButtonStyle) => void; setEnabled: (on: boolean) => void } {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    parent.addChild(node);
    const g = node.addComponent(Graphics);

    const iconSize = Math.round(h * 0.5);
    const label = makeLabel(node, 'Txt', text, h >= 60 ? UI_FONT.body : UI_FONT.small, UI_COLOR.text, w - 16 - (icon ? iconSize + 6 : 0));
    let sprite: Sprite | null = null;
    if (icon) {
        sprite = makeIcon(node, icon, iconSize);
        // 图标 + 文字整体居中：估一下文字宽（中文字宽 ≈ 字号）
        const textW = Math.min(w - 24 - iconSize, text.length * label.fontSize);
        const total = iconSize + 6 + textW;
        sprite.node.setPosition(-total / 2 + iconSize / 2, 0, 0);
        label.node.setPosition(-total / 2 + iconSize + 6 + textW / 2, 0, 0);
    }

    let style0 = style;
    let enabled = true;
    const draw = () => {
        const c = buttonColors(style0);
        g.clear();
        if (style0 !== 'secondary') drawShadow(g, -w / 2, -h / 2, w, h, h / 2, 2);
        g.fillColor = enabled ? c.fill : UI_COLOR.button;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();
        label.color = enabled ? c.text : UI_COLOR.textDim;
        if (sprite) sprite.color = enabled ? c.text : UI_COLOR.textDim;
    };
    draw();

    node.on(Node.EventType.TOUCH_START, () => node.setScale(0.95, 0.95, 1));
    node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        node.setScale(1, 1, 1);
        const start = event.getUIStartLocation();
        const end = event.getUILocation();
        if (enabled && Math.hypot(end.x - start.x, end.y - start.y) <= 12) onTap();
    });
    return {
        node, label, icon: sprite,
        setStyle: (s) => { style0 = s; draw(); },
        setEnabled: (on) => { enabled = on; draw(); },
    };
}

/**
 * 圆形图标按钮（顶栏的速度 / 账单、抽屉的关闭、拆除开关）。
 * active = 选中态（天蓝底白图标）；常态白底 + iconColor 图标 + 投影。
 */
export function makeRoundButton(
    parent: Node,
    name: string,
    icon: IconName,
    size: number,
    onTap: () => void,
    iconColor: Color = UI_PALETTE.ink,
    activeColor: Color = UI_PALETTE.blue,
    shadow = true,
): { node: Node; g: Graphics; icon: Sprite; setActive: (on: boolean) => void; setIcon: (n: IconName) => void; redraw: () => void } {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(size, size);
    parent.addChild(node);
    const g = node.addComponent(Graphics);
    const sprite = makeIcon(node, icon, Math.round(size * 0.5), iconColor);

    let active = false;
    const draw = () => {
        g.clear();
        const r = size / 2;
        if (shadow) {
            for (let i = 3; i >= 1; i--) {
                g.fillColor = UI_COLOR.shadow;
                g.circle(0, -3, r + i * 2.5);
                g.fill();
            }
        }
        g.fillColor = active ? activeColor : (shadow ? UI_PALETTE.white : UI_COLOR.button);
        g.circle(0, 0, r);
        g.fill();
        sprite.color = active ? UI_PALETTE.white : iconColor;
    };
    draw();

    node.on(Node.EventType.TOUCH_START, () => node.setScale(0.92, 0.92, 1));
    node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1, 1));
    node.on(Node.EventType.TOUCH_END, () => {
        node.setScale(1, 1, 1);
        onTap();
    });
    return {
        node, g, icon: sprite,
        setActive: (on) => { active = on; draw(); },
        setIcon: (n) => setIcon(sprite, n),
        redraw: draw,
    };
}

/** 一个小标签（建筑类别、「已满」之类）：浅色底 + 同色系深字，圆角胶囊。返回节点，宽度按字数估 */
export function makeTag(parent: Node, text: string, color: Color = UI_PALETTE.blue, fontSize = UI_FONT.small - 2): Node {
    const h = fontSize + 14;
    const w = Math.max(h, text.length * fontSize + 22);
    const node = makePanelNode(parent, 'Tag', w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = new Color(color.r, color.g, color.b, 34);
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    makeLabel(node, 'Txt', text, fontSize, color, w - 8);
    return node;
}

/**
 * 小按钮（筛选、排序用的那种药丸按钮）。签名不变：
 * 常态浅灰底深灰字，选中天蓝底白字。
 */
export function makePill(
    parent: Node,
    name: string,
    text: string,
    w: number,
    h: number,
    onTap: () => void,
    owner?: object,
): { node: Node; g: Graphics; label: Label; setActive: (on: boolean) => void } {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(w, h);
    parent.addChild(node);

    const g = node.addComponent(Graphics);
    const label = makeLabel(node, 'Txt', text, UI_FONT.small, UI_COLOR.text, w - 8);

    const draw = (on: boolean) => {
        g.clear();
        g.fillColor = on ? UI_COLOR.buttonActive : UI_COLOR.button;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();
        label.color = on ? UI_PALETTE.white : UI_COLOR.text;
    };
    draw(false);

    node.on(Node.EventType.TOUCH_END, onTap, owner);
    return { node, g, label, setActive: draw };
}

/**
 * 数值格：浅灰圆角块，上面一行小字说明，下面一行大号数值（建筑详情、居民总览顶部用）。
 * 居中在 (0,0)，调用方 setPosition。返回值 Label 方便以后刷新。
 */
export function makeStatTile(parent: Node, w: number, h: number, caption: string, value: string, color: Color = UI_COLOR.text): { node: Node; value: Label } {
    const node = makePanelNode(parent, 'Stat', w, h);
    const g = node.addComponent(Graphics);
    g.fillColor = UI_COLOR.block;
    g.roundRect(-w / 2, -h / 2, w, h, UI_RADIUS);
    g.fill();
    const cap = makeLabel(node, 'Caption', caption, UI_FONT.small, UI_COLOR.textDim, w - 16);
    cap.node.setPosition(0, h * 0.2, 0);
    const val = makeLabel(node, 'Value', value, UI_FONT.title, color, w - 16);
    val.isBold = true;
    val.node.setPosition(0, -h * 0.17, 0);
    return { node, value: val };
}

/** 小节标题：左边一根主色竖条 + 粗体字，返回节点（居中在 x=0，宽 w） */
export function makeSectionTitle(parent: Node, w: number, y: number, text: string, accent: Color = UI_PALETTE.blue): Label {
    const bar = makePanelNode(parent, 'Accent', 6, 26);
    bar.setPosition(-w / 2 + 3, y, 0);
    const g = bar.addComponent(Graphics);
    g.fillColor = accent;
    g.roundRect(-3, -13, 6, 26, 3);
    g.fill();
    const l = makeLabelLeft(parent, 'Section', text, UI_FONT.body, UI_COLOR.text, w - 20);
    l.isBold = true;
    l.node.setPosition(-w / 2 + 16, y, 0);
    return l;
}
