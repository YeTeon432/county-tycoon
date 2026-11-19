import {
    _decorator, Color, Component, EventTouch, Graphics, JsonAsset, Label, Layers, Node, resources, Sprite, SpriteFrame,
    tween, Tween, UIOpacity, UITransform, Vec3, view,
} from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { BuildingDef } from '../core/BuildingConfig';
import { hexToColor } from '../core/ColorUtil';
import { InputGuard } from '../core/InputGuard';
import { SimApi } from '../core/sim/SimApi';
import { TownLevel } from '../core/sim/types';
import {
    drawShadow, formatNumber, makeIcon, makeLabel, makePanelNode, makeRoundButton,
    UI_COLOR, UI_FONT, UI_PALETTE, UI_RADIUS, UI_SHEET_RADIUS,
} from './UiTheme';

const { ccclass } = _decorator;

/** 底栏页签。cats = buildings.json 里归到这一页的 category；没列到的类别进最后一页 */
export const BAR_TABS: { key: string; label: string; cats: string[] }[] = [
    { key: '住宅', label: '住宅', cats: ['住宅'] },
    { key: '店铺', label: '店铺', cats: ['店铺'] },
    { key: '工业', label: '工业', cats: ['工业'] },
    { key: '公共', label: '公共', cats: ['公共', '金融'] },
    { key: '设施', label: '道路·设施', cats: ['设施'] },
];

const LEVEL_ORDER: TownLevel[] = ['village', 'town', 'county', 'city', 'top100'];
const LEVEL_NAME: Record<TownLevel, string> = {
    village: '村口', town: '镇上', county: '县城', city: '县级市', top100: '百强县',
};

/** economy.json 里建造栏要用的两项 */
interface Econ { cost: number; unlock: TownLevel; selfBuilt?: boolean; housing: number }

interface Card {
    def: BuildingDef;
    tab: string;
    node: Node;
    /** 选中（卡片底在共用的 _bgG 里画，见 drawAllBgs） */
    selected: boolean;
    /** 缩略图（拿到 ArtLibrary 之后才有图） */
    thumb: Sprite;
    /** 没有贴图时的色块 */
    swatch: Graphics;
    name: Label;
    price: Label;
    coin: Sprite;
    lock: Sprite;
    /** 住宅能住几人（图区右下角，非住宅不显示） */
    cap: Label;
    /** 分层合批（T212）：这张卡在 底 / 图 / 图标 / 文字 四层里的影子节点，每帧跟 node 同步位置和显隐 */
    holders: Node[];
    /** 上次画的状态，变了才重画 */
    state: string;
}

/**
 * 底部建造栏（T406，DESIGN 8.2）。
 *
 *   ┌──────────────── 白色底板（顶部大圆角 + 投影）────────────────┐
 *   │  [住宅] [店铺] [工业] [公共] [道路·设施]   ← 类别页签          │
 *   │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ …            ← 横向滚动的建筑卡片 │
 *   │  │缩略│ │    │ │    │ │    │                                   │
 *   │  │名字│ │    │ │    │ │    │                                   │
 *   │  │¥价 │ │    │ │    │ │    │                                   │
 *   └──────────────────────────────────────────────────────────────┘
 *   左上角浮着一个圆形「拆除」开关。
 *
 * 卡片状态：常态白 / 选中（蓝框浅蓝底、上浮、右上对勾）/ 买不起（缩略图变灰、价格变红）/
 *           未解锁（缩略图变灰、中间一把锁、价格换成「镇上解锁」，点了不选中）。
 *
 * 需要的外部数据（都可以晚到，没到之前用占位）：
 *   - bindSim(sim)：canAfford、城镇等级。UiRoot 会自动找到建造栏并绑上
 *   - setArt(art)：缩略图用 ArtLibrary 里那栋楼的贴图。没有就画色块
 *   - 价格：自己读 economy.json 的 cost（数值不写死在代码里）
 *
 * 整块底板 + 拆除按钮登记 InputGuard（D005）。
 */
