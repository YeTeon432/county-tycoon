import { Graphics, Node, Sprite } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { centerArtId } from '../core/BuildingConfig';
import { LEVEL_NAME, monthLabel, PromotionProject, PromotionRecord } from '../core/sim/types';
import { ListRow, ScrollList } from './ScrollList';
import { formatMoney, makeButton, makeLabel, makeLabelLeft, makePanelNode, UI_COLOR, UI_HUD } from './UiTheme';

/** 一份公告对应晋升当天。切换历史、展开项目时只读当时的记录。 */
export function showPromotions(parent: Node, w: number, h: number, history: readonly PromotionRecord[],
    art: ArtLibrary | null, goResearch: () => void, atHighest: boolean): void {
    if (!history.length) {
        makeLabel(parent, 'Empty', atHighest ? '这份存档已达百强县，未保存过晋升公告' : '下次晋升后，这里会留下当时的变化和研究条件',
            24, UI_COLOR.textDim, w - 40);
        return;
    }
    const latestFirst = history.slice().reverse();
    let selected = 0;
    let expanded = false;
    const navH = history.length > 1 ? 54 : 0;
    const footerH = 68;
    const list = ScrollList.mount(parent, 'PromotionDetails', w, h - navH - footerH);
    list.node.setPosition(0, (footerH - navH) / 2, 0);
    const tabs = history.length > 1 ? latestFirst.map((record, i) => {
        const tw = Math.min(156, (w - 24) / history.length);
        const tab = makeButton(parent, 'Archive_' + record.to, LEVEL_NAME[record.to], tw - 8, 42, 'secondary', () => {
            selected = i;
            expanded = false;
            render();
        });
        tab.node.setPosition(-w / 2 + 12 + (i + 0.5) * tw, h / 2 - 25, 0);
        return tab;
    }) : [];
    const more = makeButton(parent, 'AllProjects', '', Math.min(226, w * 0.43), 52, 'secondary', () => {
        expanded = !expanded;
        render();
    });
    more.node.setPosition(-w / 2 + Math.min(226, w * 0.43) / 2 + 12, -h / 2 + 31, 0);
    const action = makeButton(parent, 'GoResearch', '去发展中心研究', Math.min(238, w * 0.44), 52, 'primary', goResearch);
    action.node.setPosition(w / 2 - Math.min(238, w * 0.44) / 2 - 12, -h / 2 + 31, 0);

    function render(): void {
        const record = latestFirst[selected];
        const fresh = record.projects.filter(p => p.newlyAvailable);
        const ready = record.projects.filter(p => !p.missing.length);
        more.node.active = record.projects.length > 0;
        more.label.string = expanded ? '返回晋升摘要' : `全部研究（${record.projects.length}）`;
        tabs.forEach((tab, i) => tab.setStyle(i === selected ? 'primary' : 'secondary'));
        const rows: ListRow[] = [{ height: 94, build: row => {
            const frame = art?.get(centerArtId(record.to));
            const left = -w / 2 + 16;
            if (frame) {
                const scale = Math.min(90 / frame.rect.width, 76 / frame.rect.height);
                const image = makePanelNode(row, 'Center', frame.rect.width * scale, frame.rect.height * scale);
                const sprite = image.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.spriteFrame = frame;
                image.setPosition(left + 45, 0, 0);
            }
            const x = left + (frame ? 108 : 0), textW = w / 2 - x - 16;
            const title = makeLabelLeft(row, 'Milestone', `${LEVEL_NAME[record.from]} → ${LEVEL_NAME[record.to]}`, 34, UI_COLOR.text, textW);
            title.isBold = true;
            title.node.setPosition(x, 17, 0);
            const info = `${monthLabel(record.month)}  ·  ${record.population} 位居民  ·  建设奖励 ${formatMoney(record.reward)}`;
            makeLabelLeft(row, 'Receipt', info, 22, UI_COLOR.gold, textW).node.setPosition(x, -22, 0);
        }}];
        const heading = (text: string) => rows.push({ height: 40, build: row => {
            const label = makeLabelLeft(row, 'Section', text, 23, UI_HUD.accent, w - 32);
            label.isBold = true;
            label.node.setPosition(-w / 2 + 16, 0, 0);
        }});
        const line = (text: string) => rows.push({ height: 40, build: row =>
            makeLabelLeft(row, 'Change', text, 22, UI_COLOR.text, w - 32).node.setPosition(-w / 2 + 16, 0, 0) });
        const project = (p: PromotionProject) => {
            const reasons = p.missing.length ? p.missing : [`研究费 ${formatMoney(p.cost)}，工期 ${p.days} 天`];
            const rowH = 48 + 30 * reasons.length;
            rows.push({ height: rowH, build: row => {
                const left = -w / 2 + 16, top = rowH / 2;
                const g = row.addComponent(Graphics);
                g.fillColor = UI_COLOR.borderDim;
                g.rect(left, top - 2, w - 32, 2);
                g.fill();
                const frame = p.artId === 'road' ? art?.groundByName('city-5') : art?.get(p.artId);
                if (frame) {
                    const scale = Math.min(66 / frame.rect.width, 58 / frame.rect.height);
                    const icon = makePanelNode(row, 'Building', scale * frame.rect.width, scale * frame.rect.height);
                    const sprite = icon.addComponent(Sprite);
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    sprite.spriteFrame = frame;
                    icon.setPosition(left + 34, top - 39, 0);
                }
                const status = p.missing.length ? '待满足' : '可研究';
                const badge = makeLabel(row, 'Status', status, 21, p.missing.length ? UI_COLOR.gold : UI_COLOR.up, 82);
                badge.node.setPosition(w / 2 - 60, top - 24, 0);
                const title = makeLabelLeft(row, 'Project', p.name, 24, UI_COLOR.text, w - 224);
                title.isBold = true;
                title.node.setPosition(left + 88, top - 24, 0);
                reasons.forEach((reason, i) => {
                    const info = !p.missing.length && p.effect ? p.effect + '  ·  ' + reason : reason;
                    makeLabelLeft(row, 'Condition', info, 21, UI_COLOR.textDim, w - 124)
                        .node.setPosition(left + 88, top - 53 - i * 30, 0);
                });
            }});
        };
        if (expanded) {
            // 先列本级开放的项目，方便辨认晋升的收益；以前开放的仍可查。
            for (const isNew of [true, false]) {
                const group = record.projects.filter(p => p.newlyAvailable === isNew);
                if (!group.length) continue;
                heading(isNew ? '本级新开放' : '此前已开放');
                group.sort((a, b) => Number(!!a.missing.length) - Number(!!b.missing.length)).forEach(project);
            }
        } else {
            if (fresh.length) heading(`本级新开放 ${fresh.length} 项研究，其中 ${fresh.filter(p => !p.missing.length).length} 项可立即研究`);
            else heading(`本级没有新增研究  ·  以往项目中有 ${ready.length} 项可立即研究`);
            const pool = fresh.length ? fresh : record.projects;
            const featureOrder = ['r-road', 'r-apartment', 'r-school', 'r-highrise', 'r-bridge', 'r-bank'];
            const rank = (p: PromotionProject) => {
                const index = featureOrder.indexOf(p.id);
                return index < 0 ? featureOrder.length : index;
            };
            const ordered = pool.slice().sort((a, b) => rank(a) - rank(b));
            const available = ordered.filter(p => !p.missing.length);
            const locked = ordered.filter(p => p.missing.length);
            const chosen = available.slice(0, locked.length ? 2 : 3);
            chosen.concat(locked.slice(0, 3 - chosen.length)).forEach(project);
            if (record.changes.length) heading('经营变化');
            record.changes.forEach(line);
        }
        list.setRows(rows);
    }
    render();
}
