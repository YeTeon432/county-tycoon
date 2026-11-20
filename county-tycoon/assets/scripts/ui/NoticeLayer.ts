import { _decorator, Color, Component, EventTouch, Graphics, Label, Layers, Node, tween, Tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { SimApi } from '../core/sim/SimApi';
import { Notice, Resident } from '../core/sim/types';
import { Portrait } from './Portrait';
import { TopBar } from './TopBar';
import { drawGraphicsOnEnable, drawHudTile, drawShadow, makeLabel, makeLabelLeft, makePanelNode, UI_COLOR, UI_FONT, UI_HUD, UI_PALETTE } from './UiTheme';

const { ccclass } = _decorator;

/**
 * 公告栏 + 大公示（D026，DESIGN 16.4 / 16.5）。
 *
 * - 公告栏：顶栏下面、左上角一条县城消息。新消息滑进来停 4 秒，然后收成一个小喇叭（有没看过的消息时带红点）。
 *   点喇叭 / 长条 = 展开最近 12 条。没有消息时，开局前几天轮播玩法提示。
 * - 大公示：有人来 / 有人走时屏幕中间弹一张卡片（头像 + 名字 + 一句话 + 理由），2.5 秒自动消失，点一下立刻关；
 *   不暂停游戏。同一批多张排队，一次超过 3 张就合并成「今天来了 N 位新居民」。
 *
 * 只读 SimApi 和 MonthlyReport.notices，不改模拟数据。
 */
@ccclass('NoticeLayer')
export class NoticeLayer extends Component {
    private static readonly BAR_H = 44;
    private static readonly SHOW_SECONDS = 4;
    private static readonly CARD_SECONDS = 2.5;

    /** 玩法提示：没有新消息时轮播（新档的前几天） */
    private static readonly TIPS = [
        '县城幸福度越高，外县来的人越多',
        '幸福度低于 30 的居民会想离开，点他看看为什么不开心',
        '店铺要有店员才开门，营业额要够发工资才不亏',
        '点建筑能看到它的账：营业额、工资、成本、利润',
        '快进按钮点一下换一档：×2、×3',
    ];

    private _sim: SimApi | null = null;
    private _bar: Node | null = null;
    private _barText: Label | null = null;
    private _horn: Node | null = null;
    private _hornDot: Node | null = null;
    private _history: { kind: Notice['kind']; text: string }[] = [];
    private _queue: { kind: Notice['kind']; text: string }[] = [];
    private _showing = 0;
    private _unread = false;
    private _tipIndex = 0;
    private _tipTimer = 6;
    private _tipsLeft = NoticeLayer.TIPS.length;
    private _list: Node | null = null;

    private _cards: Notice[] = [];
    private _card: Node | null = null;
    private _cardTimer = 0;

    static create(parent: Node, sim: SimApi): NoticeLayer {
        const node = new Node('NoticeLayer');
        node.layer = Layers.Enum.UI_2D;
        const vis = view.getVisibleSize();
        node.addComponent(UITransform).setContentSize(vis.width, vis.height);
        parent.addChild(node);
        const c = node.addComponent(NoticeLayer);
        c._sim = sim;
        c.build();
        return c;
    }

    private _celebrate: Node | null = null;

    /** 一个月的通知进来：公告栏全收，来人 / 走人上大公示 */
    push(notices: readonly Notice[]): void {
        for (const n of notices) {
            if (n.kind === 'levelUp') continue;   // 升级走全屏庆祝
            // 心愿的建议很长，公告栏只放心愿本身（点楼顶气泡看建议）
            this.say(n.kind, n.reason && n.kind === 'arrive' ? `${n.text}：「${n.reason}」` : n.text);
        }
        const big = notices.filter((n) => n.kind === 'arrive' || n.kind === 'leave');
        const arrive = big.filter((n) => n.kind === 'arrive');
        if (arrive.length > 3) {
            // 一次来太多：合并成一张
            const ids = ([] as number[]).concat(...arrive.map((n) => n.residentIds));
            this._cards.push({ kind: 'arrive', text: `今天来了 ${ids.length} 位新居民`, residentIds: ids.slice(0, 5) });
            this._cards.push(...big.filter((n) => n.kind === 'leave'));
        } else {
            this._cards.push(...big);
        }
    }

    /** 往公告栏发一条（界面自己的提示也走这里，比如「建设资金不够」） */
    say(kind: Notice['kind'], text: string): void {
        this._history.push({ kind, text });
        if (this._history.length > 30) this._history.shift();
        this._queue.push({ kind, text });
        this._tipsLeft = 0;   // 有真消息了就不再轮播提示
    }

    // ───────────────────────── 公告栏 ─────────────────────────

    private build(): void {
        const vis = view.getVisibleSize();
        const W = vis.width;
        const y = vis.height / 2 - TopBar.HEIGHT - 8 - NoticeLayer.BAR_H / 2;

        // 喇叭（收起状态）
        const horn = makePanelNode(this.node, 'Horn', 44, 44);
        horn.setPosition(-W / 2 + 16 + 22, y, 0);
        drawGraphicsOnEnable(horn, (g) => {
            drawHudTile(g, -22, -22, 44, 44, 10, UI_HUD.key, UI_HUD.rim);
            this.drawHorn(g);
        });
        const dot = makePanelNode(horn, 'Dot', 14, 14);
        dot.setPosition(15, 15, 0);
        dot.active = false;
        drawGraphicsOnEnable(dot, (g) => {
            g.fillColor = UI_PALETTE.coral;
            g.circle(0, 0, 7);
            g.fill();
        });
        horn.on(Node.EventType.TOUCH_END, () => this.toggleList(), this);
        InputGuard.add(horn);
        this._horn = horn;
        this._hornDot = dot;

        // 展开的长条
        const bw = W - 32 - 120;
        const bar = makePanelNode(this.node, 'Bar', bw, NoticeLayer.BAR_H);
        bar.setPosition(-W / 2 + 16 + bw / 2, y, 0);
        bar.active = false;
        drawGraphicsOnEnable(bar, (g) => {
            drawHudTile(g, -bw / 2, -NoticeLayer.BAR_H / 2, bw, NoticeLayer.BAR_H, 10, UI_HUD.base, UI_HUD.rim);
        });
        const hornIn = makePanelNode(bar, 'HornIn', 44, 44);
        hornIn.setPosition(-bw / 2 + 22, 0, 0);
        drawGraphicsOnEnable(hornIn, (g) => this.drawHorn(g));
        this._barText = makeLabelLeft(bar, 'Txt', '', UI_FONT.small, UI_HUD.text, bw - 60);
        this._barText.node.setPosition(-bw / 2 + 46, 0, 0);
        bar.addComponent(UIOpacity).opacity = 0;
        bar.on(Node.EventType.TOUCH_END, () => this.toggleList(), this);
        this._bar = bar;
    }

    /** 小喇叭图标（Graphics 画，不用图） */
    private drawHorn(g: Graphics): void {
        g.fillColor = UI_PALETTE.yellow;
        g.moveTo(-10, -5); g.lineTo(-4, -5); g.lineTo(6, -12); g.lineTo(6, 12); g.lineTo(-4, 5); g.lineTo(-10, 5); g.close();
        g.fill();
        g.strokeColor = UI_PALETTE.yellow;
        g.lineWidth = 2.5;
        g.arc(8, 0, 7, -0.9, 0.9, true);
        g.stroke();
    }

    private showBar(kind: Notice['kind'], text: string): void {
        const bar = this._bar, label = this._barText;
        if (!bar || !label) return;
        label.string = text;
        label.color = kind === 'leave' || kind === 'warn' || kind === 'layoff' ? UI_HUD.danger
            : kind === 'arrive' || kind === 'stay' || kind === 'wishDone' || kind === 'research' || kind === 'street' || kind === 'deal' || kind === 'renovate' ? UI_HUD.mint
                : kind === 'wish' ? UI_PALETTE.yellow : UI_HUD.text;
        bar.active = true;
        InputGuard.add(bar);
        const op = bar.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(op);
        tween(op).to(0.2, { opacity: 255 }).start();
        if (this._horn) this._horn.active = false;
        this._showing = NoticeLayer.SHOW_SECONDS;
    }

    private hideBar(): void {
        const bar = this._bar;
        if (!bar || !bar.active) return;
        const op = bar.getComponent(UIOpacity)!;
        Tween.stopAllByTarget(op);
        tween(op).to(0.2, { opacity: 0 }).call(() => {
            bar.active = false;
            InputGuard.remove(bar);
            if (this._horn) {
                this._horn.active = true;
                InputGuard.add(this._horn);
            }
        }).start();
    }

    /** 展开 / 收起最近 12 条 */
    private toggleList(): void {
        if (this._list) { this.closeList(); return; }
        this._unread = false;
        if (this._hornDot) this._hornDot.active = false;
        const vis = view.getVisibleSize();
        const W = vis.width - 32;
        const items = this._history.slice(-12).reverse();
        const rowH = 40;
        const H = Math.max(1, items.length) * rowH + 56;
        const box = makePanelNode(this.node, 'List', W, H);
        const top = vis.height / 2 - TopBar.HEIGHT - 8 - NoticeLayer.BAR_H - 8;
        box.setPosition(0, top - H / 2, 0);
        const g = box.addComponent(Graphics);
        drawShadow(g, -W / 2, -H / 2, W, H, 20, 3);
        g.fillColor = UI_COLOR.panel;
        g.roundRect(-W / 2, -H / 2, W, H, 20);
        g.fill();
        const title = makeLabelLeft(box, 'Title', '县里的消息', UI_FONT.body, UI_COLOR.text, W - 40);
        title.isBold = true;
        title.node.setPosition(-W / 2 + 20, H / 2 - 28, 0);
        if (!items.length) {
            const l = makeLabelLeft(box, 'Empty', '还没有消息', UI_FONT.small, UI_COLOR.textDim, W - 40);
            l.node.setPosition(-W / 2 + 20, H / 2 - 28 - rowH, 0);
        }
        items.forEach((it, i) => {
            const l = makeLabelLeft(box, 'Row', it.text, UI_FONT.small,
                it.kind === 'leave' || it.kind === 'warn' || it.kind === 'layoff' ? UI_COLOR.down
                    : it.kind === 'arrive' || it.kind === 'stay' ? UI_COLOR.up : UI_COLOR.text, W - 40);
            l.node.setPosition(-W / 2 + 20, H / 2 - 28 - rowH * (i + 1), 0);
        });
        box.on(Node.EventType.TOUCH_END, () => this.closeList(), this);
        InputGuard.add(box);
        this._list = box;
    }

    private closeList(): void {
        if (!this._list) return;
        InputGuard.remove(this._list);
        this._list.destroy();
        this._list = null;
    }

    // ───────────────────────── 升级庆祝（全屏，点了才关） ─────────────────────────

    celebrate(title: string, line: string): void {
        if (this._celebrate) this._celebrate.destroy();
        const vis = view.getVisibleSize();
        const root = makePanelNode(this.node, 'Celebrate', vis.width, vis.height);
        const shade = root.addComponent(Graphics);
        shade.fillColor = new Color(20, 30, 50, 150);
        shade.rect(-vis.width / 2, -vis.height / 2, vis.width, vis.height);
        shade.fill();
        // 彩带：几十个小色块从上往下飘
        const colors = [UI_PALETTE.yellow, UI_PALETTE.coral, UI_PALETTE.green, UI_PALETTE.blue, UI_PALETTE.white];
        for (let i = 0; i < 40; i++) {
            const c = makePanelNode(root, 'Bit', 14, 8);
            const cg = c.addComponent(Graphics);
            cg.fillColor = colors[i % colors.length];
            cg.rect(-7, -4, 14, 8);
            cg.fill();
            const x = (Math.random() - 0.5) * vis.width;
            c.setPosition(x, vis.height / 2 + Math.random() * 200, 0);
            c.angle = Math.random() * 360;
            tween(c).delay(Math.random() * 0.6)
                .to(2.2 + Math.random(), { position: new Vec3(x + (Math.random() - 0.5) * 200, -vis.height / 2 - 40, 0), angle: c.angle + 540 })
                .start();
        }
        const W = Math.min(600, vis.width - 60), H = 360;
        const card = makePanelNode(root, 'Card', W, H);
        const g = card.addComponent(Graphics);
        drawShadow(g, -W / 2, -H / 2, W, H, 32, 4);
        g.fillColor = UI_PALETTE.white;
        g.roundRect(-W / 2, -H / 2, W, H, 32);
        g.fill();
        g.fillColor = UI_PALETTE.yellow;
        g.roundRect(-W / 2, H / 2 - 96, W, 96, 32);
        g.fill();
        g.rect(-W / 2, H / 2 - 96, W, 40);
        g.fill();
        const t = makeLabel(card, 'Title', '恭喜！', 40, UI_COLOR.text, W - 40);
        t.isBold = true;
        t.node.setPosition(0, H / 2 - 48, 0);
        const big = makeLabel(card, 'Big', title, 44, UI_PALETTE.coral, W - 40);
        big.isBold = true;
        big.node.setPosition(0, 30, 0);
        const l2 = makeLabel(card, 'Line', line, UI_FONT.body, UI_COLOR.textDim, W - 60);
        l2.overflow = Label.Overflow.RESIZE_HEIGHT;
        l2.node.setPosition(0, -50, 0);
        const tip = makeLabel(card, 'Tip', '点任意处继续', UI_FONT.small, UI_COLOR.textDim, W);
        tip.node.setPosition(0, -H / 2 + 36, 0);
        card.setScale(0.6, 0.6, 1);
        tween(card).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        root.on(Node.EventType.TOUCH_END, () => {
            InputGuard.remove(root);
            root.destroy();
            this._celebrate = null;
        }, this);
        InputGuard.add(root);
        this._celebrate = root;
    }

    // ───────────────────────── 大公示 ─────────────────────────

    private showCard(n: Notice): void {
        const sim = this._sim;
        if (!sim) return;
        const vis = view.getVisibleSize();
        const W = Math.min(560, vis.width - 80), H = 300;
        const arrive = n.kind === 'arrive';
        const card = makePanelNode(this.node, 'Card', W, H);
        card.setPosition(0, 60, 0);
        const g = card.addComponent(Graphics);
        drawShadow(g, -W / 2, -H / 2, W, H, 28, 4);
        g.fillColor = UI_PALETTE.white;
        g.roundRect(-W / 2, -H / 2, W, H, 28);
        g.fill();
        // 顶部色带：来人绿、走人灰
        g.fillColor = arrive ? UI_PALETTE.green : hexGray;
        g.roundRect(-W / 2, H / 2 - 64, W, 64, 28);
        g.fill();
        g.rect(-W / 2, H / 2 - 64, W, 30);
        g.fill();
        const head = makeLabel(card, 'Head', arrive ? '有新居民来了！' : '有人离开了县城', UI_FONT.title, UI_PALETTE.white, W - 40);
        head.isBold = true;
        head.node.setPosition(0, H / 2 - 32, 0);

        // 头像一排（最多 5 个）
        const people = n.residentIds.map((id) => sim.resident(id)).filter((r): r is Resident => !!r).slice(0, 5);
        const face = 84, gap = 16;
        const total = people.length * face + Math.max(0, people.length - 1) * gap;
        people.forEach((r, i) => {
            const x = -total / 2 + face / 2 + i * (face + gap);
            const bg = r.gender === 'M' ? UI_COLOR.avatarM : UI_COLOR.avatarF;
            if (!Portrait.place(card, r, x, 30, face, bg)) {
                const pg = makePanelNode(card, 'Face', face, face);
                pg.setPosition(x, 30, 0);
                const fg = pg.addComponent(Graphics);
                fg.fillColor = bg;
                fg.circle(0, 0, face / 2);
                fg.fill();
                makeLabel(pg, 'Ch', r.name.charAt(0), UI_FONT.title, UI_PALETTE.white, face);
            }
        });
        const who = people.length === 1 ? `${people[0].name} · ${people[0].age} 岁${people[0].jobTitle ? ' · ' + people[0].jobTitle : ''}` : n.text;
        const line1 = makeLabel(card, 'Who', who, UI_FONT.body, UI_COLOR.text, W - 40);
        line1.isBold = true;
        line1.node.setPosition(0, -46, 0);
        const sub = arrive ? (n.reason ? `「${n.reason}」` : '搬到咱们县城了') : (n.reason ? `因为：${n.reason}` : '搬离了县城');
        const line2 = makeLabel(card, 'Why', sub, UI_FONT.small, arrive ? UI_COLOR.textDim : UI_COLOR.down, W - 40);
        line2.node.setPosition(0, -90, 0);
        if (!arrive) {
            const tip = makeLabel(card, 'Tip', '下次看到红色「想走」消息时，及时补上他缺的东西', 18, UI_COLOR.textDim, W - 40);
            tip.node.setPosition(0, -124, 0);
        }

        const op = card.addComponent(UIOpacity);
        op.opacity = 0;
        card.setScale(0.85, 0.85, 1);
        tween(op).to(0.18, { opacity: 255 }).start();
        tween(card).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        card.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.closeCard(); }, this);
        InputGuard.add(card);
        this._card = card;
        this._cardTimer = NoticeLayer.CARD_SECONDS;
    }

    private closeCard(): void {
        const card = this._card;
        if (!card) return;
        this._card = null;
        InputGuard.remove(card);
        const op = card.getComponent(UIOpacity)!;
        tween(op).to(0.15, { opacity: 0 }).call(() => card.destroy()).start();
    }

    // ───────────────────────── 每帧 ─────────────────────────

    protected update(dt: number): void {
        // 公告栏：队列里有就播，没有就倒计时收起
        if (this._showing > 0) {
            this._showing -= dt;
            if (this._showing <= 0) {
                if (this._queue.length) { const n = this._queue.shift()!; this.showBar(n.kind, n.text); }
                else { this.hideBar(); if (this._history.length) { this._unread = true; if (this._hornDot) this._hornDot.active = !this._list; } }
            }
        } else if (this._queue.length) {
            const n = this._queue.shift()!;
            this.showBar(n.kind, n.text);
        } else if (this._tipsLeft > 0) {
            this._tipTimer -= dt;
            if (this._tipTimer <= 0) {
                this._tipTimer = 10;
                this._tipsLeft--;
                const tip = NoticeLayer.TIPS[this._tipIndex++ % NoticeLayer.TIPS.length];
                this.showBar('info', `小提示：${tip}`);   // 提示不进历史
            }
        }

        // 大公示
        if (this._card) {
            this._cardTimer -= dt;
            if (this._cardTimer <= 0) this.closeCard();
        } else if (this._cards.length) {
            this.showCard(this._cards.shift()!);
        }
    }

    protected onDestroy(): void {
        if (this._horn) InputGuard.remove(this._horn);
        if (this._bar) InputGuard.remove(this._bar);
        if (this._card) InputGuard.remove(this._card);
        if (this._list) InputGuard.remove(this._list);
    }
}

const hexGray = new Color(140, 146, 156, 255);
