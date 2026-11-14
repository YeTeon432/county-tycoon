import { _decorator, Component, JsonAsset, Layers, Node, profiler, resources, UITransform } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { SimApi } from '../core/sim/SimApi';
import { MonthlyReport } from '../core/sim/types';
import { TownModel } from '../core/TownModel';
import { BuildingBar } from './BuildingBar';
import { BuildingPanel } from './BuildingPanel';
import { IntroCards } from './IntroCards';
import { MonthReportPanel } from './MonthReportPanel';
import { ResidentListPanel } from './ResidentListPanel';
import { ResidentPanel } from './ResidentPanel';
import { TimeController } from './TimeController';
import { Speed, TopBar } from './TopBar';

const { ccclass } = _decorator;

/** UiRoot.create 的可选参数 */
export interface UiRootOptions {
    /**
     * 新档 = true：播开场卡片、资金从 0 滚上来、「店铺」页签上出提示箭头（T407）。
     * 读档 = false：直接进游戏。缺省 true（现在 GameRoot 还没接读档，每次启动都是新档）。
     */
    newGame?: boolean;
}

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

    /**
     * 换朝向：由 GameRoot 接上（接到 WorldView.toggleFacingByUid）。
     * 返回 false = 这栋楼没有两个朝向（行道树、广场只有一张图）。
     */
    requestToggleFacing: ((uid: number) => boolean) | null = null;
    /** 当前的放置/拆除提示（GameRoot 和建筑栏会调 setPlacementHint） */
    private _hint = '';

    private _topBar: TopBar | null = null;
    private _clock: TimeController | null = null;
    /** 弹窗层：建筑详情、居民总览、月账单都放这里 */
    private _panelLayer: Node | null = null;
    /** 当前打开的建筑详情 */
    private _topPanel: BuildingPanel | null = null;
    /** 叠在建筑详情上面的居民档案 */
    private _residentPanel: ResidentPanel | null = null;
    /** 居民总览 */
    private _listPanel: ResidentListPanel | null = null;
    /** 月度账单 */
    private _reportPanel: MonthReportPanel | null = null;
    /** 上月账单（「账单」按钮重新打开用） */
    private _lastReport: MonthlyReport | null = null;

    /** 建造栏（GameRoot 建的；attachBuildingBar 或自动找到） */
    private _bar: BuildingBar | null = null;
    /** 开场卡片层：压在所有面板上面 */
    private _introLayer: Node | null = null;
    private _newGame = true;
    /** 开局提示箭头还在：等第一次盖楼（非道路）后收起 */
    private _waitFirstBuild = false;
    private _baseBuildings = 0;
    private _tick = 0;

    static create(parent: Node, sim: SimApi, model: TownModel, opts: UiRootOptions = {}): UiRoot {
        const node = new Node('UiRoot');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        const ui = node.addComponent(UiRoot);
        ui.sim = sim;
        ui.model = model;
        ui._newGame = opts.newGame !== false;
        ui.build();
        return ui;
    }

    /** 支线 B 从这里开始搭界面 */
    protected build(): void {
        if (!this.sim) return;

        // 预览左下角的帧率统计默认关掉（DESIGN 8.2）；调试时用 setStatsVisible(true) 打开
        UiRoot.setStatsVisible(false);

        this.buildTopBar();
        this.buildClock();
        this.buildPanelLayer();
        this.buildIntroLayer();

        // 建造栏是 GameRoot 建的，在 UiRoot 之前：直接找到它，接上模拟层和贴图
        this.findSiblings();

        // economy.json：一个月几秒 + 开局资金
        this.loadEconomy();
    }

    /** 帧率统计开关（DESIGN 8.2：默认关，调试能开） */
    static setStatsVisible(on: boolean): void {
        if (on) profiler.showStats(); else profiler.hideStats();
    }

    /**
     * 把建造栏交给界面管（集成可以显式调；不调的话 build 时按节点名 'BuildingBar' 自动找）。
     * 接上之后：卡片的买不起 / 未解锁状态、开局提示箭头、点锁住卡片的提示都由这里驱动。
     */
    attachBuildingBar(bar: BuildingBar): void {
        this._bar = bar;
        if (this.sim) bar.bindSim(this.sim);
        bar.onNotice = (text) => this.setPlacementHint(text);
    }

    /** 给建造栏缩略图用的贴图仓库（WorldView 那一份）。集成在 WorldView 加 `get art()` 后调这个最干净 */
    setArt(art: ArtLibrary): void {
        if (this._bar) this._bar.setArt(art);
    }

    /**
     * 同级节点里找建造栏和 WorldView（GameRoot 把它们都挂在同一个父节点下）。
     * WorldView 的贴图仓库现在是私有字段 _art：先认公开的 art，没有再退到 _art。
     * 这是在集成加 getter 之前的过渡，见 devlog「需要集成」。
     */
    private findSiblings(): void {
        const parent = this.node.parent;
        if (!parent) return;
        if (!this._bar) {
            const bar = parent.getChildByName('BuildingBar')?.getComponent(BuildingBar);
            if (bar) this.attachBuildingBar(bar);
        }
        if (this._bar && !this._bar.hasArt) {
            const view = parent.getChildByName('WorldRoot')?.getComponent('WorldView') as unknown as
                { art?: ArtLibrary; _art?: ArtLibrary } | null;
            const art = view ? (view.art ?? view._art) : null;
            if (art instanceof ArtLibrary) this._bar.setArt(art);
        }
    }

    private buildIntroLayer(): void {
        const layer = new Node('IntroLayer');
        layer.layer = Layers.Enum.UI_2D;
        layer.addComponent(UITransform);
        this.node.addChild(layer);
        this._introLayer = layer;
    }

    // ───────────────────────── 开局（T407） ─────────────────────────

    /** 新档：暂停时间 → 开场卡片 → 资金滚上来 + 「店铺」页签上的箭头 */
    private playOpening(startFunds: number): void {
        const layer = this._introLayer;
        if (!layer || !this.sim) return;
        const clock = this._clock;
        const resume: Speed = clock ? clock.speed : 1;
        this.applySpeed(0);
        if (this._topBar) this._topBar.holdFunds(0);   // 卡片期间顶栏显示 ¥0

        const intro = IntroCards.show(layer, startFunds);
        intro.onDone = () => {
            this.applySpeed(resume === 0 ? 1 : resume);
            if (this._topBar) this._topBar.rollFunds(0, 1);
            this.startFirstBuildHint();
        };
    }

    private applySpeed(speed: Speed): void {
        if (this._clock) this._clock.setSpeed(speed);
        if (this._topBar) this._topBar.setSpeed(speed);
    }

    private startFirstBuildHint(): void {
        if (!this.model) return;
        if (this._bar) this._bar.showTabHint('店铺');
        this._baseBuildings = this.countBuildings();
        this._waitFirstBuild = true;
    }

    /** 不算道路：开局提示是「盖几家店」，修路不算 */
    private countBuildings(): number {
        return this.model ? this.model.allBuildings().filter((b) => !b.def.flat).length : 0;
    }

    /**
     * 盖好一栋楼（集成可以在 WorldView.onBuilt 成功后调；不调也行，update 里会数楼）。
     * 第一次盖非道路的楼 → 收起开局箭头。
     */
    notifyBuilt(): void {
        if (this._topBar) this._topBar.refresh();
        if (!this._waitFirstBuild) return;
        if (this.countBuildings() > this._baseBuildings) {
            this._waitFirstBuild = false;
            if (this._bar) this._bar.showTabHint(null);
        }
    }

    protected update(dt: number): void {
        // 资金在盖楼 / 拆楼时也会变，顶栏不能只在月底刷新：每 0.5 秒对一次（只是改几段文字）
        this._tick += dt;
        if (this._tick < 0.5) return;
        this._tick = 0;
        if (this._topBar) this._topBar.refresh();
        if (this._waitFirstBuild) this.notifyBuilt();
        if (this._bar && !this._bar.hasArt) this.findSiblings();
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
        bar.onReportTap = () => this.openReport();
        bar.onPopulationTap = () => this.openResidentList();
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

    /**
     * 一个月结算完：刷新顶栏，并把账单按钮点亮。
     *
     * 不做"每月自动弹窗"：一个月 20 秒，弹窗会一直打断玩家。
     * 账单放在顶栏的按钮上，亮起小圆点提醒，玩家想看再看。
     * （真机流程要的话，以后可以在"年末"或"大事发生"时才强弹。）
     */
    private onMonthStepped(report: MonthlyReport): void {
        this._lastReport = report;
        if (this._topBar) {
            this._topBar.refresh();
            this._topBar.setReportFresh(true);
        }
    }

    /** 打开上月账单；还没有结算过就什么都不做 */
    private openReport(): void {
        const layer = this._panelLayer;
        if (!this.sim || !layer || !this._lastReport) return;
        this.closeTopPanel();
        const panel = MonthReportPanel.show(layer, this.sim, this._lastReport);
        panel.onClosed = () => {
            if (this._reportPanel === panel) this._reportPanel = null;
        };
        this._reportPanel = panel;
    }

    /** economy.json：一个月几秒、开局资金。读到之后（读不到也照样）新档才开始播开场 */
    private loadEconomy(): void {
        resources.load('config/economy', JsonAsset, (err, asset) => {
            const json = (!err && asset && asset.json ? asset.json : {}) as { secondsPerMonth?: number; startFunds?: number };
            if (this._clock && typeof json.secondsPerMonth === 'number') {
                this._clock.setSecondsPerMonth(json.secondsPerMonth);
            }
            if (this._newGame && this.sim) {
                // 金额以配置为准（DESIGN 13）；没配就用模拟层当前的钱
                const funds = typeof json.startFunds === 'number' ? json.startFunds : this.sim.state.finance.funds;
                this.playOpening(funds);
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
        const panel = BuildingPanel.show(
            layer, this.sim, this.model, uid,
            (residentId) => this.openResident(residentId),
            this.requestToggleFacing,
            (text) => this.setPlacementHint(text),
        );
        if (panel) this._topPanel = panel;
    }

    /**
     * 顶栏第二行左侧的提示文字（原来在旧 HUD 里）：
     * 「选建筑点地块放置」/「放置：火锅店」/「拆除模式：点建筑移除」。
     * GameRoot 在选建筑、进拆除、放下建筑之后调它。
     */
    setPlacementHint(text: string): void {
        this._hint = text;
        if (this._topBar) this._topBar.setHint(text);
    }

    get placementHint(): string {
        return this._hint;
    }

    /** 打开居民总览（T309）。入口按钮由集成在顶栏/底栏安排，这里先留方法 */
    openResidentList(): void {
        const layer = this._panelLayer;
        if (!this.sim || !this.model || !layer) return;
        this.closeTopPanel();
        const panel = ResidentListPanel.show(layer, this.sim, this.model, (id) => this.openResident(id));
        this._listPanel = panel;
    }

    /** 从建筑详情点名字 → 居民档案，叠在建筑详情上面 */
    /** 从地图上点了街上的行人（T311，集成接线）：直接打开这位居民的档案 */
    openResidentById(residentId: number): void {
        this.openResident(residentId);
    }

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
        if (this._reportPanel && this._reportPanel.node?.isValid) {
            this._reportPanel.node.destroy();
        }
        this._reportPanel = null;
        if (this._listPanel && this._listPanel.node?.isValid) {
            this._listPanel.node.destroy();
        }
        this._listPanel = null;
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
