import { _decorator, Component, Layers, Node, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { TownModel } from '../core/TownModel';

const { ccclass } = _decorator;

/**
 * 经营界面的总入口（支线 B 负责，见 docs/PARALLEL.md）。
 * GameRoot 只调一次 UiRoot.create(...)，之后顶栏、建筑详情、居民总览、月账单都在这里面搭，
 * 支线 B 不需要再改 GameRoot。
 *
 * 拿到的东西：
 *   - sim：模拟层接口（现在是 MockSim，支线 A 做好后换成真的）
 *   - model：地块数据（哪栋楼在哪、uid）
 *   - 点建筑的事件：GameRoot 会调 onBuildingTapped(uid)
 */
@ccclass('UiRoot')
export class UiRoot extends Component {
    protected sim: SimApi | null = null;
    protected model: TownModel | null = null;

    static create(parent: Node, sim: SimApi, model: TownModel): UiRoot {
        const node = new Node('UiRoot');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        const ui = node.addComponent(UiRoot);
        ui.sim = sim;
        ui.model = model;
        ui.build();
        return ui;
    }

    /** 支线 B 从这里开始搭界面 */
    protected build(): void {
        // TODO(支线 B)：顶栏、时间推进、建筑详情、居民总览、月账单
    }

    /** 玩家在空手状态点了一栋建筑（换朝向之外，也用来打开详情） */
    onBuildingTapped(_uid: number): void {
        // TODO(支线 B)：打开建筑详情面板
    }
}
