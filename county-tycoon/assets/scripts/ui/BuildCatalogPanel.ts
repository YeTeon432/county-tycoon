import { _decorator, Graphics, Node } from 'cc';
import { BAR_TABS, BuildingBar } from './BuildingBar';
import { Panel } from './Panel';
import { ScrollList } from './ScrollList';
import { formatMoney, makeButton, makeLabelLeft, UI_COLOR, UI_FONT, UI_RADIUS } from './UiTheme';

const { ccclass } = _decorator;

@ccclass('BuildCatalogPanel')
export class BuildCatalogPanel extends Panel {
    static show(parent: Node, bar: BuildingBar, onPlace: (id: string) => void): BuildCatalogPanel {
        const page = Panel.open(BuildCatalogPanel, parent, '建造目录', '', 'build');
        page.renderPage = () => page.fill(bar, onPlace);
        page.renderPage();
        return page;
    }

    refresh(): void {
        this.content?.destroyAllChildren();
        this.renderPage?.();
    }

    private fill(bar: BuildingBar, onPlace: (id: string) => void): void {
        const host = this.content!;
        const W = this.contentW;
        const gap = 8, tabW = (W - gap * (BAR_TABS.length - 1)) / BAR_TABS.length;
        BAR_TABS.forEach((tab, i) => {
            const b = makeButton(host, 'Category_' + tab.key, tab.label, tabW, 54,
                tab.key === bar.tab ? 'primary' : 'secondary', () => {
                    bar.selectTab(tab.key);
                    this.refresh();
                });
            b.node.setPosition(-W / 2 + tabW / 2 + i * (tabW + gap), this.contentTop - 27, 0);
        });

        const list = ScrollList.mount(host, 'Buildings', W, this.contentH - 72);
        list.node.setPosition(0, -36, 0);
        list.setRows(bar.catalogEntries().map(({ def, econ }) => ({ height: 126, build: (row: Node) => {
            const bg = row.addComponent(Graphics);
            bg.fillColor = UI_COLOR.block;
            bg.roundRect(-W / 2, -55, W, 114, UI_RADIUS);
            bg.fill();
            this.buildingImage(row, def.id, -W / 2 + 58, 2, 90, 94);
            const x = -W / 2 + 116, textW = W - 274;
            const title = makeLabelLeft(row, 'Name', def.name, UI_FONT.body, UI_COLOR.text, textW);
            title.isBold = true;
            title.node.setPosition(x, 31, 0);
            const facts = [`占地 ${def.width}×${def.height}`];
            if (econ?.housing) facts.push(`可住 ${econ.housing} 人`);
            if (econ?.jobs) facts.push(`岗位 ${econ.jobs} 个`);
            if (def.terrain) facts.push(({ river: '建在河上', riverbank: '靠河', ore: '需要矿点' })[def.terrain]);
            const detail = makeLabelLeft(row, 'Capacity', facts.join(' · '), UI_FONT.small, UI_COLOR.textDim, textW);
            detail.node.setPosition(x, -2, 0);
            const reason = bar.blockReason(def);
            if (reason) {
                const why = makeLabelLeft(row, 'Requirement', reason, UI_FONT.small, UI_COLOR.down, textW);
                why.node.setPosition(x, -31, 0);
            }
            const button = makeButton(row, 'Place_' + def.id, reason ? '暂不可建' : '去选址', 136, 50,
                reason ? 'secondary' : 'primary', () => {
                    if (bar.blockReason(def)) this.refresh();
                    else onPlace(def.id);
                });
            button.setEnabled(!reason);
            button.node.setPosition(W / 2 - 82, -23, 0);
            if (econ) {
                const price = makeLabelLeft(row, 'Cost', formatMoney(econ.cost), UI_FONT.body, UI_COLOR.gold, 138);
                price.node.setPosition(W / 2 - 149, 30, 0);
            }
        } })));
    }
}
