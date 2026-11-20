import { _decorator, Graphics, Node } from 'cc';
import { InputGuard } from '../core/InputGuard';
import { Panel } from './Panel';
import { makeButton, makeLabelLeft, makePanelNode, UI_COLOR, UI_FONT, UI_RADIUS } from './UiTheme';

const { ccclass } = _decorator;

@ccclass('SettingsPanel')
export class SettingsPanel extends Panel {
    protected cardH = 292;

    static show(parent: Node, gridOn: boolean, onGridChange: (on: boolean) => void): SettingsPanel {
        const panel = Panel.open(SettingsPanel, parent, '设置');
        panel.buildGridRow(gridOn, onGridChange);
        // 点遮罩时只关设置，地图上的建造或拆除目标不应跟着改变。
        InputGuard.add(panel.node);
        return panel;
    }

    private buildGridRow(gridOn: boolean, onGridChange: (on: boolean) => void): void {
        const width = this.contentW, height = 100;
        const row = makePanelNode(this.content!, 'GridSetting', width, height);
        row.setPosition(0, this.contentTop - height / 2 - 8, 0);
        const bg = row.addComponent(Graphics);
        bg.fillColor = UI_COLOR.block;
        bg.roundRect(-width / 2, -height / 2, width, height, UI_RADIUS);
        bg.fill();

        const buttonWidth = 144;
        const textX = -width / 2 + 22;
        const textW = width - buttonWidth - 66;
        const title = makeLabelLeft(row, 'Title', '常显地图网格', UI_FONT.body, UI_COLOR.text, textW);
        title.isBold = true;
        title.node.setPosition(textX, 16, 0);
        const note = makeLabelLeft(row, 'Note', '放置和拆除时自动显示', UI_FONT.small, UI_COLOR.textDim, textW);
        note.node.setPosition(textX, -20, 0);

        const change = () => {
            gridOn = !gridOn;
            onGridChange(gridOn);
            toggle.label.string = gridOn ? '已开启' : '已关闭';
            toggle.setStyle(gridOn ? 'primary' : 'secondary');
        };
        const toggle = makeButton(row, 'GridToggle', gridOn ? '已开启' : '已关闭', buttonWidth, 60,
            gridOn ? 'primary' : 'secondary', change);
        toggle.node.setPosition(width / 2 - buttonWidth / 2 - 20, 0, 0);
    }

    protected onDestroy(): void {
        InputGuard.remove(this.node);
        super.onDestroy();
    }
}
