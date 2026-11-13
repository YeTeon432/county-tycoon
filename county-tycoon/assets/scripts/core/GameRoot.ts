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
import { loadTerrain } from '../core/TerrainConfig';
import { Terrain } from '../core/Terrain';
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
            .then(([world, buildings, sim]) =>
                loadTerrain(world.gridWidth, world.gridHeight).then((terrain) => ({ world, buildings, sim, terrain })))
            .then(({ world, buildings, sim: [economy, names], terrain }) => {
                this._config = world;
                this.build(world, buildings, economy, names, terrain);
            })
            .catch((err) => {
                console.error('[GameRoot] 启动失败', err);
            });
    }

    private build(world: WorldConfig, buildings: BuildingDef[], economy: any, names: any, terrain: Terrain): void {
        if (terrain.width !== world.gridWidth || terrain.height !== world.gridHeight) {
            console.warn(`[GameRoot] map.json 是 ${terrain.width}×${terrain.height}，world.json 是 ${world.gridWidth}×${world.gridHeight}，以 map.json 为准`);
        }
        const model = new TownModel(terrain.width, terrain.height);
        model.setTerrain(terrain);
        this._model = model;

        // 开局地块：一条土路 + 两栋自建房（PRD 第 2 节）。要在建模拟之前放，模拟层会把它们登记成开局的家
        this.placeOpening(model, buildings);
        const sim = createSimulation(model, economy, names, Date.now() % 100000000);
        this._sim = sim;

        this.buildWorld(world, model);
        if (this._view && model.terrain) this._view.focusCell(model.terrain.spawn.col + 4, model.terrain.spawn.row);
        this.buildBar(buildings);
        // 经营界面（支线 B）放最后，压在所有东西上面
        this._ui = UiRoot.create(this.node, this._sim, model);
        // 空手点建筑 → 界面开详情；详情里的「换朝向」按钮 → WorldView
        const view = this._view, ui = this._ui;
        if (view) {
            view.onBuildingTapped = (uid) => ui.onBuildingTapped(uid);
            ui.requestToggleFacing = (uid) => view.toggleFacingByUid(uid);
            // 放置 / 拆除的提示文字，原来在旧 HUD 里，现在归顶栏第二行
            view.onCellTapped = () => this.updatePlacementHint();
            view.onTownChanged = () => this.updatePlacementHint();
        }
        this.updatePlacementHint();
    }

    /**
     * 顶栏第二行的提示：当前是拆除模式 / 正在放哪栋楼 / 空手。
     * 空手时给一句能看懂的下一步提示，而不是空白。
     */
    private updatePlacementHint(): void {
        const ui = this._ui, view = this._view;
        if (!ui || !view) return;
        if (view.demolishing) {
            ui.setPlacementHint('拆除模式：点建筑移除');
        } else if (view.selectedBuilding) {
            ui.setPlacementHint(`放置：${view.selectedBuilding.name}`);
        } else {
            ui.setPlacementHint('点建筑看详情；底部选建筑后可放置');
        }
    }

    private placeOpening(model: TownModel, defs: BuildingDef[]): void {
        const def = (id: string) => defs.find((d) => d.id === id);
        const road = def('dirt-road'), house = def('house');
        if (!road || !house) return;
        // 开局放在地图的出生点（map.json 的 spawn），不是地图中心——64×64 的中心在河边
        const sp = model.terrain ? model.terrain.spawn : { col: Math.floor(model.width / 2), row: Math.floor(model.height / 2) };
        const cx = sp.col + 4, cy = sp.row;
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
            this.updatePlacementHint();
        };
        bar.onDemolishToggle = (on) => {
            if (this._view) this._view.setDemolishMode(on);
            this.updatePlacementHint();
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
