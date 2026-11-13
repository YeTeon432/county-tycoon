import {
    _decorator, Component, Node, UITransform, Layers,
} from 'cc';
import { BuildingDef, loadBuildingConfig } from '../core/BuildingConfig';
import { TownModel } from '../core/TownModel';
import { WorldConfig, loadWorldConfig } from '../core/WorldConfig';
import { BuildingBar } from '../ui/BuildingBar';
import { ZoomButtons } from '../ui/ZoomButtons';
import { UiRoot } from '../ui/UiRoot';
import { SimApi } from '../core/sim/SimApi';
import { createSimulation, loadSimJson } from '../core/SimLoader';
import { WorldView } from '../world/WorldView';

const { ccclass } = _decorator;

/**
 * 游戏根节点：场景里唯一需要手动挂的脚本。
 *
 * 职责是"接线"：读配置 → 建数据 → 建画面 → 把各模块的回调串起来。
 * 具体的地图绘制、输入、UI 都在各自的模块里，这里不写业务逻辑。
 *
 * 场景文件里只放 Canvas + 一台相机 + 一个空节点挂这个脚本，
 * 其余节点全部代码生成。好处是改布局不用改 .scene（引用式 JSON 很容易冲突），
 * 也方便以后直接换设计分辨率。
 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    private _config: WorldConfig | null = null;
    private _model: TownModel | null = null;
    private _view: WorldView | null = null;
    private _bar: BuildingBar | null = null;
    /** 模拟层。支线 A 做好 Simulation 后把 MockSim 换掉（只改这一处） */
    private _sim: SimApi | null = null;
    private _ui: UiRoot | null = null;

    protected start(): void {
        // 两份配置并行读，都读到了再搭画面，避免先画出半成品
        Promise.all([loadWorldConfig(), loadBuildingConfig(), loadSimJson()])
            .then(([world, buildings, [economy, names]]) => {
                this._config = world;
                this.build(world, buildings, economy, names);
            })
            .catch((err) => {
                console.error('[GameRoot] 启动失败', err);
            });
    }

    private build(world: WorldConfig, buildings: BuildingDef[], economy: any, names: any): void {
        const model = new TownModel(world.gridWidth, world.gridHeight);
        this._model = model;

        // 开局地块：一条土路 + 两栋自建房（PRD 第 2 节）。要在建模拟之前放，模拟层会把它们登记成开局的家
        this.placeOpening(model, buildings);
        const sim = createSimulation(model, economy, names, Date.now() % 100000000);
        this._sim = sim;

        this.buildWorld(world, model);
        this.buildBar(buildings);
        // 经营界面（支线 B）放最后，压在所有东西上面
        this._ui = UiRoot.create(this.node, this._sim, model);
        // 空手点建筑 → 界面开详情；详情里的「换朝向」按钮 → WorldView（UiRoot 加上 requestToggleFacing 字段后生效）
        const view = this._view, ui = this._ui;
        if (view) {
            view.onBuildingTapped = (uid) => ui.onBuildingTapped(uid);
            (ui as unknown as { requestToggleFacing?: (uid: number) => boolean }).requestToggleFacing =
                (uid) => view.toggleFacingByUid(uid);
        }
    }

    private placeOpening(model: TownModel, defs: BuildingDef[]): void {
        const def = (id: string) => defs.find((d) => d.id === id);
        const road = def('dirt-road'), house = def('house');
        if (!road || !house) return;
        const cx = Math.floor(model.width / 2), cy = Math.floor(model.height / 2);
        for (let c = cx - 4; c <= cx + 4; c++) model.place(road, c, cy);
        model.place(house, cx - 1, cy - 1);
        model.place(house, cx + 1, cy - 1);
    }

    /** 搭地图，挂到本节点下 */
    private buildWorld(config: WorldConfig, model: TownModel): void {
        // 地图容器：只作为变换的父节点，尺寸不参与任何计算
        const worldRoot = new Node('WorldRoot');
        worldRoot.layer = Layers.Enum.UI_2D;
        worldRoot.addComponent(UITransform);
        this.node.addChild(worldRoot);

        const worldView = worldRoot.addComponent(WorldView);
        this._view = worldView;
        worldView.create(config, model);

        // 放置/拆除之后刷新 HUD 上的计数
        // 接模拟层：盖楼扣钱、拆楼清人
        worldView.onBuilt = (b) => (this._sim ? this._sim.onBuilt(b.uid, b.def.id) : true);
        worldView.onDemolished = (uid) => { if (this._sim) this._sim.onDemolished(uid); };
        worldView.onPlaceRejected = (d, why) => console.log(`[GameRoot] ${d.name} 没盖成：${why}`);
    }

    /** 底部建筑选择栏 */
    private buildBar(defs: BuildingDef[]): void {
        const barRoot = new Node('BuildingBar');
        barRoot.layer = Layers.Enum.UI_2D;
        this.node.addChild(barRoot);

        const bar = barRoot.addComponent(BuildingBar);
        this._bar = bar;
        bar.build(defs);

        bar.onSelect = (def) => {
            if (this._view) this._view.selectBuilding(def);
        };
        bar.onDemolishToggle = (on) => {
            if (this._view) this._view.setDemolishMode(on);
        };

        // 右侧缩放按钮
        const zoomNode = new Node('ZoomButtons');
        zoomNode.layer = Layers.Enum.UI_2D;
        this.node.addChild(zoomNode);
        const zoomBtns = zoomNode.addComponent(ZoomButtons);
        zoomBtns.build(BuildingBar.BAR_HEIGHT);
        zoomBtns.onStep = (d) => { if (this._view) this._view.zoomStep(d); };
        const refreshZoom = () => {
            const v = this._view;
            if (v) zoomBtns.refresh(v.zoom, v.zoomIndex, v.zoomLevels.length);
        };
        refreshZoom();

        if (this._view) {
            this._view.onZoomChanged = () => refreshZoom();
        }
    }

}
