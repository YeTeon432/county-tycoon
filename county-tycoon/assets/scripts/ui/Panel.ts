import { _decorator, Color, Component, Graphics, Label, Layers, Node, Sprite, UITransform, view } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { InputGuard } from '../core/InputGuard';
import { drawShadow, IconName, makeIcon, makeLabel, makeLabelLeft, makePanelNode, makeRoundButton, makeTag, UI_COLOR, UI_FONT, UI_HUD, UI_PALETTE } from './UiTheme';

const { ccclass } = _decorator;

export type ManagementPage = 'build' | 'center' | 'residents' | 'report' | 'notices' | 'settings';
const PAGES: { key: ManagementPage; name: string; short: string; icon: IconName }[] = [
    { key: 'center', name: '县发展中心', short: '发展', icon: 'center' },
    { key: 'residents', name: '居民总览', short: '居民', icon: 'people' },
    { key: 'report', name: '月度账单', short: '账单', icon: 'bill' },
    { key: 'notices', name: '县城公告', short: '公告', icon: 'calendar' },
    { key: 'build', name: '建造目录', short: '建造', icon: 'shop' },
    { key: 'settings', name: '地图设置', short: '设置', icon: 'home' },
];

/** 所有经营页面使用同一扇窗口。切换宽窄布局时，保留页面实例及其筛选、页签和回调。 */
@ccclass('Panel')
export class Panel extends Component {
    protected card: Node | null = null;
    protected content: Node | null = null;
    protected titleLabel: Label | null = null;
    protected cardW = 720;
    protected cardH = 1100;
    protected wide = false;
    static readonly HEAD_H = 100;
    static readonly PAD_X = 28;
    onClosed: (() => void) | null = null;
    protected renderPage: (() => void) | null = null;
    private titleText = '';
    private subtitle = '';
    private page: ManagementPage | null = null;
    private shade: Node | null = null;
    private sheet: Node | null = null;
    private nav: Node | null = null;
    private static art: ArtLibrary | null = null;

    static setArt(art: ArtLibrary): void { Panel.art = art; }

    static open<T extends Panel>(cls: new () => T, parent: Node, title: string, subtitle = '', page: ManagementPage | null = null): T {
        const node = makePanelNode(parent, cls.name || 'Panel', 1, 1);
        node.layer = Layers.Enum.UI_2D;
        const p = node.addComponent(cls);
        p.titleText = title;
        p.subtitle = subtitle;
        p.page = page;
        p.resize();
        InputGuard.add(node, 'panel');
        view.on('canvas-resize', p.resize, p);
        return p;
    }

    protected get contentTop(): number { return this.contentH / 2; }
    protected get contentH(): number { return this.content?.getComponent(UITransform)?.height ?? 0; }
    protected get contentW(): number { return this.content?.getComponent(UITransform)?.width ?? 0; }

    private resize(): void {
        const { width, height } = view.getVisibleSize();
        if (!width || !height) return;
        const wide = width > height;
        const rebuild = !this.sheet || this.wide !== wide;
        this.wide = wide;
        this.node.getComponent(UITransform)!.setContentSize(width, height);
        if (!this.shade) {
            this.shade = makePanelNode(this.node, 'Shade', width, height);
            this.shade.addComponent(Graphics);
            this.shade.on(Node.EventType.TOUCH_END, () => this.close());
        }
        this.shade.getComponent(UITransform)!.setContentSize(width, height);
        const bg = this.shade.getComponent(Graphics)!;
        bg.clear();
        bg.fillColor = new Color(27, 35, 29, 158);
        bg.rect(-width / 2, -height / 2, width, height);
        bg.fill();
        this.cardW = wide ? 1020 : 690;
        this.cardH = wide ? 846 : 1116;
        const rail = wide ? 262 : 0;
        const sheetW = this.cardW + rail;
        const sheetH = this.cardH + (wide ? 0 : 76);
        if (rebuild) {
            if (this.sheet) { this.sheet.removeFromParent(); this.sheet.destroy(); }
            this.sheet = makePanelNode(this.node, 'Window', sheetW, sheetH);
            const g = this.sheet.addComponent(Graphics);
            drawShadow(g, -sheetW / 2, -sheetH / 2, sheetW, sheetH, 21, 5);
            g.fillColor = UI_HUD.accentRim;
            g.roundRect(-sheetW / 2 - 3, -sheetH / 2 - 3, sheetW + 6, sheetH + 6, 23);
            g.fill();
            g.fillColor = UI_COLOR.panel;
            g.roundRect(-sheetW / 2, -sheetH / 2, sheetW, sheetH, 21);
            g.fill();
            this.sheet.on(Node.EventType.TOUCH_END, () => {});
            this.card = makePanelNode(this.sheet, 'Card', this.cardW, this.cardH);
            this.card.setPosition(rail / 2, wide ? 0 : -38, 0);
            const head = makePanelNode(this.card, 'Header', this.cardW, Panel.HEAD_H);
            head.setPosition(0, this.cardH / 2 - Panel.HEAD_H / 2, 0);
            const x = -this.cardW / 2 + Panel.PAD_X;
            this.titleLabel = makeLabelLeft(head, 'Title', this.titleText, UI_FONT.title, UI_COLOR.text, this.cardW - 286);
            this.titleLabel.isBold = true;
            this.titleLabel.node.setPosition(x, 0, 0);
            if (this.subtitle) {
                const tag = makeTag(head, this.subtitle, UI_PALETTE.blue);
                const offset = Math.min(this.cardW - 368, this.titleText.length * UI_FONT.title);
                tag.setPosition(x + offset + 18 + tag.getComponent(UITransform)!.width / 2, 0, 0);
            }
            const close = makeRoundButton(head, 'Close', 'close', 54, () => this.close(), UI_HUD.onAccent, UI_HUD.accent, true);
            close.setActive(true);
            close.node.setPosition(-x - 21, 0, 0);
            const line = head.addComponent(Graphics);
            line.fillColor = UI_COLOR.border;
            line.rect(x, -Panel.HEAD_H / 2 + 8, this.cardW - Panel.PAD_X * 2, 2);
            line.fill();
            const bodyH = this.cardH - Panel.HEAD_H - 28;
            this.content = makePanelNode(this.card, 'Content', this.cardW - Panel.PAD_X * 2, bodyH);
            this.content.setPosition(0, this.cardH / 2 - Panel.HEAD_H - bodyH / 2, 0);
            this.nav = makePanelNode(this.sheet, 'Navigation', wide ? rail : sheetW, wide ? sheetH : 76);
            this.nav.setPosition(wide ? -sheetW / 2 + rail / 2 : 0, wide ? 0 : sheetH / 2 - 38, 0);
            this.buildNavigation();
            this.renderPage?.();
        }
        const scale = Math.min(width * (wide ? 0.91 : 0.965) / sheetW, height * (wide ? 0.92 : 0.90) / sheetH);
        this.sheet!.setScale(scale, scale, 1);
    }

