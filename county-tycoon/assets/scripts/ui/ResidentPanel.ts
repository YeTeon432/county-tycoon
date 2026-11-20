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
    private _residentId = 0;
    private _findingJob = false;
    onJobChanged: ((message: string) => void) | null = null;
    private _model: TownModel | null = null;
    /** 「追踪」（T425）；心愿卡片的「看范围」也走它（T538：追踪时地图画出心愿范围） */
    private _onTrack: ((id: number, focusHome?: boolean) => void) | null = null;

    /**
     * @param onTrack 「追踪」按钮（T425）：在地图上用箭头标出这个人和他家；不传就不显示按钮
     */
    static show(parent: Node, sim: SimApi, model: TownModel, residentId: number, onTrack?: (id: number, focusHome?: boolean) => void): ResidentPanel | null {
        const r = sim.resident(residentId);
        if (!r) return null;
        const panel = Panel.open(ResidentPanel, parent, r.name, `${r.gender === 'M' ? '男' : '女'} · ${r.age} 岁`);
        panel._sim = sim;
        panel._model = model;
        panel._onTrack = onTrack ?? null;
        panel._residentId = r.id;
        panel.refresh();
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

    refresh(): void {
        const sim = this._sim;
        if (!sim || !this.content) return;
        const r = sim.resident(this._residentId);
        if (!r) { this.close(); return; }
        sim.openGuidance?.(r.id);
        for (const child of this.content.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        this.fill(sim, r);
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

        if (r.wish || r.leaving) {
            const wish = r.wish;
            const job = wish?.kind === 'job';
            const target = wish?.jobTarget;
            const referral = job && this._findingJob ? sim.jobReferral?.(r.id) : null;
            const ranged = wish && ['shop', 'school', 'clinic'].includes(wish.kind) && !!this._onTrack;
            const h = 154 + (r.leaving ? 38 : 0);
            const card = makePanelNode(content, 'Guidance', W, h);
            card.setPosition(0, y - h / 2, 0);
            const bg = card.addComponent(Graphics);
            bg.fillColor = r.leaving ? new Color(253, 236, 234) : new Color(232, 241, 252);
            bg.roundRect(-W / 2, -h / 2, W, h, UI_RADIUS);
            bg.fill();
            const line = (name: string, text: string, top: number, size: number, height: number) => {
                const label = makeLabelLeft(card, name, text, size, UI_COLOR.text, W - 36);
                label.node.getComponent(UITransform)!.setContentSize(W - 36, height);
                label.node.setPosition(-W / 2 + 18, h / 2 - top - height / 2, 0);
                return label;
            };
            line('Request', wish?.text ?? r.leaving?.reasons[0] ?? '我想离开县城', 5, UI_FONT.body, 40).isBold = true;
            let detail = wish?.hint ?? '';
            if (job && !this._findingJob) detail = target
                ? `想做${target.title}，帮我问问有没有空位吧。` : '只要学历合适，有空岗我就愿意去。';
            if (referral) detail = `${referral.employer} · ${referral.title}`;
            line('Detail', detail, 45, UI_FONT.small, ranged || job ? 55 : 85);
            if (ranged || job) {
                const btn = makeButton(card, 'Action', ranged ? '看范围' : !this._findingJob ? '帮他找工作' :
                    referral ? '介绍入职' : '暂无合适空岗', 202, 44, 'primary', () => {
                    if (ranged) { this._onTrack?.(r.id, true); return; }
                    if (referral && sim.introduceJob?.(r.id, referral.uid, referral.title)) {
                        this._findingJob = false;
                        this.onJobChanged?.(`${r.name}已入职${referral.employer}，担任${referral.title}`);
                    } else this._findingJob = true;
                    this.refresh();
                });
                btn.setEnabled(!!ranged || !this._findingJob || !!referral);
                btn.node.setPosition(-W / 2 + 119, h / 2 - 124, 0);
            }
            if (r.leaving) line('Leaving', `挽留还剩 ${sim.leaveMonthsLeft?.(r) ?? 0} 个月`, 150, UI_FONT.small, 36);
            y -= h + 16;
        }
        // ── 信息卡 ──
        const eduText = ['未上学', '初中', '高中', '大专以上'][r.education] ?? '—';
        const lines: [string, string][] = [
            ['学历', eduText],
            ['住处', [this.buildingName(r.homeId) ?? '无', r.homeId !== null && sim.housingHint?.(r.homeId)].filter(Boolean).join(' · ')],
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

        const listH = y + this.contentH / 2;
        const list = ScrollList.mount(content, 'Details', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);
        const rows: ListRow[] = lines.map(([key, value]) => ({ height: 50, build: (row) => {
            const label = makeLabelLeft(row, 'Key', key, UI_FONT.small, UI_COLOR.textDim, 80);
            label.node.setPosition(-W / 2 + 16, 0, 0);
            const val = makeLabelLeft(row, 'Value', value, UI_FONT.body, UI_COLOR.text, W - 126);
            val.node.setPosition(-W / 2 + 106, 0, 0);
        } }));
        const parts = (r.moodParts ?? []).slice().sort((a, b) => a.value - b.value);
        if (parts.length) {
            rows.push({ height: 62, build: (row) => makeSectionTitle(row, W, 0, '幸福度明细', UI_PALETTE.green) });
            for (const part of parts) rows.push({ height: 44, build: (row) => {
                const l = makeLabelLeft(row, 'Part', `${part.label}　${part.value > 0 ? '+' : ''}${part.value}`,
                    UI_FONT.small, part.value < 0 ? UI_COLOR.down : UI_COLOR.up, W - 32);
                l.node.setPosition(-W / 2 + 16, 0, 0);
            } });
        }
        rows.push({ height: 62, build: (row) => makeSectionTitle(row, W, 0, '人生记录', UI_PALETTE.green) });
        if (!r.log.length) rows.push({ height: 50, build: (row) => makeLabel(row, 'Empty', '还没有记录', UI_FONT.small, UI_COLOR.textDim, W) });
        for (const e of r.log.slice().reverse()) rows.push({ height: 52, build: (row) => this.buildLogRow(row, W, e) });
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
