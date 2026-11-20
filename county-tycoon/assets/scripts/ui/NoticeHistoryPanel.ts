import { _decorator, Graphics, Node, UITransform } from 'cc';
import { Notice, monthLabel } from '../core/sim/types';
import { Panel } from './Panel';
import { ScrollList } from './ScrollList';
import { makeLabelLeft, UI_COLOR, UI_FONT, UI_PALETTE, UI_RADIUS } from './UiTheme';

const { ccclass } = _decorator;

export interface NoticeEntry {
    kind: Notice['kind'];
    text: string;
    month: number;
}

@ccclass('NoticeHistoryPanel')
export class NoticeHistoryPanel extends Panel {
    static show(parent: Node, entries: readonly NoticeEntry[]): NoticeHistoryPanel {
        const panel = Panel.open(NoticeHistoryPanel, parent, '县城公告', '最近动态', 'notices');
        panel.renderPage = () => panel.fill(entries);
        panel.renderPage();
        return panel;
    }

    refresh(): void {
        this.content?.destroyAllChildren();
        this.renderPage?.();
    }

    private fill(entries: readonly NoticeEntry[]): void {
        const parent = this.content!;
        const W = this.contentW;
        if (!entries.length) {
            const empty = makeLabelLeft(parent, 'Empty', '暂无公告。居民迁入、产业研究和县城大事会记录在这里。', UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(-W / 2, this.contentTop - 34, 0);
            return;
        }
        const list = ScrollList.mount(parent, 'Notices', W, this.contentH);
        list.setRows(entries.slice().reverse().map((item) => {
            const lines = Math.max(1, Math.ceil(item.text.length * UI_FONT.body / (W - 52)));
            const h = 66 + lines * (UI_FONT.body + 8);
            return { height: h, build: (row: Node) => {
                const g = row.addComponent(Graphics);
                g.fillColor = UI_COLOR.block;
                g.roundRect(-W / 2, -h / 2 + 8, W, h - 8, UI_RADIUS);
                g.fill();
                const when = makeLabelLeft(row, 'When', monthLabel(item.month), UI_FONT.small, UI_PALETTE.blue, W - 52);
                when.node.setPosition(-W / 2 + 24, h / 2 - 25, 0);
                const note = makeLabelLeft(row, 'Message', item.text, UI_FONT.body, UI_COLOR.text, W - 52);
                note.node.getComponent(UITransform)!.setContentSize(W - 52, h - 55);
                note.node.setPosition(-W / 2 + 24, -19, 0);
            } };
        }));
    }
}
