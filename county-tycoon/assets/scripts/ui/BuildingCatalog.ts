import { _decorator, Color, Graphics, Node, Sprite, UITransform } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { ResearchStatus, SimApi } from '../core/sim/SimApi';
import { BuildingEcon } from '../core/sim/types';
import { BAR_TABS, BuildingBar } from './BuildingBar';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import { formatMoney, makeButton, makeLabel, makeLabelLeft, makePanelNode, UI_COLOR, UI_HUD } from './UiTheme';

const { ccclass } = _decorator;
const GRAY_PAPER = new Color(237, 237, 233);
const GRAY_INK = new Color(83, 86, 85);
const EDU = ['', '初中', '高中', '大专'];
const DEMAND = { food: '餐饮', daily: '日用', fun: '娱乐', other: '其他消费' };
const signed = (n: number) => n > 0 ? '+' + n : String(n);

/** 岗位、租金和容量与模拟共用配置。每种建筑只列适用的指标。 */
function facts(def: BuildingDef, e: Readonly<BuildingEcon> | null | undefined, reach: number): string[] {
    if (!e) return [`占地 ${def.width}×${def.height} 格`];
    const lines: string[] = [];
    if (e.housing) lines.push(`住 ${e.housing} 人　成人月租 ${formatMoney(e.rent)}　住房幸福度 ${signed(e.homeMood)}`);
    if (e.demand) lines.push(`${DEMAND[e.demand]}　${e.price ? '客单价 ' + formatMoney(e.price) : '免费'}　步行沿路 ${e.radius} 格`);
    if (reach && (!e.demand || reach !== e.radius)) lines.push(`公共服务覆盖沿路 ${reach} 格`);
    if (e.jobs.length) {
        lines.push('岗位　' + e.jobs.map(j => `${j.title} ×${j.count}${j.edu ? '（' + EDU[j.edu] + '起）' : ''}`).join('、'));
    }
    if (e.env) lines.push(`周边环境 ${signed(e.env)}`);
    const cost = e.selfBuilt ? '翻盖费' : '造价';
    lines.push(`${def.width}×${def.height} 格　${cost} ${formatMoney(e.cost)}　维护 ${formatMoney(e.upkeep)}/月　${e.buildDays ? '工期 ' + e.buildDays + ' 天' : '立即建成'}`);
    return lines;
}

@ccclass('BuildingCatalog')
export class BuildingCatalog extends Panel {
    protected cardH = 1020;
    private sim!: SimApi;
    private bar!: BuildingBar;
    private category = '住宅';
    private updateEntries: ((projects: ResearchStatus[]) => void)[] = [];

    static show(parent: Node, sim: SimApi, bar: BuildingBar): BuildingCatalog {
        const panel = Panel.open(BuildingCatalog, parent, '建筑图鉴', `${bar.defs.length} 种建筑`);
        panel.sim = sim;
        panel.bar = bar;
        panel.renderPage = () => panel.render();
        panel.render();
        return panel;
    }

    refreshAvailability(): void {
        const projects = this.sim.researchList?.() ?? [];
        for (const update of this.updateEntries) update(projects);
    }

    private render(): void {
        const content = this.content!;
        for (const child of content.children.slice()) { child.removeFromParent(); child.destroy(); }
        this.updateEntries = [];
        const w = this.contentW;
        const tabW = w / BAR_TABS.length;
        for (const [i, tab] of BAR_TABS.entries()) {
            const button = makeButton(content, 'Tab_' + tab.key, tab.label, tabW - 6, 48,
                this.category === tab.key ? 'primary' : 'secondary', () => {
                    if (this.category === tab.key) return;
                    this.category = tab.key;
                    this.render();
                });
            button.node.setPosition(-w / 2 + tabW * (i + 0.5), this.contentTop - 28, 0);
        }
        const list = ScrollList.mount(content, 'Buildings', w, this.contentH - 68);
        list.node.setPosition(0, -34, 0);
        const entries = this.bar.defs.filter(def => BuildingBar.tabOf(def) === this.category);
        // 住户自行翻盖的住宅列在可规划的新建住宅之后。
        const selfBuilt = (def: BuildingDef) => Number(!!this.sim.buildingEconomy?.(def.id)?.selfBuilt);
        if (this.category === '住宅') entries.sort((a, b) => selfBuilt(a) - selfBuilt(b));
        list.setRows(entries.map(def => this.entry(def, w)));
        this.refreshAvailability();
    }

    private entry(def: BuildingDef, w: number): ListRow {
        const econ = this.sim.buildingEconomy?.(def.id);
        const lines = facts(def, econ, this.sim.reachRadius?.(def.id) ?? 0);
        const height = 172 + lines.length * 30;
        return { height, build: (row: Node) => {
            const top = height / 2, left = -w / 2;
            const bg = row.addComponent(Graphics);
            const thumb = this.bar.frameFor(def);
            let sprite: Sprite | null = null;
            if (thumb) {
                const scale = Math.min(88 / thumb.rect.width, 68 / thumb.rect.height);
                const image = makePanelNode(row, 'Building', thumb.rect.width * scale, thumb.rect.height * scale);
                image.setPosition(left + 62, top - 44, 0);
                sprite = image.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = thumb;
            }
            const title = makeLabelLeft(row, 'Name', def.name, 29, UI_COLOR.text, w - 246);
            title.isBold = true;
            title.node.setPosition(left + 118, top - 33, 0);
            const status = makeLabel(row, 'Status', '', 21, UI_COLOR.up, 105);
            status.node.setPosition(w / 2 - 68, top - 31, 0);
            const purpose = makeLabelLeft(row, 'Purpose', def.purpose ?? def.category, 21, UI_COLOR.text, w - 138);
            purpose.lineHeight = 26;
            purpose.node.getComponent(UITransform)!.setContentSize(w - 138, 56);
            purpose.node.setPosition(left + 118, top - 77, 0);
            lines.forEach((line, i) => {
                const label = makeLabelLeft(row, 'Fact', line, 21, UI_COLOR.text, w - 40);
                label.node.setPosition(left + 20, top - 123 - i * 30, 0);
            });
            const access = makeLabelLeft(row, 'Availability', '', 20, GRAY_INK, w - 40);
            access.lineHeight = 24;
            access.node.getComponent(UITransform)!.setContentSize(w - 40, 50);
            access.node.setPosition(left + 20, -top + 37, 0);

            this.updateEntries.push(projects => {
                const center = def.id === 'center';
                const open = center || (this.sim.isUnlocked?.(def.id) ?? true);
                if (sprite) sprite.grayscale = !open;
                bg.clear();
                bg.fillColor = open ? UI_HUD.well : GRAY_PAPER;
                bg.roundRect(left + 1, -top + 8, w - 2, height - 10, 12);
                bg.fill();
                title.color = open ? UI_COLOR.text : GRAY_INK;
                status.color = open ? UI_COLOR.up : GRAY_INK;
                status.string = center ? '开局自带' : open ? '已解锁' : '未解锁';
                const project = projects.find(p => p.unlocks.indexOf(def.id) >= 0);
                if (center) access.string = '开局地图自带，点击地图上的发展中心即可使用。';
                else if (open) access.string = econ?.selfBuilt ? '由符合条件的住户出资翻盖。' : '可在建造栏选择。';
                else if (!project) access.string = '当前没有开放建造途径。';
                else access.string = `发展中心 · ${project.name}　${project.state === 'active' ? '研究中，' : ''}${project.reason || '研究费 ' + formatMoney(project.cost)}`;
            });
        }};
    }
}
