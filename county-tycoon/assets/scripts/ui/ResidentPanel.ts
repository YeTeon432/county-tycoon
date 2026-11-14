import { _decorator, Color, Graphics, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { TownModel } from '../core/TownModel';
import { LifeEvent, Resident, monthLabel } from '../core/sim/types';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import {
    formatMoney, makeLabel, makeLabelLeft, makePanelNode, makeSectionTitle, makeStatTile, moodColor, moodLabel,
    UI_COLOR, UI_FONT, UI_PALETTE, UI_RADIUS,
} from './UiTheme';

const { ccclass } = _decorator;

const VEHICLE_NAME: Record<string, string> = { walk: '步行', ebike: '电动车', moto: '摩托车', car: '汽车' };

/**
 * 居民档案（T308 下半段，T406 改成白色抽屉）。
 *
 * 顶部三个数值格：月薪 / 储蓄 / 心情；
 * 中间一块浅灰信息卡：年龄学历、住处、工作、家庭、出行、来县时间；
 * 底部「人生记录」可滚动（LifeEvent 越攒越多）。
 */
@ccclass('ResidentPanel')
export class ResidentPanel extends Panel {
    protected cardH = 980;

    private _sim: SimApi | null = null;
    private _model: TownModel | null = null;

    static show(parent: Node, sim: SimApi, model: TownModel, residentId: number): ResidentPanel | null {
        const r = sim.resident(residentId);
        if (!r) return null;
        const panel = Panel.open(ResidentPanel, parent, r.name, `${r.gender === 'M' ? '男' : '女'} · ${r.age} 岁`);
        panel._sim = sim;
        panel._model = model;
        panel.fill(sim, r);
        return panel;
    }

    private fill(sim: SimApi, r: Resident): void {
        const content = this.content;
        if (!content) return;
        const W = this.contentW;
        let y = this.contentTop;

        // ── 数值格 ──
        const tileH = 108, gap = 16;
        const tileW = (W - gap * 2) / 3;
        const tiles: [string, string, Color][] = [
            ['月薪', r.salary > 0 ? formatMoney(r.salary) : '—', r.salary > 0 ? UI_COLOR.gold : UI_COLOR.textDim],
            ['储蓄', formatMoney(r.savings), r.savings >= 0 ? UI_PALETTE.blue : UI_COLOR.down],
            ['心情', `${Math.round(r.mood)} ${moodLabel(r.mood)}`, moodColor(r.mood)],
        ];
        for (let i = 0; i < tiles.length; i++) {
            const t = makeStatTile(content, tileW, tileH, tiles[i][0], tiles[i][1], tiles[i][2]);
            t.node.setPosition(-W / 2 + tileW / 2 + i * (tileW + gap), y - tileH / 2, 0);
        }
        y -= tileH + 20;

        // ── 信息卡 ──
        const eduText = ['未上学', '初中', '高中', '大专以上'][r.education] ?? '—';
        const lines: [string, string][] = [
            ['学历', eduText],
            ['住处', this.buildingName(r.homeId) ?? '无'],
            ['工作', this.jobText(r)],
        ];
        const family: string[] = [];
        const spouse = r.spouseId !== null ? sim.resident(r.spouseId) : null;
        if (spouse) family.push(`配偶 ${spouse.name}`);
        const kids = r.childIds.map((id) => sim.resident(id)).filter((p): p is Resident => !!p);
        if (kids.length > 0) family.push(`${kids.length} 个孩子`);
        const parents = r.parentIds.map((id) => sim.resident(id)).filter((p): p is Resident => !!p);
        if (parents.length > 0) family.push(`父母 ${parents.map((p) => p.name).join('、')}`);
        if (family.length > 0) lines.push(['家庭', family.join('，')]);
        lines.push(['出行', VEHICLE_NAME[r.vehicle ?? 'walk'] ?? '步行']);
        lines.push(['来县', monthLabel(r.arrivedMonth) + (r.monthsUnemployed > 0 && !r.jobTitle ? ` · 失业 ${r.monthsUnemployed} 个月` : '')]);

        const LINE_H = 50;
        const blockH = lines.length * LINE_H + 20;
        const block = makePanelNode(content, 'Info', W, blockH);
        block.setPosition(0, y - blockH / 2, 0);
        const bg = block.addComponent(Graphics);
        bg.fillColor = UI_COLOR.block;
        bg.roundRect(-W / 2, -blockH / 2, W, blockH, UI_RADIUS);
        bg.fill();
        let ly = blockH / 2 - 10 - LINE_H / 2;
        for (const [k, v] of lines) {
            const kl = makeLabelLeft(block, 'Key', k, UI_FONT.small, UI_COLOR.textDim, 80);
            kl.node.setPosition(-W / 2 + 24, ly, 0);
            const vl = makeLabelLeft(block, 'Val', v, UI_FONT.body, UI_COLOR.text, W - 140);
            vl.node.setPosition(-W / 2 + 108, ly, 0);
            ly -= LINE_H;
        }
        y -= blockH + 36;

        // ── 人生记录 ──
        makeSectionTitle(content, W, y, '人生记录', UI_PALETTE.green);
        y -= 30;
        const bottom = -this.contentH / 2;
        const listH = Math.max(90, y - bottom);
        const list = ScrollList.mount(content, 'Log', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);

        if (r.log.length === 0) {
            const empty = makeLabel(content, 'Empty', '还没有记录', UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(0, y - 40, 0);
            list.node.active = false;
            return;
        }

        // 最近的在最上面（玩家关心"刚发生了什么"）
        const items = r.log.slice().reverse();
        const rows: ListRow[] = items.map((e) => ({
            height: 52,
            build: (row) => this.buildLogRow(row, W, e),
        }));
        list.setRows(rows);
    }

    /** 一条记录：左边时间线圆点 + 时间（灰）+ 内容 */
    private buildLogRow(row: Node, W: number, e: LifeEvent): void {
        const H = row.getComponent(UITransform)!.height;
        const g = row.addComponent(Graphics);
        g.fillColor = UI_COLOR.border;
        g.rect(-W / 2 + 9, -H / 2, 2, H);
        g.fill();
        g.fillColor = UI_PALETTE.green;
        g.circle(-W / 2 + 10, 0, 6);
        g.fill();

        const when = makeLabelLeft(row, 'When', monthLabel(e.month), UI_FONT.small, UI_COLOR.textDim, 130);
        when.node.setPosition(-W / 2 + 28, 0, 0);
        const text = makeLabelLeft(row, 'Text', e.text, UI_FONT.small, UI_COLOR.text, W - 170);
        text.node.setPosition(-W / 2 + 160, 0, 0);
    }

    private jobText(r: Resident): string {
        if (!r.jobTitle) return r.age >= 18 && r.age < 60 ? '待业中' : '不在工作年龄';
        const where = this.buildingName(r.jobId);
        return where ? `${where} · ${r.jobTitle}` : r.jobTitle;
    }

    /** uid → 建筑名（模拟层只存 defId，中文名查 TownModel）；查不到返回 null */
    private buildingName(uid: number | null): string | null {
        if (uid === null) return null;
        const placed = this._model?.allBuildings().find((b) => b.uid === uid);
        return placed ? placed.def.name : null;
    }
}
