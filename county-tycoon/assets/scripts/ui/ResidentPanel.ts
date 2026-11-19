import { _decorator, Color, Graphics, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { TownModel } from '../core/TownModel';
import { LifeEvent, Resident, monthLabel } from '../core/sim/types';
import { Panel } from './Panel';
import { Portrait } from './Portrait';
import { BODY_NAME, bodyOf } from '../core/Appearance';
import { ListRow, ScrollList } from './ScrollList';
import {
    formatMoney, makeButton, makeLabel, makeLabelLeft, makePanelNode, makeSectionTitle, makeStatTile, moodColor, moodLabel,
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
    /** 「追踪」（T425）；心愿卡片的「看范围」也走它（T538：追踪时地图画出心愿范围） */
    private _onTrack: ((id: number) => void) | null = null;

    /**
     * @param onTrack 「追踪」按钮（T425）：在地图上用箭头标出这个人和他家；不传就不显示按钮
     */
    static show(parent: Node, sim: SimApi, model: TownModel, residentId: number, onTrack?: (id: number) => void): ResidentPanel | null {
        const r = sim.resident(residentId);
        if (!r) return null;
        const panel = Panel.open(ResidentPanel, parent, r.name, `${r.gender === 'M' ? '男' : '女'} · ${r.age} 岁`);
        panel._sim = sim;
        panel._model = model;
        panel._onTrack = onTrack ?? null;
        panel.fill(sim, r);
        if (onTrack) panel.buildTrackButton(() => onTrack(r.id));
        return panel;
    }

    /** 标题行、关闭按钮左边（和建筑详情的「换朝向」同一个位置） */
    private buildTrackButton(onTap: () => void): void {
        const head = this.card ? this.card.getChildByName('Header') : null;
        if (!head) return;
        const W = 148, H = 52;
        const btn = makeButton(head, 'TrackBtn', '追踪', W, H, 'primary', onTap, 'arrow-down');
        btn.node.setPosition(this.cardW / 2 - Panel.PAD_X - 56 - 14 - W / 2 + 8, Panel.HEAD_H / 2 - 60, 0);
    }

    private fill(sim: SimApi, r: Resident): void {
        const content = this.content;
        if (!content) return;
        const W = this.contentW;
        let y = this.contentTop;

        // ── 头像（D023）：同一套外观的胸像，和街上的小人是同一个人 ──
        const male = r.gender === 'M';
        const faceSize = 128;
        if (Portrait.place(content, r, -W / 2 + faceSize / 2, y - faceSize / 2, faceSize, male ? UI_COLOR.avatarM : UI_COLOR.avatarF)) {
            const tx = -W / 2 + faceSize + 24;
            const who = makeLabelLeft(content, 'Who', `${BODY_NAME[bodyOf(r)]} · ${r.age} 岁`, UI_FONT.body, UI_COLOR.text, W - faceSize - 24);
            who.isBold = true;
            who.node.setPosition(tx, y - 40, 0);
            const v = ({ walk: '步行', ebike: '骑电动车', moto: '骑摩托车', car: '开汽车' } as Record<string, string>)[r.vehicle ?? 'walk'] ?? '步行';
            const sub = makeLabelLeft(content, 'Sub', `${r.jobTitle || (r.age < 18 ? '上学 / 在家' : r.age >= 60 ? '退休' : r.idle ? '赋闲' : '待业')} · ${v}`, UI_FONT.small, UI_COLOR.textDim, W - faceSize - 24);
            sub.node.setPosition(tx, y - 80, 0);
            y -= faceSize + 20;
        }

        // ── 数值格 ──
        const tileH = 108, gap = 16;
        const tileW = (W - gap * 2) / 3;
        const tiles: [string, string, Color][] = [
            ['月薪', r.salary > 0 ? formatMoney(r.salary) : '—', r.salary > 0 ? UI_COLOR.gold : UI_COLOR.textDim],
            ['储蓄', formatMoney(r.savings), r.savings >= 0 ? UI_PALETTE.blue : UI_COLOR.down],
            ['幸福度', `${Math.round(r.mood)} ${moodLabel(r.mood)}`, moodColor(r.mood)],
        ];
        for (let i = 0; i < tiles.length; i++) {
            const t = makeStatTile(content, tileW, tileH, tiles[i][0], tiles[i][1], tiles[i][2]);
            t.node.setPosition(-W / 2 + tileW / 2 + i * (tileW + gap), y - tileH / 2, 0);
        }
        y -= tileH + 20;

        // ── 想走（D026）：红条 + 吐槽，告诉玩家还有几天、该补什么 ──
        if (r.leaving) {
            const left = Math.max(0, 3 - (sim.state.month - r.leaving.since));
            const why = r.leaving.reasons.length ? r.leaving.reasons.join('、') : '日子过得不顺心';
            const wh = 76;
            const warn = makePanelNode(content, 'Leaving', W, wh);
            warn.setPosition(0, y - wh / 2, 0);
            const wg = warn.addComponent(Graphics);
            wg.fillColor = new Color(253, 236, 234, 255);
            wg.roundRect(-W / 2, -wh / 2, W, wh, UI_RADIUS);
            wg.fill();
            const t1 = makeLabelLeft(warn, 'T1', `想离开县城（还有 ${left} 天）`, UI_FONT.body, UI_COLOR.down, W - 40);
            t1.isBold = true;
            t1.node.setPosition(-W / 2 + 20, 14, 0);
            const t2 = makeLabelLeft(warn, 'T2', `吐槽：${why}。幸福度回到 35 以上就会留下`, UI_FONT.small, UI_COLOR.text, W - 40);
            t2.node.setPosition(-W / 2 + 20, -18, 0);
            y -= wh + 16;
        }

        // ── 心愿（D026）：蓝条 + 建议，告诉玩家该盖什么、盖在哪 ──
        if (r.wish) {
            const left = Math.max(0, r.wish.until - sim.state.month);
            const wh = 96;
            const card = makePanelNode(content, 'Wish', W, wh);
            card.setPosition(0, y - wh / 2, 0);
            const cg = card.addComponent(Graphics);
            cg.fillColor = new Color(232, 241, 252, 255);
            cg.roundRect(-W / 2, -wh / 2, W, wh, UI_RADIUS);
            cg.fill();
            // 要「在他家 N 格内」盖的心愿：右上角「看范围」→ 追踪他，地图上画出范围（T538）
            const k = r.wish.kind;
            const onTrack = this._onTrack;
            const ranged = !!onTrack && r.homeId !== null && r.wish.radius > 0 && (k === 'shop' || k === 'school' || k === 'clinic');
            const BW = 150;
            if (ranged) {
                const id = r.id;
                const btn = makeButton(card, 'RangeBtn', '看范围', BW, 48, 'primary', () => onTrack!(id));
                btn.node.setPosition(W / 2 - 16 - BW / 2, 20, 0);
            }
            const t1 = makeLabelLeft(card, 'T1', `心愿：${r.wish.text}（还有 ${left} 天）`, UI_FONT.body, UI_PALETTE.blue, W - 40 - (ranged ? BW + 16 : 0));
            t1.isBold = true;
            t1.node.setPosition(-W / 2 + 20, 20, 0);
            const t2 = makeLabelLeft(card, 'T2', `建议：${r.wish.hint}。实现了幸福度 +15`, UI_FONT.small, UI_COLOR.text, W - 40);
            t2.node.setPosition(-W / 2 + 20, -20, 0);
            y -= wh + 16;
        }

        // ── 幸福度分项（D026）：为什么开心 / 不开心 ──
        const parts = (r.moodParts ?? []).slice().sort((a, b) => a.value - b.value);
        if (parts.length) {
            const chip = (p: { label: string; value: number }) => `${p.label} ${p.value > 0 ? '+' : ''}${Math.round(p.value)}`;
            const bad = parts.filter((p) => p.value < 0).map(chip).join('　');
            const good = parts.filter((p) => p.value > 0).reverse().map(chip).join('　');
            if (bad) {
                const l = makeLabelLeft(content, 'Bad', `不开心：${bad}`, UI_FONT.small, UI_COLOR.down, W);
                l.node.setPosition(-W / 2, y - 14, 0);
                y -= 34;
            }
            if (good) {
                const l = makeLabelLeft(content, 'Good', `开心：${good}`, UI_FONT.small, UI_COLOR.up, W);
                l.node.setPosition(-W / 2, y - 14, 0);
                y -= 34;
            }
            y -= 8;
        }

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
        if (!r.jobTitle) return r.idle ? '赋闲（存款够，不急着找工作）' : r.age >= 18 && r.age < 60 ? '待业中' : '不在工作年龄';
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
