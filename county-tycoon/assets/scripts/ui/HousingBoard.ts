import { Color, Graphics, Node } from 'cc';
import { HousingSummary } from '../core/sim/SimApi';
import { makeLabelLeft, makeLabelRight, makePanelNode, UI_COLOR, UI_FONT, UI_PALETTE } from './UiTheme';

export const HOUSING_BOARD_HEIGHT = 152;

/** 居民总览和引进窗口共用。住位按人计，本地待安置居民优先。 */
export function makeHousingBoard(parent: Node, width: number, top: number, initial: HousingSummary) {
    const h = HOUSING_BOARD_HEIGHT;
    const board = makePanelNode(parent, 'HousingBoard', width, h);
    board.setPosition(0, top - h / 2, 0);
    const g = board.addComponent(Graphics);
    const left = -width / 2 + 20;
    const colW = (width - 40) / 3;
    const title = makeLabelLeft(board, 'Heading', '人口与住宅', 24, UI_PALETTE.white, width / 2 - 20);
    title.isBold = true;
    title.node.setPosition(left, 47, 0);
    const supply = makeLabelRight(board, 'Supply', '', 20, UI_PALETTE.white, width * 0.55);
    supply.node.setPosition(-left, 47, 0);
    const values = ['全城人口', '已入住 / 总住位', '还可接纳'].map((caption, i) => {
        const x = left + i * colW;
        const label = makeLabelLeft(board, 'Caption', caption, 19, UI_COLOR.textDim, colW - 8);
        label.node.setPosition(x, -2, 0);
        const value = makeLabelLeft(board, 'Value', '', UI_FONT.title, UI_COLOR.text, colW - 8);
        value.isBold = true;
        value.node.setPosition(x, -36, 0);
        return value;
    });
    g.fillColor = new Color(44, 101, 89);
    g.roundRect(-width / 2, -h / 2, width, h, 14);
    g.fill();
    g.fillColor = new Color(229, 241, 225);
    g.roundRect(-width / 2 + 1, -h / 2 + 1, width - 2, 97, 13);
    g.fill();
    const refresh = (data: HousingSummary) => {
        supply.string = `住宅 ${data.buildings} 栋 · 待安置 ${data.unhoused} 人`;
        values[0].string = `${data.population} 人`;
        values[1].string = `${data.occupied} / ${data.capacity}`;
        values[2].string = `${data.available} 人`;
        values[2].color = data.available > 0 ? UI_COLOR.up : UI_COLOR.down;
    };
    refresh(initial);
    return refresh;
}
