import { townAudio } from '../core/TownAudio';
import { _decorator, Graphics, Node } from 'cc';
import { Panel } from './Panel';
import { makeButton, makeLabelLeft, makePanelNode, UI_COLOR, UI_FONT, UI_RADIUS } from './UiTheme';

const { ccclass } = _decorator;

@ccclass('SettingsPanel')
export class SettingsPanel extends Panel {
    protected cardH = 508;

    static show(parent: Node, gridOn: boolean, onGridChange: (on: boolean) => void, onSaveError: () => void): SettingsPanel {
        const panel = Panel.open(SettingsPanel, parent, '设置', '');
        panel.renderPage = () => {
            panel.buildRow(0, 'Grid', '常显地图网格', '放置和拆除时自动显示', gridOn, on => {
                gridOn = on;
                onGridChange(on);
            });
            panel.buildRow(1, 'Music', '背景音乐', '循环播放《塘边早市》', townAudio.musicOn, on => {
                if (!townAudio.setMusic(on)) onSaveError();
            });
            panel.buildRow(2, 'Effects', '游戏音效', '操作与经营事件提示', townAudio.effectsOn, on => {
                if (!townAudio.setEffects(on)) onSaveError();
            });
        };
        panel.renderPage();
        return panel;
    }

    private buildRow(index: number, id: string, name: string, description: string, enabled: boolean, onChange: (on: boolean) => void): void {
        const width = this.contentW, height = 100;
        const row = makePanelNode(this.content!, id + 'Setting', width, height);
        row.setPosition(0, this.contentTop - height / 2 - 8 - index * 108, 0);
        const bg = row.addComponent(Graphics);
        bg.fillColor = UI_COLOR.block;
        bg.roundRect(-width / 2, -height / 2, width, height, UI_RADIUS);
        bg.fill();

        const buttonWidth = 144;
        const textX = -width / 2 + 22;
        const textW = width - buttonWidth - 66;
        const title = makeLabelLeft(row, 'Title', name, UI_FONT.body, UI_COLOR.text, textW);
        title.isBold = true;
        title.node.setPosition(textX, 16, 0);
        const note = makeLabelLeft(row, 'Note', description, UI_FONT.small, UI_COLOR.textDim, textW);
        note.node.setPosition(textX, -20, 0);

        const change = () => {
            enabled = !enabled;
            onChange(enabled);
            toggle.label.string = enabled ? '已开启' : '已关闭';
            toggle.setStyle(enabled ? 'primary' : 'secondary');
        };
        const toggle = makeButton(row, id + 'Toggle', enabled ? '已开启' : '已关闭', buttonWidth, 60,
            enabled ? 'primary' : 'secondary', change);
        toggle.node.setPosition(width / 2 - buttonWidth / 2 - 20, 0, 0);
    }

}
