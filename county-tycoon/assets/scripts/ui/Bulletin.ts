import { BlockInputEvents, Color, Graphics, Node, resources, Sprite, SpriteFrame, UITransform, view } from 'cc';
import { Notice } from '../core/sim/types';
import { ListRow, ScrollList } from './ScrollList';
import { drawShadow, makeLabel, makeLabelLeft, makePanelNode, UI_COLOR } from './UiTheme';

const advice = [
    { title: '从村口接一段土路', body: '打开「道路·设施」，顺着村口的土路往外铺，两旁留出盖房的空地。', photo: 'village-road' },
    { title: '沿路盖一栋农房', body: '在「住宅」里选土坯农房，盖在新路旁，给搬来的乡亲留个住处。', photo: 'village-home' },
    { title: '照着乡亲的心愿开店', body: '点住宅上方的心愿气泡，看看附近缺什么，再替乡亲选个方便的位置。', photo: 'village-shop' },
];
const blue = new Color(22, 155, 219);
const deepBlue = new Color(19, 112, 164);
const ink = new Color(32, 82, 107);
const paper = new Color(255, 253, 244);
const secondary = new Color(68, 88, 91);

function rounded(g: Graphics, x: number, y: number, w: number, h: number, radius: number, color: Color): void {
    g.fillColor = color;
    g.roundRect(x, y, w, h, radius);
    g.fill();
}

function adviceRow(row: Node, index: number, w: number, h: number): void {
    const item = advice[index];
    const g = row.addComponent(Graphics);
    rounded(g, -w / 2, -h / 2 + 4, w, h - 8, 14, index === 0 ? new Color(255, 244, 193) : new Color(245, 248, 244));
    const photoW = Math.min(228, Math.round(w * 0.25)), photoH = photoW * 168 / 320;
    const x = -w / 2 + 20, tx = x + photoW + 28, textW = w / 2 - tx - 20;
    rounded(g, x - 3, -photoH / 2 - 6, photoW + 6, photoH + 8, 8, new Color(122, 170, 187));
    rounded(g, x - 3, -photoH / 2 - 3, photoW + 6, photoH + 6, 8, Color.WHITE);
    const photo = makePanelNode(row, 'Photo', photoW, photoH);
    photo.setPosition(x + photoW / 2, 0, 0);
    const sprite = photo.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load('ui/bulletin/' + item.photo + '/spriteFrame', SpriteFrame, (err, frame) => {
        if (!err && photo.isValid) sprite.spriteFrame = frame;
    });
    const title = makeLabelLeft(row, 'AdviceTitle', item.title, 32, ink, textW);
    title.isBold = true;
    title.node.setPosition(tx, 29, 0);
    const body = makeLabelLeft(row, 'Advice', item.body, 24, secondary, textW);
    body.lineHeight = 32;
    body.node.getComponent(UITransform)!.setContentSize(textW, 72);
    body.node.setPosition(tx, -29, 0);
}

