import { Color, Graphics, Node, UITransform } from 'cc';
import { Resident } from '../core/sim/types';
import { ScrollList } from './ScrollList';
import { Portrait } from './Portrait';
import { makeLabel, makeLabelLeft, makeLabelRight, UI_COLOR, UI_FONT, UI_PALETTE } from './UiTheme';

/**
 * 名单里的一行人（建筑详情、居民总览共用，T406）：
 *   [姓的圆头像] 名字（蓝，可点）       右上小字说明
 *               年龄 · 工作（灰）       右下粗体数值
 * 底部一条浅分隔线。整行可点；刚拖过列表不算点。
 */
export function buildPersonRow(
    row: Node,
    r: Resident,
    list: ScrollList | null,
    onTap: ((id: number) => void) | null,
    right: { caption: string; value: string; color: Color },
    info?: string,
): void {
    const W = row.getComponent(UITransform)!.width;
    const H = row.getComponent(UITransform)!.height;
    const male = r.gender === 'M';

    const g = row.addComponent(Graphics);
    g.fillColor = UI_COLOR.borderDim;
    g.rect(-W / 2 + 64, -H / 2, W - 64, 2);
    g.fill();

    // D023：有头像图就放头像，没有退回「姓」字圆圈
    const bg = male ? UI_COLOR.avatarM : UI_COLOR.avatarF;
    if (!Portrait.place(row, r, -W / 2 + 26, 0, 50, bg)) {
        g.fillColor = bg;
        g.circle(-W / 2 + 26, 0, 24);
        g.fill();
        const initial = makeLabel(row, 'Initial', r.name.charAt(0), UI_FONT.small, male ? UI_PALETTE.blue : UI_PALETTE.coral, 40);
        initial.isBold = true;
        initial.node.setPosition(-W / 2 + 26, 0, 0);
    }

    const name = makeLabelLeft(row, 'Name', r.name, UI_FONT.body, UI_COLOR.link, 220);
    name.node.setPosition(-W / 2 + 66, 14, 0);

    const job = r.jobTitle ? r.jobTitle : (r.age >= 18 && r.age < 60 ? '待业' : '—');
    const sub = makeLabelLeft(row, 'Info', info ?? `${r.age} 岁 · ${job}`, UI_FONT.small, UI_COLOR.textDim, W - 230);
    sub.node.setPosition(-W / 2 + 66, -16, 0);

    const cap = makeLabelRight(row, 'Cap', right.caption, UI_FONT.small - 2, UI_COLOR.textDim, 140);
    cap.node.setPosition(W / 2 - 4, 16, 0);
    const val = makeLabelRight(row, 'Val', right.value, UI_FONT.body, right.color, 140);
    val.isBold = true;
    val.node.setPosition(W / 2 - 4, -12, 0);

    row.on(Node.EventType.TOUCH_END, () => {
        if (list && list.dragging) return;
        if (onTap) onTap(r.id);
    });
}
