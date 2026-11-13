import { _decorator, Graphics, Label, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { TownModel } from '../core/TownModel';
import { LifeEvent, Resident, monthLabel } from '../core/sim/types';
import { Panel } from './Panel';
import { ListRow, ScrollList } from './ScrollList';
import { formatNumber, makeLabel, moodLabel, UI_COLOR, UI_FONT } from './UiTheme';

const { ccclass } = _decorator;

/**
 * 居民档案（T308 的下半段）。
 *
 * 从建筑详情里点名字进来。竖屏一屏放得下，不用滚动：
 * 年龄 / 性别 / 学历 / 住处 / 工作 / 月薪 / 储蓄 / 心情 / 家庭 / 人生记录。
 *
 * 人生记录用 ScrollList，因为 LifeEvent 会越攒越多（支线 A 说只留最近 N 条）。
 */
@ccclass('ResidentPanel')
export class ResidentPanel extends Panel {
    private _sim: SimApi | null = null;
    private _model: TownModel | null = null;

    static show(parent: Node, sim: SimApi, model: TownModel, residentId: number): ResidentPanel | null {
        const r = sim.resident(residentId);
        if (!r) return null;
        const panel = Panel.open(ResidentPanel, parent, r.name, r.gender === 'M' ? '男' : '女');
        panel._sim = sim;
        panel._model = model;
        panel.fill(sim, r);
        return panel;
    }

    private fill(sim: SimApi, r: Resident): void {
        const content = this.content;
        if (!content) return;
        const W = content.getComponent(UITransform)!.width;
        const eduText = ['未上学', '初中', '高中', '大专以上'][r.education] ?? '—';

        let y = 296;
        y = this.kv(content, W, y, '年龄', `${r.age} 岁　${eduText}`);
        y = this.kv(content, W, y, '住处', this.buildingName(r.homeId) ?? '无');
        // 工作分成「在哪」+「什么岗位」。建筑可能已经不在了（拆了、或者数据还没接全），
        // 这种时候只显示岗位名，不要露出 #1001 这种内部 id。
        y = this.kv(content, W, y, '工作', this.jobText(r));
        y = this.kv(content, W, y, '月薪', r.salary > 0 ? `¥${formatNumber(r.salary)}` : '—');
        y = this.kv(content, W, y, '储蓄', `¥${formatNumber(r.savings)}`);

        // 心情单独一行，带评价
        y = this.kv(content, W, y, '心情', `${Math.round(r.mood)} 分（${moodLabel(r.mood)}）`);

        // 家庭
        const family: string[] = [];
        const spouse = r.spouseId !== null ? sim.resident(r.spouseId) : null;
        if (spouse) family.push(`配偶 ${spouse.name}`);
        const kids = r.childIds.map((id) => sim.resident(id)).filter((p): p is Resident => !!p);
        if (kids.length > 0) family.push(`${kids.length} 个孩子`);
        if (r.parentIds.length > 0) {
            const parents = r.parentIds.map((id) => sim.resident(id)).filter((p): p is Resident => !!p);
            if (parents.length > 0) family.push(`父母：${parents.map((p) => p.name).join('、')}`);
        }
        if (family.length > 0) y = this.kv(content, W, y, '家庭', family.join('　'));

        y = this.kv(content, W, y, '来县', monthLabel(r.arrivedMonth) + (r.monthsUnemployed > 0 && !r.jobTitle ? `　失业 ${r.monthsUnemployed} 个月` : ''));

        // 人生记录：占剩下的高度
        y -= 10;
        const head = makeLabel(content, 'LogTitle', '人生记录', UI_FONT.body, UI_COLOR.text, W);
        head.node.setPosition(0, y, 0);
        // 标题行高约 30，再加 24 的间距，列表第一行才不会贴着标题
        y -= 54;

        // content 底边是 -cardH/2 + 60（buildShell 里 content 高 = cardH - 120，居中在 -30）
        const bottom = -this.cardH / 2 + 30;
        const listH = Math.max(90, y - bottom);
        const list = ScrollList.mount(content, 'Log', W, listH);
        list.node.setPosition(0, y - listH / 2, 0);

        if (r.log.length === 0) {
            const empty = makeLabel(content, 'Empty', '还没有记录', UI_FONT.body, UI_COLOR.textDim, W);
            empty.node.setPosition(0, y - 24, 0);
            return;
        }

        // 新的在后：倒过来显示，最近的在最上面（玩家关心"刚发生了什么"）
        const items = r.log.slice().reverse();
        const rows: ListRow[] = items.map((e) => ({
            height: 44,
            build: (row) => this.buildLogRow(row, W, e),
        }));
        list.setRows(rows);
    }


    private buildLogRow(row: Node, W: number, e: LifeEvent): void {
        const when = makeLabel(row, 'When', monthLabel(e.month), UI_FONT.small, UI_COLOR.textDim, 130);
        when.node.setPosition(-W / 2 + 65, 0, 0);

        const text = makeLabel(row, 'Text', e.text, UI_FONT.small, UI_COLOR.text, W - 150);
        text.node.setPosition(15, 0, 0);
        text.horizontalAlign = Label.HorizontalAlign.LEFT;
        text.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    }

    private jobText(r: Resident): string {
        if (!r.jobTitle) return r.age >= 18 && r.age < 60 ? '待业中' : '不在工作年龄';
        const where = this.buildingName(r.jobId);
        return where ? `${where}　${r.jobTitle}` : r.jobTitle;
    }

    /** 「键：值」一行，返回下一行 y */
    private kv(parent: Node, W: number, y: number, key: string, value: string): number {
        const k = makeLabel(parent, 'Key', key, UI_FONT.small, UI_COLOR.textDim, 90);
        k.node.setPosition(-W / 2 + 40, y, 0);
        k.horizontalAlign = Label.HorizontalAlign.LEFT;
        k.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);

        const v = makeLabel(parent, 'Val', value, UI_FONT.body, UI_COLOR.text, W - 110);
        v.node.setPosition(-W / 2 + 100, y, 0);
        v.horizontalAlign = Label.HorizontalAlign.LEFT;
        v.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        return y - 46;
    }

    /** uid → 建筑名。名字要查 TownModel（模拟层只存 defId，不存中文名）；查不到返回 null */
    private buildingName(uid: number | null): string | null {
        if (uid === null) return null;
        const placed = this._model?.allBuildings().find((b) => b.uid === uid);
        return placed ? placed.def.name : null;
    }
}