    protected buildingImage(parent: Node, id: string, x: number, y: number, w: number, h: number): void {
        const frame = Panel.art?.get(id);
        if (!frame) return;
        const rect = frame.rect;
        const scale = Math.min(w / rect.width, h / rect.height);
        const node = makePanelNode(parent, id, rect.width * scale, rect.height * scale);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        node.setPosition(x, y, 0);
    }

    private buildNavigation(): void {
        const nav = this.nav!;
        const { width: w, height: h } = nav.getComponent(UITransform)!;
        const bg = nav.addComponent(Graphics);
        bg.fillColor = UI_HUD.base;
        bg.roundRect(-w / 2, -h / 2, w, h, 18);
        bg.fill();
        if (this.wide) {
            const sky = makePanelNode(nav, 'Town', w - 24, 206);
            sky.setPosition(0, h / 2 - 118, 0);
            const art = sky.addComponent(Graphics);
            art.fillColor = new Color(211, 230, 207);
            art.roundRect(-w / 2 + 12, -103, w - 24, 206, 13);
            art.fill();
            art.fillColor = new Color(171, 199, 152);
            art.ellipse(0, -59, w * 0.40, 26);
            art.fill();
            this.buildingImage(sky, 'tree', 79, -32, 51, 86);
            this.buildingImage(sky, 'center', -10, 10, w - 75, 160);
            this.buildingImage(sky, 'hut', -66, -49, 78, 68);
        }
        PAGES.forEach((p, i) => {
            const active = this.page === p.key;
            const bw = this.wide ? w - 24 : (w - 24) / PAGES.length - 4;
            const bh = this.wide ? 76 : 53;
            const node = makePanelNode(nav, 'Nav_' + p.key, bw, bh);
            node.setPosition(this.wide ? 0 : -w / 2 + 14 + bw / 2 + i * (bw + 4),
                this.wide ? h / 2 - 252 - bh / 2 - i * (bh + 8) : 0, 0);
            if (active) {
                const g = node.addComponent(Graphics);
                g.fillColor = UI_HUD.accent;
                g.roundRect(-bw / 2, -bh / 2, bw, bh, 12);
                g.fill();
            }
            const color = active ? UI_HUD.onAccent : UI_HUD.text;
            if (this.wide) makeIcon(node, p.icon, 35).node.setPosition(-bw / 2 + 32, 0, 0);
            const label = makeLabelLeft(node, 'Label', this.wide ? p.name : p.short, this.wide ? 25 : 22, color, bw - (this.wide ? 68 : 12));
            label.node.setPosition(this.wide ? -bw / 2 + 60 : -22, 0, 0);
            label.isBold = active;
            node.on(Node.EventType.TOUCH_END, () => this.node.parent?.emit('open-management-page', p.key));
        });
    }

    showFeedback(text: string): void {
        if (!this.card) return;
        const old = this.card.getChildByName('Feedback');
        if (old) { old.removeFromParent(); old.destroy(); }
        const w = this.cardW - Panel.PAD_X * 2;
        const hint = makePanelNode(this.card, 'Feedback', w, 52);
        hint.setPosition(0, -this.cardH / 2 + 38, 0);
        const g = hint.addComponent(Graphics);
        g.fillColor = UI_HUD.accentRim;
        g.roundRect(-w / 2, -26, w, 52, 12);
        g.fill();
        makeLabel(hint, 'Message', text, UI_FONT.small, UI_HUD.onAccent, w - 24);
        this.scheduleOnce(() => { if (hint.isValid) hint.destroy(); }, 3);
    }

    close(): void {
        this.onClosed?.();
        this.node.active = false;
        this.node.destroy();
    }

    protected onDestroy(): void {
        view.off('canvas-resize', this.resize, this);
        InputGuard.remove(this.node);
    }
}