export function openBulletin(parent: Node, history: readonly Pick<Notice, 'text' | 'kind'>[], close: () => void): Node {
    const { width, height } = view.getVisibleSize();
    const root = makePanelNode(parent, 'Bulletin', width, height);
    root.addComponent(BlockInputEvents);
    const shade = makePanelNode(root, 'Shade', width, height);
    const sg = shade.addComponent(Graphics);
    sg.fillColor = new Color(15, 34, 42, 158);
    sg.rect(-width / 2, -height / 2, width, height);
    sg.fill();
    shade.on(Node.EventType.TOUCH_END, close);

    const w = Math.min(1136, width - 44), rowH = 156;
    const h = Math.min(3 * rowH + 102, height - 156);
    const box = makePanelNode(root, 'Board', w, h);
    box.setPosition(0, -44, 0);
    box.on(Node.EventType.TOUCH_END, () => {});
    const g = box.addComponent(Graphics);
    const left = -w / 2, top = h / 2;
    drawShadow(g, left, -top - 4, w, h, 24, 5);
    rounded(g, left, -top - 5, w, h, 24, deepBlue);
    rounded(g, left, -top, w, h, 24, blue);
    rounded(g, left + 9, -top + 9, w - 18, h - 18, 17, paper);

    const headW = Math.min(428, w - 60);
    const head = makePanelNode(root, 'Header', headW, 74);
    head.setPosition(0, top + 8, 0);
    const hg = head.addComponent(Graphics);
    drawShadow(hg, -headW / 2, -40, headW, 74, 30, 3);
    rounded(hg, -headW / 2, -41, headW, 74, 30, deepBlue);
    rounded(hg, -headW / 2, -34, headW, 74, 30, blue);
    rounded(hg, -headW / 2 + 14, 32, headW - 28, 4, 2, new Color(102, 205, 247));
    const title = makeLabel(head, 'Title', '游戏公告', 40, Color.WHITE, headW - 115);
    title.isBold = true;
    title.node.setPosition(-15, 2, 0);
    const cross = makePanelNode(head, 'Close', 76, 76);
    cross.setPosition(headW / 2 - 40, 3, 0);
    const cg = cross.addComponent(Graphics);
    cg.fillColor = new Color(185, 76, 34); cg.circle(0, -3, 27); cg.fill();
    cg.fillColor = new Color(255, 132, 55); cg.circle(0, 1, 26); cg.fill();
    cg.strokeColor = Color.WHITE; cg.lineWidth = 6; cg.lineCap = Graphics.LineCap.ROUND;
    cg.moveTo(-8, -7); cg.lineTo(8, 9); cg.moveTo(-8, 9); cg.lineTo(8, -7); cg.stroke();
    cross.on(Node.EventType.TOUCH_END, close);

    const listW = w - 48, listH = h - 102;
    let list: ScrollList | null = null;
    let selectedTab = -1;
    const tabW = Math.min(180, listW / 2);
    const titles = ['开局建议', '县城消息'];
    const tabs = titles.map((caption, i) => {
        const tab = makePanelNode(box, 'Tab' + i, tabW, 62);
        tab.setPosition(left + 24 + tabW * (i + 0.5), top - 43, 0);
        const label = makeLabel(tab, 'Caption', caption, 26, secondary, tabW);
        return { tab, label };
    });
    const underline = makePanelNode(box, 'Underline', tabW - 32, 5);
    rounded(underline.addComponent(Graphics), -tabW / 2 + 16, -2, tabW - 32, 5, 2, blue);
    const select = (active: number) => {
        if (selectedTab === active) return;
        selectedTab = active;
        if (list) {
            list.node.active = false;
            list.node.destroy();
        }
        list = ScrollList.mount(box, 'Entries', listW, listH);
        list.node.setPosition(0, -30, 0);
        tabs.forEach(({ tab, label }, i) => {
            label.color = i === active ? deepBlue : secondary;
            label.isBold = i === active;
            if (i === active) underline.setPosition(tab.position.x, top - 70, 0);
        });
        if (active === 0) {
            list.setRows(advice.map((_, i) => ({ height: rowH, build: row => adviceRow(row, i, listW, rowH) })));
            return;
        }
        const rows: ListRow[] = history.slice(-12).reverse().map(({ text, kind }) => ({
            height: 78,
            build: row => {
                const warn = kind === 'warn' || kind === 'leave' || kind === 'layoff';
                const line = makeLabelLeft(row, 'News', text, 24, warn ? UI_COLOR.down : ink, listW - 44);
                line.node.getComponent(UITransform)!.setContentSize(listW - 44, 68);
                line.node.setPosition(-listW / 2 + 20, 0, 0);
            },
        }));
        if (!rows.length) rows.push({ height: 120, build: row => { makeLabel(row, 'Empty', '县里暂时没有新消息', 25, secondary, listW); } });
        list.setRows(rows);
    };
    tabs.forEach(({ tab }, i) => tab.on(Node.EventType.TOUCH_END, () => select(i)));
    select(0);
    return root;
}
