import { _decorator, Component, JsonAsset, Layers, Node, profiler, resources, UITransform } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { SimApi } from '../core/sim/SimApi';
import { MonthlyReport, TownLevel } from '../core/sim/types';
import { TownModel } from '../core/TownModel';
import { Portrait } from './Portrait';
import { BuildingBar } from './BuildingBar';
import { BuildingPanel } from './BuildingPanel';
import { IntroCards } from './IntroCards';
import { MonthReportPanel } from './MonthReportPanel';
import { ResidentListPanel } from './ResidentListPanel';
import { ResidentPanel } from './ResidentPanel';
import { TrackChip } from './TrackChip';
import { TimeController } from './TimeController';
import { NoticeLayer } from './NoticeLayer';
import { CenterPanel } from './CenterPanel';
import { SettingsPanel } from './SettingsPanel';
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
    /** 招商供地：让玩家去地图上选址（GameRoot 接到底栏 + WorldView） */
    requestPlace: ((defId: string) => boolean) | null = null;
    /** 环境视图开关（GameRoot 接到 WorldView），返回开着没 */
    toggleEnvView: (() => boolean) | null = null;
    getGridPreference: (() => boolean) | null = null;
    setGridPreference: ((on: boolean) => void) | null = null;
    /** 居民追踪（T425，GameRoot 接到 WorldView）：开始 / 结束（null） */
    requestTrack: ((id: number | null) => void) | null = null;
    /** 镜头移到追踪的人 / 他家 */
    requestTrackFocus: ((what: 'person' | 'home') => void) | null = null;
    /** 追踪的人此刻在路上去哪 / 在哪栋楼里（追踪条写字用） */
    trackWhere: (() => { walking: boolean; uid: number | null; to: number | null } | null) | null = null;
    private _trackChip: TrackChip | null = null;
    private _trackId: number | null = null;
    private _trackT = 0;
    /** 当前的放置/拆除提示（GameRoot 和建筑栏会调 setPlacementHint） */
    private _hint = '';

    private _topBar: TopBar | null = null;
    private _clock: TimeController | null = null;
    private _notices: NoticeLayer | null = null;
    private _centerPanel: CenterPanel | null = null;
    /** 时间推进器（GameRoot 把它接到 DayClock，街上的人按钟点出门） */
    get clock(): TimeController | null {
        return this._clock;
    }
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
    private _settingsPanel: SettingsPanel | null = null;
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
        this.buildTrackChip();
        this.buildPanelLayer();
        // 公告栏 + 大公示（D026）：压在面板上面、开场卡片下面
        this._notices = NoticeLayer.create(this.node, this.sim);
        this._notices.onGoalsTap = () => this.openCenter('goals');
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
        Portrait.setArt(art);
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
            if (art instanceof ArtLibrary) { this._bar.setArt(art); Portrait.setArt(art); }
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
    /**
     * 县发展中心按钮的红点：发展目标全完成可以升级，或者有签了约还没交地的招商（D032）。
     * 月底、盖楼、招商面板改动后都调。
     */
    refreshCenterDot(): void {
        const sim = this.sim, bar = this._topBar;
        if (!sim || !bar) return;
        const g = sim.goals ? sim.goals() : [];
        const ready = g.length > 0 && g.every((x) => x.done);
        bar.setCenterReady(ready || !!sim.state.pendingDeal);
    }

    notifyBuilt(): void {
        this.refreshCenterDot();
        if (this._topBar) this._topBar.refresh();
        if (!this._waitFirstBuild) return;
        if (this.countBuildings() > this._baseBuildings) {
            this._waitFirstBuild = false;
            if (this._bar) this._bar.showTabHint(null);
        }
    }

    protected update(dt: number): void {
        this.updateTrackChip(dt);
        // 资金在盖楼 / 拆楼时也会变，顶栏不能只在月底刷新：每 0.5 秒对一次（只是改几段文字）
        this._tick += dt;
        if (this._tick < 0.5) return;
        this._tick = 0;
        if (this._topBar) this._topBar.refresh();
        if (this._waitFirstBuild) this.notifyBuilt();
        if (this._notices && this.sim && this.sim.goals) {
            const g = this.sim.goals();
            this._notices.setGoals(g.filter((x) => x.done).length, g.length);
        }
        this.refreshCenterDot();
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
        // 有签了约还没交地的招商（D032）→ 直接开招商页
        bar.onCenterTap = () => this.openCenter(this.sim && this.sim.state.pendingDeal ? 'invest' : 'goals');
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

    openSettings(): void {
        const layer = this._panelLayer, read = this.getGridPreference, write = this.setGridPreference;
        if (!layer || !read || !write) return;
        this.closeTopPanel();
        const panel = SettingsPanel.show(layer, read(), write);
        panel.onClosed = () => {
            if (this._settingsPanel === panel) this._settingsPanel = null;
        };
        this._settingsPanel = panel;
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
        if (this._notices && report.notices) this._notices.push(report.notices);
        // 研究完成：底栏多出新卡片；开着的县发展中心面板也刷新
        if (report.notices && report.notices.some((n) => n.kind === 'research')) {
            if (this._bar) this._bar.refreshUnlocks();
        }
        if (this._centerPanel && this._centerPanel.node?.isValid) this._centerPanel.fill();
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
        // 县发展中心：打开它自己的面板（目标 / 研究 / 招商 / 特色街道，D026）
        const placed = this.model.allBuildings().find((b) => b.uid === uid);
        if (placed && placed.def.id === 'center' && this.sim.goals) {
            this.openCenter('goals', uid);
            return;
        }
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

    /** 公告栏发一条（GameRoot 用：存档失败等） */
    say(text: string): void {
        this._notices?.say('info', text);
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
        // 详情面板保持打开，档案压在上面；档案关掉后详情还在，符合"点了人再返回"的操作习惯。
        // 但档案只留一份：再点另一个人时先关掉旧档案（否则叠两层，关的时候会重复销毁报错）
        const old = this._residentPanel;
        this._residentPanel = null;
        if (old && old.node && old.node.isValid) old.node.destroy();
        const onTrack = this.requestTrack ? (id: number) => this.startTrack(id) : undefined;
        const panel = ResidentPanel.show(layer, this.sim, this.model, residentId, onTrack);
        if (panel) {
            panel.onClosed = () => {
                if (this._residentPanel === panel) this._residentPanel = null;
            };
            this._residentPanel = panel;
        }
    }

    // ---------------- 居民追踪（T425） ----------------
    /** 追踪条压在面板下面（打开面板时被盖住，关掉又露出来） */
    private buildTrackChip(): void {
        const chip = TrackChip.create(this.node);
        chip.onFocusPerson = () => this.requestTrackFocus?.('person');
        chip.onFocusHome = () => {
            const r = this._trackId !== null && this.sim ? this.sim.resident(this._trackId) : null;
            if (r && r.homeId === null) { this._notices?.say('info', `${r.name}现在没有住处`); return; }
            this.requestTrackFocus?.('home');
        };
        chip.onStop = () => this.stopTrack();
        this._trackChip = chip;
    }

    /** 地图可见区域上下各让多少（追踪箭头贴边时别躲到顶栏 / 底栏后面） */
    get mapInsets(): { top: number; bottom: number } {
        return { top: TopBar.HEIGHT + 90, bottom: TrackChip.bottomReserve };
    }

    /** 档案里点了「追踪」：关掉所有面板，地图上标出这个人和他家 */
    startTrack(id: number): void {
        const r = this.sim ? this.sim.resident(id) : null;
        if (!r || !this.requestTrack) return;
        this.closeTopPanel();
        if (this._topPanel && this._topPanel.node?.isValid) this._topPanel.node.destroy();
        this._topPanel = null;
        this._trackId = id;
        this._trackT = 1;
        this._trackChip?.show(r.name);
        this.requestTrack(id);
        // T538：有「在他家 N 格内盖…」的心愿，地图上同时画出范围，这里说一句怎么看
        const reach = this.sim && this.sim.wishReach ? this.sim.wishReach(id) : null;
        if (reach && r.wish) {
            const where = reach.roads.length ? `蓝色是他家沿路 ${reach.radius} 格内的路，挨着这些路盖就行` : '他家不挨路，先给他家修条路';
            this._notices?.say('info', `${r.wish.hint}：${where}`);
        }
    }

    stopTrack(): void {
        this._trackId = null;
        this._trackChip?.hide();
        this.requestTrack?.(null);
    }

    /** 追踪的人搬走 / 去世（WorldView 发现人没了，已经自己停了） */
    onTrackLost(id: number): void {
        if (this._trackId !== id) return;
        this._trackId = null;
        this._trackChip?.hide();
        this._notices?.say('info', '追踪的居民已经离开县城，追踪结束');
    }

    /** 追踪条的字：张三 · 去早餐铺 / 在超市上班 / 在家（0.3 秒对一次） */
    private updateTrackChip(dt: number): void {
        if (this._trackId === null || !this._trackChip || !this.sim) return;
        this._trackT += dt;
        if (this._trackT < 0.3) return;
        this._trackT = 0;
        const r = this.sim.resident(this._trackId);
        if (!r) return;
        const w = this.trackWhere ? this.trackWhere() : null;
        const name = (uid: number | null) => (uid === null ? null : this.model?.allBuildings().find((b) => b.uid === uid)?.def.name ?? null);
        let doing = '';
        if (w && w.walking) {
            doing = w.to !== null && w.to === r.homeId ? '回家路上' : `去${name(w.to) ?? '外面'}`;
        } else if (w && w.uid !== null) {
            if (w.uid === r.homeId) doing = '在家';
            else if (w.uid === r.jobId) doing = `在${name(w.uid)}上班`;
            else doing = `在${name(w.uid) ?? '外面'}`;
        }
        this._trackChip.setText(doing ? `${r.name} · ${doing}` : r.name);
    }

    /** 打开县发展中心面板 */
    openCenter(tab: 'goals' | 'research' | 'invest' | 'streets' = 'goals', uid?: number): void {
        const layer = this._panelLayer;
        if (!this.sim || !layer) return;
        this.closeTopPanel();
        // 换朝向：点楼进来的用那栋楼；从「目标」小牌进来的找地图上的县发展中心
        const cid = uid ?? this.model?.allBuildings().find((b) => b.def.id === 'center')?.uid;
        const toggle = cid !== undefined && this.requestToggleFacing ? () => this.requestToggleFacing!(cid) : null;
        const p = CenterPanel.show(layer, this.sim, tab, toggle);
        p.onHint = (t) => { if (this._notices) this._notices.say('info', t); };
        p.onChanged = () => { if (this._topBar) this._topBar.refresh(); this.refreshCenterDot(); };
        p.onUpgraded = (lv) => this.onLevelUp(lv);
        if (this._bar) { const defs = this._bar.defs; p.nameOf = (id) => defs.find((d) => d.id === id)?.name ?? id; p.fill(); }
        p.onPlace = (defId) => {
            this.closeTopPanel();
            const placed = this.requestPlace ? this.requestPlace(defId) : false;
            if (this._notices) this._notices.say('info', placed
                ? '签约了！已经挑好一块地，按「确定」交地；想换位置就点别处，✕ 稍后再选'
                : '签约了！在地图上点一块挨着路的空地，按「确定」交地');
        };
        p.onClosed = () => { if (this._centerPanel === p) this._centerPanel = null; };
        this._centerPanel = p;
    }

    private onLevelUp(lv: TownLevel): void {
        const name: Record<TownLevel, string> = { village: '村口', town: '镇上', county: '县城', city: '县级市', top100: '百强县' };
        if (this._notices) this._notices.celebrate(`咱们成了「${name[lv]}」！`, '新的产业研究开放了，上级还拨了一笔发展奖励。去县发展中心看看新目标吧。');
        if (this._bar) this._bar.refreshUnlocks();
        if (this._topBar) this._topBar.refresh();
    }

    private closeTopPanel(): void {
        if (this._settingsPanel?.node.isValid) this._settingsPanel.node.destroy();
        this._settingsPanel = null;
        if (this._centerPanel && this._centerPanel.node?.isValid) this._centerPanel.node.destroy();
        this._centerPanel = null;
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