@ccclass('BuildingBar')
export class BuildingBar extends Component {
    /** 底栏总高：上 16 + 页签 52 + 14 + 卡片 172 + 下 20 */
    static readonly BAR_HEIGHT = 274;
    static readonly TAB_H = 52;
    static readonly ITEM_W = 132;
    static readonly ITEM_H = 172;
    static readonly ITEM_GAP = 14;
    static readonly PADDING = 20;
    /** 拆除按钮直径（浮在底板左上方） */
    static readonly DEMOLISH_SIZE = 72;

    onSelect: ((def: BuildingDef | null) => void) | null = null;
    onDemolishToggle: ((on: boolean) => void) | null = null;
    /** 点了未解锁 / 买不起的卡片：给一句提示（UiRoot 接到顶栏提示条） */
    onNotice: ((text: string) => void) | null = null;

    private _defs: BuildingDef[] = [];
    private _cards: Card[] = [];
    private _tab = BAR_TABS[1].key;
    private _tabs: { key: string; node: Node; g: Graphics; label: Label; w: number }[] = [];
    private _cardLayer: Node | null = null;
    /**
     * 分层合批（T212）：所有卡片的底色画在一层、缩略图一层、图标一层、文字一层。
     * 以前每张卡「底 → 图 → 字 → 图标 → 字」交替，换一种就断一次合批，10 张卡约 50 次绘制；
     * 分层后同一层挨着画，能合的都合上。卡片节点本身只管位置、显隐和点击。
     */
    private _layers: Node[] = [];
    private _bgG: Graphics | null = null;
    /** 上次画卡片底时的「位置 + 选中」签名，变了才重画 */
    private _bgSig = '';

    private _scrollX = 0;
    private _dragging = false;
    private _dragDist = 0;

    private _demolishMode = false;
    private _demolishBtn: ReturnType<typeof makeRoundButton> | null = null;
    private _selectedId: string | null = null;

    private _sim: SimApi | null = null;
    private _art: ArtLibrary | null = null;
    private _artApplied = false;
    private _econ = new Map<string, Econ>();
    private _pollT = 0;

    private _hintArrow: Node | null = null;

    build(defs: BuildingDef[]): void {
        this._defs = defs;
        const visible = view.getVisibleSize();
        const W = visible.width;
        const H = BuildingBar.BAR_HEIGHT;

        this.node.layer = Layers.Enum.UI_2D;
        const trans = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
        trans.setContentSize(W, H);
        this.node.setPosition(0, -visible.height / 2 + H / 2, 0);

        this.buildSheet(W, H);
        this.buildTabs(W, H);
        this._cardLayer = makePanelNode(this.node, 'Cards', W, BuildingBar.ITEM_H);
        this._cardLayer.setPosition(0, -H / 2 + 20 + BuildingBar.ITEM_H / 2, 0);
        // 金币和小锁是两张图：分两层，不然一张卡里交替出现就断批
        this._layers = ['BgLayer', 'ThumbLayer', 'CoinLayer', 'LockLayer', 'TextLayer'].map((n) => makePanelNode(this._cardLayer!, n, W, BuildingBar.ITEM_H));
        // 所有卡片的白底画在同一个 Graphics 里（一个 Graphics 一次绘制，十个就是十次）
        this._bgG = makePanelNode(this._layers[0], 'AllBgs', W, BuildingBar.ITEM_H).addComponent(Graphics);
        for (const def of defs) this._cards.push(this.buildCard(def));
        this.buildDemolishButton(W, H);
        this.registerBarScroll();
        this.applyTab();
        this.loadEconomy();

        InputGuard.add(this.node);
    }

    // ───────────────────────── 外部数据 ─────────────────────────

    /** 接模拟层：买得起吗、城镇等级。可以晚于 build 调 */
    bindSim(sim: SimApi): void {
        this._sim = sim;
        this.applyTab();
    }

