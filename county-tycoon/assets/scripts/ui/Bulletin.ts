import { BlockInputEvents, Graphics, Node, resources, Sprite, SpriteFrame, UITransform, view } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { showPromotions } from './PromotionBulletin';
import { Notice, SimState } from '../core/sim/types';
import { ListRow, ScrollList } from './ScrollList';
import { drawHudTile, drawShadow, makeLabel, makeLabelLeft, makePanelNode, makeRoundButton, UI_COLOR, UI_FONT, UI_HUD, UI_RADIUS } from './UiTheme';

const advice = [
    { title: '从村口接一段土路', body: '打开「道路·设施」，顺着村口的土路往外铺，两旁留出盖房的空地。', photo: 'village-road' },
    { title: '沿路盖一栋农房', body: '在「住宅」里选土坯农房，盖在新路旁，给搬来的乡亲留个住处。', photo: 'village-home' },
    { title: '照着乡亲的心愿开店', body: '点住宅上方的心愿气泡，看看附近缺什么，再替乡亲选个方便的位置。', photo: 'village-shop' },
];

function adviceRow(row: Node, index: number, w: number, h: number): void {
    const item = advice[index];
    const g = row.addComponent(Graphics);
    if (index > 0) {
        g.fillColor = UI_COLOR.borderDim;
        g.rect(-w / 2 + 12, h / 2 - 1, w - 24, 2);
        g.fill();
    }
    const photoW = Math.min(228, Math.round(w * 0.25)), photoH = photoW * 168 / 320;
    const x = -w / 2 + 20, tx = x + photoW + 28, textW = w / 2 - tx - 20;
    drawHudTile(g, x - 4, -photoH / 2 - 4, photoW + 8, photoH + 8, 6, UI_HUD.key, UI_COLOR.border);
    const photo = makePanelNode(row, 'Photo', photoW, photoH);
    photo.setPosition(x + photoW / 2, 0, 0);
    const sprite = photo.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load('ui/bulletin/' + item.photo + '/spriteFrame', SpriteFrame, (err, frame) => {
        if (!err && photo.isValid) sprite.spriteFrame = frame;
    });
    const title = makeLabelLeft(row, 'AdviceTitle', item.title, UI_FONT.title, UI_COLOR.text, textW);
    title.isBold = true;
    title.node.setPosition(tx, 29, 0);
    const body = makeLabelLeft(row, 'Advice', item.body, 24, UI_COLOR.textDim, textW);
    body.lineHeight = 32;
    body.node.getComponent(UITransform)!.setContentSize(textW, 72);
    body.node.setPosition(tx, -29, 0);
}

export function openBulletin(parent: Node, history: readonly Pick<Notice, 'text' | 'kind'>[], state: SimState,
    art: ArtLibrary | null, startWithPromotion: boolean, close: () => void, goResearch: () => void): Node {
    const { width, height } = view.getVisibleSize();
    const root = makePanelNode(parent, 'Bulletin', width, height);
    root.addComponent(BlockInputEvents);
    const shade = makePanelNode(root, 'Shade', width, height);
    const sg = shade.addComponent(Graphics);
    sg.fillColor = UI_COLOR.shade;
    sg.rect(-width / 2, -height / 2, width, height);
    sg.fill();
    shade.on(Node.EventType.TOUCH_END, close);

    const w = Math.min(1120, width - 44), rowH = 156;
    const box = makePanelNode(root, 'Board', w, 0);
    box.on(Node.EventType.TOUCH_END, () => {});
    const g = box.addComponent(Graphics);
    const left = -w / 2;
    const head = makePanelNode(box, 'Header', w - 32, 72);
    const titles = ['开局建议', '晋升公告', '县城消息'];
    const tabW = Math.min(164, w * 0.17);
    const closeX = w / 2 - 45;
    const titleX = left + 32;
    const tabsLeft = closeX - 48 - tabW * titles.length;
    const title = makeLabelLeft(head, 'Title', '游戏公告', UI_FONT.title, UI_COLOR.text, tabsLeft - titleX - 16);
    title.isBold = true;
    title.node.setPosition(titleX, 0, 0);
    const cross = makeRoundButton(head, 'Close', 'close', 50, close, UI_HUD.onAccent, UI_HUD.accent);
    cross.setActive(true);
    cross.node.setPosition(closeX, 0, 0);

    const listW = w - 48;
    let page: Node | null = null;
    let selectedTab = -1;
    const tabs = titles.map((caption, i) => {
        const tab = makePanelNode(head, 'Tab' + i, tabW - 6, 50);
        tab.setPosition(tabsLeft + tabW * (i + 0.5), 0, 0);
        const bg = tab.addComponent(Graphics);
        const label = makeLabel(tab, 'Caption', caption, UI_FONT.body, UI_HUD.text, tabW - 20);
        return { tab, bg, label };
    });
    const select = (active: number) => {
        if (selectedTab === active) return;
        selectedTab = active;
        const h = Math.min(active === 1 && state.promotions?.length ? 814 : 3 * rowH + 102, height - 110);
        const top = h / 2, listH = h - 102;
        box.getComponent(UITransform)!.setContentSize(w, h);
        g.clear();
        drawShadow(g, left, -top, w, h, UI_RADIUS, 4);
        drawHudTile(g, left, -top, w, h, UI_RADIUS, UI_HUD.base, UI_HUD.rim);
        g.fillColor = UI_COLOR.panel;
        g.roundRect(left + 7, -top + 7, w - 14, h - 87, 10);
        g.fill();
        head.setPosition(0, top - 40, 0);
        if (page) { page.active = false; page.destroy(); }
        page = makePanelNode(box, 'Page', listW, listH);
        page.setPosition(0, -36, 0);
        tabs.forEach(({ bg, label }, i) => {
            const on = i === active;
            bg.clear();
            drawHudTile(bg, -(tabW - 6) / 2, -25, tabW - 6, 50, 10,
                on ? UI_HUD.accent : UI_HUD.key, on ? UI_HUD.accentRim : UI_HUD.rim);
            label.color = on ? UI_HUD.onAccent : UI_HUD.text;
            label.isBold = on;
        });
        if (active === 1) {
            showPromotions(page, listW, listH, state.promotions ?? [], art, goResearch, state.level === 'top100');
            return;
        }
        const list = ScrollList.mount(page, 'Entries', listW, listH);
        if (active === 0) {
            list.setRows(advice.map((_, i) => ({ height: rowH, build: row => adviceRow(row, i, listW, rowH) })));
            return;
        }
        const rows: ListRow[] = history.slice(-12).reverse().map(({ text, kind }) => ({
            height: 78,
            build: row => {
                const warn = kind === 'warn' || kind === 'leave' || kind === 'layoff';
                const line = makeLabelLeft(row, 'News', text, 24, warn ? UI_COLOR.down : UI_COLOR.text, listW - 44);
                line.node.getComponent(UITransform)!.setContentSize(listW - 44, 68);
                line.node.setPosition(-listW / 2 + 20, 0, 0);
            },
        }));
        if (!rows.length) rows.push({ height: 120, build: row => { makeLabel(row, 'Empty', '县里暂时没有新消息', UI_FONT.body, UI_COLOR.textDim, listW); } });
        list.setRows(rows);
    };
    tabs.forEach(({ tab }, i) => tab.on(Node.EventType.TOUCH_END, () => select(i)));
    select(startWithPromotion ? 1 : 0);
    return root;
}
