import {
    _decorator, Component, Node, Label, UITransform, Layers, Color, Graphics, view,
} from 'cc';
import { BuildingDef, loadBuildingConfig } from '../core/BuildingConfig';
import { TownModel } from '../core/TownModel';
import { WorldConfig, loadWorldConfig } from '../core/WorldConfig';
import { BuildingBar } from '../ui/BuildingBar';
import { ZoomButtons } from '../ui/ZoomButtons';
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
    private _zoomLabel: Label | null = null;

    protected start(): void {
        // 两份配置并行读，都读到了再搭画面，避免先画出半成品
        Promise.all([loadWorldConfig(), loadBuildingConfig()])
            .then(([world, buildings]) => {
                this._config = world;
                this.build(world, buildings);
            })
            .catch((err) => {
                console.error('[GameRoot] 启动失败', err);
            });
    }

    private build(world: WorldConfig, buildings: BuildingDef[]): void {
        const model = new TownModel(world.gridWidth, world.gridHeight);
        this._model = model;

        this.buildWorld(world, model);
        this.buildHud();
        this.buildBar(buildings);
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
        worldView.onTownChanged = () => this.updateZoomLabel(worldView.zoom);
    }

    /** 顶部 HUD：标题、倍率、建筑数 */
    private buildHud(): void {
        const visible = view.getVisibleSize();
        const barHeight = 120;

        const bar = new Node('Hud');
        bar.layer = Layers.Enum.UI_2D;
        const barTrans = bar.addComponent(UITransform);
        barTrans.setContentSize(visible.width, barHeight);
        bar.setPosition(0, visible.height / 2 - barHeight / 2, 0);
        this.node.addChild(bar);

        // 半透明底，便于在浅色地面上看清文字
        const bg = bar.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 150);
        bg.rect(-visible.width / 2, -barHeight / 2, visible.width, barHeight);
        bg.fill();

        // 两行：第一行是标题+倍率，第二行是操作提示。
        // 竖屏只有 720 宽，单行塞不下，字号也得给手机留余地。
        const labelNode = new Node('ZoomLabel');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.fontSize = 30;
        label.lineHeight = 38;
        label.color = new Color().fromHEX('#f4f4f4');
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        labelNode.setPosition(0, 0, 0);
        bar.addChild(labelNode);

        this._zoomLabel = label;
        this.updateZoomLabel(this._view ? this._view.zoom : 1);
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
            this.updateZoomLabel(this._view ? this._view.zoom : 1);
        };
        bar.onDemolishToggle = (on) => {
            if (this._view) this._view.setDemolishMode(on);
            this.updateZoomLabel(this._view ? this._view.zoom : 1);
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
            this._view.onZoomChanged = (zoom) => { this.updateZoomLabel(zoom); refreshZoom(); };
            this._view.onCellTapped = () => this.updateZoomLabel(this._view ? this._view.zoom : 1);
        }
    }

    private updateZoomLabel(zoom: number): void {
        if (!this._zoomLabel) return;

        const count = this._model ? this._model.buildingCount : 0;
        const mode = this._view?.demolishing
            ? '拆除模式：点建筑移除'
            : (this._view?.selectedBuilding
                ? `放置：${this._view.selectedBuilding.name}`
                : '选建筑点地块放置；点已有建筑换朝向');

        this._zoomLabel.string =
            `《我在县城当首富》  ×${zoom.toFixed(1)}  建筑 ${count}\n${mode}`;
    }
}