    /** 接贴图仓库（WorldView 的那一份，别新建，省一份纹理内存）。贴图没加载完也可以先给 */
    setArt(art: ArtLibrary): void {
        this._art = art;
        this._artApplied = false;
        this.tryApplyArt();
    }

    get hasSim(): boolean {
        return !!this._sim;
    }

    get hasArt(): boolean {
        return !!this._art;
    }

    get demolishMode(): boolean {
        return this._demolishMode;
    }

    /** 价格：economy.json 的 cost（支线 A 维护）。读不到就不显示价格 */
    private loadEconomy(): void {
        resources.load('config/economy', JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) return;
            const list = (asset.json as { buildings?: { id: string; cost?: number; unlock?: TownLevel; selfBuilt?: boolean; housing?: number }[] }).buildings;
            if (!Array.isArray(list)) return;
            for (const b of list) {
                if (!b || typeof b.id !== 'string') continue;
                this._econ.set(b.id, {
                    cost: typeof b.cost === 'number' ? b.cost : 0,
                    unlock: LEVEL_ORDER.indexOf(b.unlock as TownLevel) >= 0 ? b.unlock as TownLevel : 'village',
                    selfBuilt: b.selfBuilt === true,
                    housing: typeof b.housing === 'number' ? b.housing : 0,
                });
            }
            this.applyTab();
        });
    }

    // ───────────────────────── 底板 + 页签 ─────────────────────────

    private buildSheet(W: number, H: number): void {
        const bg = makePanelNode(this.node, 'BarBg', W, H);
        const g = bg.addComponent(Graphics);
        const R = UI_SHEET_RADIUS;
        // 只要顶部圆角：往下多画 R，伸出屏幕
        drawShadow(g, -W / 2, -H / 2 - R, W, H + R, R, 4);
        g.fillColor = UI_COLOR.panel;
        g.roundRect(-W / 2, -H / 2 - R, W, H + R, R);
        g.fill();
    }

    private buildTabs(W: number, H: number): void {
        const y = H / 2 - 16 - BuildingBar.TAB_H / 2;
        const gap = 10;
        // 「道路·设施」字多，宽一点；其余等宽
        const widths = BAR_TABS.map((t) => (t.label.length > 2 ? 156 : 108));
        const total = widths.reduce((a, b) => a + b, 0) + gap * (BAR_TABS.length - 1);
        let x = -total / 2;
        for (let i = 0; i < BAR_TABS.length; i++) {
            const t = BAR_TABS[i];
            const w = widths[i];
            const node = makePanelNode(this.node, `Tab_${t.key}`, w, BuildingBar.TAB_H);
            node.setPosition(x + w / 2, y, 0);
            const g = node.addComponent(Graphics);
            const label = makeLabel(node, 'Txt', t.label, UI_FONT.small, UI_COLOR.textDim, w - 12);
            label.isBold = true;
            node.on(Node.EventType.TOUCH_END, () => {
                if (this._dragging) return;
                this.selectTab(t.key);
            }, this);
            this._tabs.push({ key: t.key, node, g, label, w });
            x += w + gap;
        }
    }

    /** 切页签（开局提示、外部跳转也能调）。不清当前选中的建筑 */
    selectTab(key: string): void {
        if (!BAR_TABS.some((t) => t.key === key)) return;
        this._tab = key;
        this._scrollX = 0;
        this.applyTab();
    }

    get tab(): string {
        return this._tab;
    }

    private applyTab(): void {
        const h = BuildingBar.TAB_H;
        for (const t of this._tabs) {
            const on = t.key === this._tab;
            t.g.clear();
            t.g.fillColor = on ? UI_PALETTE.blue : UI_COLOR.button;
            t.g.roundRect(-t.w / 2, -h / 2, t.w, h, h / 2);
            t.g.fill();
            t.label.color = on ? UI_PALETTE.white : UI_COLOR.textDim;
        }
        for (const c of this._cards) c.node.active = c.tab === this._tab && !this.isHidden(c.def);
        this.applyScroll();
        this.refreshCards(true);
    }

    private static tabOf(def: BuildingDef): string {
        for (const t of BAR_TABS) if (t.cats.indexOf(def.category) >= 0) return t.key;
        return BAR_TABS[BAR_TABS.length - 1].key;
    }

    // ───────────────────────── 卡片 ─────────────────────────

    private buildCard(def: BuildingDef): Card {
        const w = BuildingBar.ITEM_W;
        const h = BuildingBar.ITEM_H;
        const node = makePanelNode(this._cardLayer!, `Item_${def.id}`, w, h);
        const holders = this._layers.map((l) => makePanelNode(l, `Item_${def.id}`, w, h));
        const [bgH, thumbH, coinH, lockH, textH] = holders;

        // 图区：卡片上部 116×96
        const imgW = w - 16, imgH = 96;
        const imgY = h / 2 - 8 - imgH / 2;
        const swatchNode = makePanelNode(bgH, 'Swatch', imgW, imgH);
        swatchNode.setPosition(0, imgY, 0);
        const swatch = swatchNode.addComponent(Graphics);
        this.drawSwatch(swatch, def, imgW, imgH);

        const thumbNode = makePanelNode(thumbH, 'Thumb', imgW, imgH);
        thumbNode.setPosition(0, imgY, 0);
        const thumb = thumbNode.addComponent(Sprite);
        thumb.sizeMode = Sprite.SizeMode.CUSTOM;
        thumbNode.active = false;

        const lock = makeIcon(lockH, 'lock', 24, UI_COLOR.textDim);
        lock.node.setPosition(-imgW / 2 + 16, imgY + imgH / 2 - 16, 0);   // 图区左上角的小锁，不挡缩略图
        lock.node.active = false;

        // 住宅能住几人：图区右下角（左上是锁、右上是选中对勾），白描边压在缩略图上也看得清
        const cap = makeLabel(textH, 'Cap', '', UI_FONT.small - 4, UI_PALETTE.blue);
        cap.isBold = true;
        cap.enableOutline = true;
        cap.outlineColor = UI_PALETTE.white;
        cap.outlineWidth = 3;
        cap.horizontalAlign = Label.HorizontalAlign.RIGHT;
        cap.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
        cap.node.setPosition(imgW / 2 - 4, imgY - imgH / 2 + 12, 0);
        cap.node.active = false;

        const name = makeLabel(textH, 'Name', def.name, UI_FONT.small, UI_COLOR.text, w - 12);
        name.isBold = true;
        name.cacheMode = Label.CacheMode.BITMAP;   // 进动态合图，卡片文字能连成一批（T212）
        name.node.setPosition(0, -h / 2 + 52, 0);

        const coin = makeIcon(coinH, 'coin', 22);
        const price = makeLabel(textH, 'Price', '', UI_FONT.small - 1, UI_COLOR.text, w - 40);
        price.cacheMode = Label.CacheMode.BITMAP;
        price.node.setPosition(10, -h / 2 + 22, 0);
        coin.node.setPosition(-w / 2 + 18, -h / 2 + 22, 0);

        node.on(Node.EventType.TOUCH_END, () => {
            if (this._dragging) return;
            this.handleItemClick(def);
        }, this);

        return { def, tab: BuildingBar.tabOf(def), node, selected: false, thumb, swatch, name, price, coin, lock, cap, holders, state: '' };
    }

    /** 没有贴图时的占位：一块等距菱形色块（按占格画大小），比方块更像"一块地上的楼" */
    private drawSwatch(g: Graphics, def: BuildingDef, w: number, h: number): void {
        g.clear();
        const c = new Color();
        hexToColor(def.color, c);
        const side = def.flat ? 0.9 : 0.62 + 0.14 * Math.min(2, Math.max(def.width, def.height) - 1);
        const dw = w * side, dh = dw / 2;
        const lift = def.flat ? 0 : 26;
        const cy = -h / 2 + dh / 2 + 10;
        // 侧面（暗）
        if (lift > 0) {
            g.fillColor = new Color(c.r * 0.7, c.g * 0.7, c.b * 0.7, 255);
            g.moveTo(-dw / 2, cy); g.lineTo(0, cy - dh / 2); g.lineTo(dw / 2, cy);
            g.lineTo(dw / 2, cy + lift); g.lineTo(0, cy - dh / 2 + lift); g.lineTo(-dw / 2, cy + lift); g.close();
            g.fill();
        }
        // 顶面
        g.fillColor = c;
        const ty = cy + lift;
        g.moveTo(-dw / 2, ty); g.lineTo(0, ty + dh / 2); g.lineTo(dw / 2, ty); g.lineTo(0, ty - dh / 2); g.close();
        g.fill();
    }

    /** 缩略图：建筑用图集里那张（朝左的默认版），马路用地面图集里一段直路，桥用桥面 */
    private frameFor(def: BuildingDef): SpriteFrame | null {
        const art = this._art;
        if (!art) return null;
        if (def.road) return art.groundByName(`${def.road}-5`) ?? art.get(def.id);
        if (def.id === 'bridge') return art.groundByName('bridge-gx') ?? art.get(def.id);
        return art.get(def.id);
    }

    private tryApplyArt(): void {
        const art = this._art;
        if (!art || this._artApplied || !art.loaded) return;
        this._artApplied = true;
        const imgW = BuildingBar.ITEM_W - 16, imgH = 96;
        for (const c of this._cards) {
            const f = this.frameFor(c.def);
            if (!f) continue;
            // 等比缩进图区（宽高都不超），贴底放：楼"站"在图区底边上
            const s = Math.min(imgW / f.rect.width, imgH / f.rect.height);
            const tw = f.rect.width * s, th = f.rect.height * s;
            c.thumb.spriteFrame = f;
            const t = c.thumb.node.getComponent(UITransform)!;
            t.setContentSize(tw, th);
            const imgY = BuildingBar.ITEM_H / 2 - 8 - imgH / 2;
            c.thumb.node.setPosition(0, imgY - imgH / 2 + th / 2, 0);
            c.thumb.node.active = true;
            c.swatch.node.active = false;
        }
        this.refreshCards(true);
    }

    /** 盖不了的原因（放置预览用）：没解锁 → 「镇上解锁」；钱不够 → 「预算不够」；能盖 → null */
    blockReason(def: BuildingDef): string | null {
        const sim0 = this._sim;
        if (sim0 && sim0.isUnlocked && !sim0.isUnlocked(def.id)) {
            // D026：没研究过
            const r = sim0.researchList ? sim0.researchList().find((x) => x.unlocks.indexOf(def.id) >= 0) : null;
            return r ? `先在县发展中心研究「${r.name}」` : '还不能盖';
        }
        const locked = this.isLocked(def);
        if (locked) return `${LEVEL_NAME[locked.unlock]}解锁`;
        if (this._sim && !this._sim.canAfford(def.id)) {
            const e = this._econ.get(def.id);
            return e ? `预算不够（还差 ¥${formatNumber(Math.max(0, e.cost - this._sim.state.finance.funds))}）` : '预算不够';
        }
        return null;
    }

    /** 既没解锁、也没有研究能解锁它（县发展中心这种开局自带的）：不在底栏出现 */
    private isHidden(def: BuildingDef): boolean {
        if (this._econ.get(def.id)?.selfBuilt) return true;   // 砖瓦房、自建小楼：只能住户自己翻盖（D026）
        const sim = this._sim;
        if (!sim || !sim.isUnlocked || !sim.researchList || sim.isUnlocked(def.id)) return false;
        return !sim.researchList().some((r) => r.unlocks.indexOf(def.id) >= 0);
    }

    /** 研究完了要刷新底栏（UiRoot 在研究完成时调） */
    refreshUnlocks(): void {
        this.applyTab();
    }

    private isLocked(def: BuildingDef): Econ | null {
        const e = this._econ.get(def.id);
        const sim = this._sim;
        if (sim && sim.isUnlocked) return sim.isUnlocked(def.id) ? null : (e ?? { cost: 0, unlock: 'village', housing: 0 });
        if (!e || !sim) return null;
        return LEVEL_ORDER.indexOf(e.unlock) > LEVEL_ORDER.indexOf(sim.state.level) ? e : null;
    }

    /** 按买得起 / 解锁 / 选中重画卡片；只重画状态变了的 */
    private refreshCards(force = false): void {
        for (const c of this._cards) {
            if (!c.node.active) continue;
            const locked = this.isLocked(c.def);
            const afford = this._sim ? this._sim.canAfford(c.def.id) : true;
            const selected = c.def.id === this._selectedId;
            const st = `${locked ? 'L' : ''}${afford ? 'A' : ''}${selected ? 'S' : ''}${this._econ.size}`;
            if (!force && st === c.state) continue;
            c.state = st;
            this.drawCard(c, !!locked, afford, selected);
        }
    }

    private drawCard(c: Card, locked: boolean, afford: boolean, selected: boolean): void {
        const h = BuildingBar.ITEM_H;
        c.selected = selected;
        this._bgSig = '';   // 底色在 lateUpdate 里统一重画
        this.setCheck(c, selected);

        // 用户要求（2026-11-14）：卡片一律正常显示、都标价，不变灰；
        // 钱不够 / 没解锁到地图上点地块时，预览和确认条里再说原因（WorldView.blockReason）
        void afford;
        c.thumb.grayscale = false;
        c.thumb.color = UI_PALETTE.white;
        const so = c.swatch.node.getComponent(UIOpacity) ?? c.swatch.node.addComponent(UIOpacity);
        so.opacity = 255;
        c.lock.node.active = locked;          // 只留一把小锁做标记
        c.name.color = UI_COLOR.text;

        const e = this._econ.get(c.def.id);
        c.price.string = e ? `¥${formatNumber(e.cost)}` : '';
        c.price.color = UI_COLOR.text;
        c.coin.node.active = !!e;
        c.cap.node.active = !!e && e.housing > 0;
        if (e && e.housing > 0) c.cap.string = `住${e.housing}人`;
        c.price.node.setPosition(10, -h / 2 + 22, 0);
        // 选中上浮一点
        c.node.setPosition(c.node.position.x, selected ? 6 : 0, 0);
    }

    private setCheck(c: Card, on: boolean): void {
        const iconH = c.holders[2];   // 对勾和金币一层（都是小图标，放哪层都行）
        let check = iconH.getChildByName('Icon_check');
        if (!check && on) {
            const s = makeIcon(iconH, 'check', 18);
            s.node.setPosition(BuildingBar.ITEM_W / 2 - 14, BuildingBar.ITEM_H / 2 - 14, 0);
            check = s.node;
        }
        if (check) check.active = on;
    }

    // ───────────────────────── 滚动 ─────────────────────────

    private registerBarScroll(): void {
        this.node.on(Node.EventType.TOUCH_START, () => {
            this._dragDist = 0;
            this._dragging = false;
        }, this);
        this.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            const d = e.getUIDelta();
            this._dragDist += Math.abs(d.x);
            if (this._dragDist > 8) this._dragging = true;
            if (this._dragging) this.scrollBy(-d.x);
        }, this);
        const end = () => {
            this._dragging = false;
            this._dragDist = 0;
        };
        this.node.on(Node.EventType.TOUCH_END, end, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, end, this);
    }

    private visibleCards(): Card[] {
        return this._cards.filter((c) => c.tab === this._tab && c.node.active);
    }

    private contentWidth(): number {
        const n = this.visibleCards().length;
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

    private applyScroll(): void {
        const visibleW = view.getVisibleSize().width;
        const max = this.maxScroll();
        if (this._scrollX < 0) this._scrollX = 0;
        if (this._scrollX > max) this._scrollX = max;
        const startX = -visibleW / 2 + BuildingBar.PADDING + BuildingBar.ITEM_W / 2;
        const cards = this.visibleCards();
        for (let i = 0; i < cards.length; i++) {
            const x = startX + i * (BuildingBar.ITEM_W + BuildingBar.ITEM_GAP) - this._scrollX;
            cards[i].node.setPosition(x, cards[i].def.id === this._selectedId ? 6 : 0, 0);
        }
    }

    // ───────────────────────── 点击 ─────────────────────────

    private handleItemClick(def: BuildingDef): void {
        // 没解锁、钱不够也能选中：到地图上点地块，预览会说明为什么盖不了
        // 再点一次已选中的 → 取消选择
        if (this._selectedId === def.id) {
            this._selectedId = null;
            this.refreshCards();
            if (this.onSelect) this.onSelect(null);
            return;
        }
        this._selectedId = def.id;
        if (this._demolishMode) {
            this._demolishMode = false;
            if (this._demolishBtn) this._demolishBtn.setActive(false);
        }
        this.refreshCards();
        if (this.onSelect) this.onSelect(def);
        if (this.onDemolishToggle) this.onDemolishToggle(false);
    }

    /** 底板左上方浮着的圆形拆除开关：常态白底红锤子，开着时红底白锤子 */
    private buildDemolishButton(W: number, H: number): void {
        const S = BuildingBar.DEMOLISH_SIZE;
        const btn = makeRoundButton(this.node, 'DemolishBtn', 'demolish', S, () => {
            if (this._dragging) return;
            this._demolishMode = !this._demolishMode;
            if (this._demolishMode) this._selectedId = null;
            btn.setActive(this._demolishMode);
            this.refreshCards();
            // 只走这一个回调：进入拆除模式时 WorldView 自己会清掉选中的建筑
            if (this.onDemolishToggle) this.onDemolishToggle(this._demolishMode);
        }, UI_PALETTE.coral, UI_PALETTE.coral);
        btn.node.setPosition(-W / 2 + 16 + S / 2, H / 2 + 18 + S / 2, 0);
        this._demolishBtn = btn;
        // 按钮在底板外面，单独登记
        InputGuard.add(btn.node);
    }

    get defs(): readonly BuildingDef[] {
        return this._defs;
    }

    /** 外部选中某种建筑（招商供地选址用）：切到它的页签并选中 */
    selectById(id: string): boolean {
        const c = this._cards.find((x) => x.def.id === id);
        if (!c) return false;
        this._tab = c.tab;
        this.applyTab();
        if (!c.node.active) { c.node.active = true; this.applyScroll(); }
        if (this._selectedId === id) return true;
        this.handleItemClick(c.def);
        return true;
    }

    /** 取消所有选中（放好一栋 / 外部取消时调） */
    clearSelection(): void {
        this._selectedId = null;
        this.refreshCards();
        this.applyScroll();
    }

    /** 退出拆除模式（外部取消时调），不触发回调 */
    clearDemolish(): void {
        this._demolishMode = false;
        if (this._demolishBtn) this._demolishBtn.setActive(false);
    }

    // ───────────────────────── 开局提示箭头（T407） ─────────────────────────

    /** 在某个页签上方显示上下跳动的箭头；null = 收起 */
    showTabHint(key: string | null): void {
        if (this._hintArrow) {
            Tween.stopAllByTarget(this._hintArrow);
            this._hintArrow.destroy();
            this._hintArrow = null;
        }
        if (!key) return;
        const tab = this._tabs.find((t) => t.key === key);
        if (!tab) return;
        const arrow = makePanelNode(this.node, 'TabHint', 52, 60);
        // 白色描边：先画一个大一圈的白箭头，再叠珊瑚色箭头，压在地图上也看得清
        const outline = makeIcon(arrow, 'arrow-down', 58, UI_PALETTE.white);
        outline.node.setPosition(0, 0, 0);
        const ic = makeIcon(arrow, 'arrow-down', 46, UI_PALETTE.coral);
        ic.node.setPosition(0, 1, 0);
        const baseY = tab.node.position.y + BuildingBar.TAB_H / 2 + 40;
        arrow.setPosition(tab.node.position.x, baseY, 0);
        tween(arrow)
            .repeatForever(tween<Node>()
                .to(0.4, { position: new Vec3(tab.node.position.x, baseY + 14, 0) }, { easing: 'sineOut' })
                .to(0.4, { position: new Vec3(tab.node.position.x, baseY, 0) }, { easing: 'sineIn' }))
            .start();
        this._hintArrow = arrow;
    }

    protected update(dt: number): void {
        if (!this._artApplied) this.tryApplyArt();
        // 资金和等级随时在变：每 0.3 秒对一次卡片状态（只重画变了的）
        this._pollT += dt;
        if (this._pollT >= 0.3) {
            this._pollT = 0;
            if (this._sim) this.refreshCards();
        }
    }

    /** 卡片挪了位置 / 换了页签：四层里的影子节点跟上（点击、滚动都在 update 之前处理，这里同帧生效） */
    protected lateUpdate(): void {
        let sig = '';
        for (const c of this._cards) {
            const p = c.node.position, on = c.node.active;
            for (const h of c.holders) {
                if (h.active !== on) h.active = on;
                if (on && (h.position.x !== p.x || h.position.y !== p.y)) h.setPosition(p);
            }
            if (on) sig += `${Math.round(p.x)},${p.y},${c.selected ? 1 : 0};`;
        }
        if (sig !== this._bgSig) { this._bgSig = sig; this.drawAllBgs(); }
    }

    /** 所有可见卡片的白底 + 描边 + 图区浅底 + 选中的投影和对勾徽章，一个 Graphics 画完 */
    private drawAllBgs(): void {
        const g = this._bgG;
        if (!g) return;
        g.clear();
        const w = BuildingBar.ITEM_W, h = BuildingBar.ITEM_H;
        const imgW = w - 16, imgH = 96, imgY = h / 2 - 8 - imgH / 2;
        const vw = view.getVisibleSize().width;
        for (const c of this._cards) {
            if (!c.node.active) continue;
            const x = c.node.position.x, y = c.node.position.y, sel = c.selected;
            if (x < -vw / 2 - w || x > vw / 2 + w) continue;   // 屏幕外的不画
            if (sel) drawShadow(g, x - w / 2, y - h / 2, w, h, UI_RADIUS, 3);
            g.fillColor = sel ? UI_COLOR.selectedFill : UI_PALETTE.white;
            g.roundRect(x - w / 2, y - h / 2, w, h, UI_RADIUS);
            g.fill();
            g.lineWidth = sel ? 4 : 2;
            g.strokeColor = sel ? UI_PALETTE.blue : UI_COLOR.border;
            g.roundRect(x - w / 2, y - h / 2, w, h, UI_RADIUS);
            g.stroke();
            g.fillColor = sel ? new Color(214, 232, 250, 255) : UI_COLOR.block;
            g.roundRect(x - imgW / 2, y + imgY - imgH / 2, imgW, imgH, 12);
            g.fill();
            if (sel) {
                g.fillColor = UI_PALETTE.blue;
                g.circle(x + w / 2 - 14, y + h / 2 - 14, 15);
                g.fill();
            }
        }
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
        if (this._demolishBtn) InputGuard.remove(this._demolishBtn.node);
        if (this._hintArrow) Tween.stopAllByTarget(this._hintArrow);
    }
}
