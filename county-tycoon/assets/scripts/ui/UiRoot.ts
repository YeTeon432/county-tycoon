import { _decorator, Component, JsonAsset, Layers, Node, resources, UITransform } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { MonthlyReport } from '../core/sim/types';
import { TownModel } from '../core/TownModel';
import { BuildingPanel } from './BuildingPanel';
import { ResidentPanel } from './ResidentPanel';
import { TimeController } from './TimeController';
import { TopBar } from './TopBar';

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
 *
 * 节点顺序（= 绘制顺序，后加的压在上面）：顶栏 → 弹窗层。
 * 弹窗层本身不登记 InputGuard：挡住地图的应该是具体面板，空一层不应该吃点击。
 */
@ccclass('UiRoot')
export class UiRoot extends Component {
    protected sim: SimApi | null = null;
    protected model: TownModel | null = null;

    private _topBar: TopBar | null = null;
    private _clock: TimeController | null = null;
    /** 弹窗层：建筑详情、居民总览、月账单都放这里 */
    private _panelLayer: Node | null = null;
    /** 当前打开的建筑详情 */
    private _topPanel: BuildingPanel | null = null;
    /** 叠在建筑详情上面的居民档案 */
    private _residentPanel: ResidentPanel | null = null;

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
        if (!this.sim) return;

        this.buildTopBar();
        this.buildClock();
        this.buildPanelLayer();

        // economy.json 是支线 A 的，还没交付。读不到就用 20 秒的默认值，不影响开发。
        this.loadEconomyTiming();
    }

    private buildTopBar(): void {
        if (!this.sim) return;
        const node = new Node('TopBar');
        node.layer = Layers.Enum.UI_2D;
        this.node.addChild(node);
        const bar = node.addComponent(TopBar);
        bar.build(this.sim);
        bar.onSpeedChange = (speed) => {
            if (this._clock) this._clock.setSpeed(speed);
        };
        this._topBar = bar;
    }

    private buildClock(): void {
        if (!this.sim) return;
        const node = new Node('TimeController');
        node.layer = Layers.Enum.UI_2D;
        this.node.addChild(node);
        const clock = node.addComponent(TimeController);
        clock.startClock(this.sim);
        clock.onMonthStepped = (report) => this.onMonthStepped(report);
        this._clock = clock;

        if (this._topBar) this._topBar.setSpeed(clock.speed);
    }

    private buildPanelLayer(): void {
        const layer = new Node('PanelLayer');
        layer.layer = Layers.Enum.UI_2D;
        layer.addComponent(UITransform);
        this.node.addChild(layer);
        this._panelLayer = layer;
    }

    /** 一个月结算完：刷新顶栏；T310 的月账单也从这里接 */
    private onMonthStepped(_report: MonthlyReport): void {
        if (this._topBar) this._topBar.refresh();
    }

    private loadEconomyTiming(): void {
        resources.load('config/economy', JsonAsset, (err, asset) => {
            // 读不到是正常情况（支线 A 还没交），用默认值，不打警告
            if (err || !asset || !asset.json) return;
            const json = asset.json as { secondsPerMonth?: number };
            if (this._clock && typeof json.secondsPerMonth === 'number') {
                this._clock.setSecondsPerMonth(json.secondsPerMonth);
            }
        });
    }

    /** 玩家在空手状态点了一栋建筑 → 打开建筑详情 */
    onBuildingTapped(uid: number): void {
        if (!this.sim || !this.model) return;
        const layer = this._panelLayer;
        if (!layer) return;

        // 同一时间只留一个面板：先关掉旧的（居民档案叠在建筑详情上面时另说，见 openResident）
        this.closeTopPanel();
        const panel = BuildingPanel.show(layer, this.sim, this.model, uid, (residentId) => {
            this.openResident(residentId);
        });
        if (panel) this._topPanel = panel;
    }

    /** 从建筑详情点名字 → 居民档案，叠在建筑详情上面 */
    private openResident(residentId: number): void {
        const layer = this._panelLayer;
        if (!this.sim || !this.model || !layer) return;
        // 详情面板保持打开，档案压在上面；档案关掉后详情还在，符合"点了人再返回"的操作习惯
        const panel = ResidentPanel.show(layer, this.sim, this.model, residentId);
        if (panel) {
            panel.onClosed = () => {
                if (this._residentPanel === panel) this._residentPanel = null;
            };
            this._residentPanel = panel;
        }
    }

    private closeTopPanel(): void {
        if (this._residentPanel && this._residentPanel.node?.isValid) {
            this._residentPanel.node.destroy();
        }
        this._residentPanel = null;
        if (this._topPanel && this._topPanel.node?.isValid) {
            this._topPanel.node.destroy();
        }
        this._topPanel = null;
    }

    /** 给以后的面板用：挂到弹窗层上 */
    protected get panelLayer(): Node | null {
        return this._panelLayer;
    }
}
