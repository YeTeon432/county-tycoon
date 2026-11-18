import { DayClock } from './DayClock';
import { Color, _decorator, Component, Node, UITransform, Layers, macro } from 'cc';
import { BuildingDef, loadBuildingConfig } from '../core/BuildingConfig';
import { TownModel } from '../core/TownModel';
import { WorldConfig, loadWorldConfig } from '../core/WorldConfig';
import { BuildingBar } from '../ui/BuildingBar';
import { ZoomButtons } from '../ui/ZoomButtons';
import { InputGuard } from './InputGuard';
import { makeButton, makeRoundButton } from '../ui/UiTheme';
import { UiRoot } from '../ui/UiRoot';
import { SimApi } from '../core/sim/SimApi';
import { createSimulation, loadSimJson } from '../core/SimLoader';
import { loadTerrain } from '../core/TerrainConfig';
import { Terrain } from '../core/Terrain';
import { WorldView } from '../world/WorldView';
import { SaveManager, readSave, restoreTown } from '../core/SaveGame';
import { PlaceControls } from '../world/PlaceControls';
import { TopBar } from '../ui/TopBar';

const { ccclass } = _decorator;

/**
 * 2D 顶点缓冲每块的大小（T212）。默认 144 KB ≈ 1024 个精灵一块；地面 64×64 = 4096 个精灵就要 4 块，
 * 楼和行人每帧按前后重排，相邻两个精灵落在不同的块里就得断开合批 —— 实测建筑层 494 个同图集精灵画了 70 次。
 * 2048 KB ≈ 5.8 万顶点 ≈ 1.45 万个精灵一块，整张图装得下；仍在 65535 顶点以内，不依赖 WebGL 扩展。
 * 必须在第一个 2D 组件建出来之前设，所以放在模块顶层（脚本先于场景加载）。
 */
macro.BATCHER2D_MEM_INCREMENT = 2048;

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
    private _progressJson: any = null;
    private _defs: BuildingDef[] = [];
    private _ui: UiRoot | null = null;
    /** 开局那条土路的中心格（镜头对准这里） */
    private _openingCell: [number, number] = [0, 0];
    /** 这一局是新开的（没读到存档）：要播开场（T407） */
    private _newGame = true;
    private _saver: SaveManager | null = null;

    /** 这一局是不是新开的（界面据此决定播不播开场） */
    get newGame(): boolean {
        return this._newGame;
    }

    protected onDestroy(): void {
        if (this._saver) this._saver.stopAutoSave();
    }

    protected start(): void {
        // 两份配置并行读，都读到了再搭画面，避免先画出半成品
        Promise.all([loadWorldConfig(), loadBuildingConfig(), loadSimJson()])
            .then(([world, buildings, sim]) =>
                loadTerrain(world.gridWidth, world.gridHeight).then((terrain) => ({ world, buildings, sim, terrain })))
            .then(({ world, buildings, sim: [economy, names, progress], terrain }) => {
                this._config = world;
                this._progressJson = progress;
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

        // 有存档就读档（D022：以前存档只写不读）；读不到或坏了就新开一局
        const loaded = readSave();
        let sim;
        if (loaded.ok && loaded.save) {
            const defs = new Map(buildings.map((d) => [d.id, d] as [string, BuildingDef]));
            const skipped = restoreTown(model, loaded.save.town, defs);
            if (skipped.length) console.warn(`[GameRoot] 读档时 ${skipped.length} 栋没放回去`);
            sim = createSimulation(model, economy, names, 1, loaded.save.sim, this._progressJson);
            this._newGame = false;
            const first = model.allBuildings().find((b) => !b.def.flat);
            if (first) this._openingCell = [first.col, first.row];
            console.log(`[GameRoot] 读档：${sim.state.residents.length} 人，${model.allBuildings().length} 栋`);
        } else {
            if (loaded.reason && loaded.reason !== 'empty') console.warn(`[GameRoot] 存档读不了（${loaded.reason}），新开一局`);
            // 开局地块：一条土路 + 两栋自建房（PRD 第 2 节）。要在建模拟之前放，模拟层会把它们登记成开局的家
            this.placeOpening(model, buildings);
            sim = createSimulation(model, economy, names, Date.now() % 100000000, undefined, this._progressJson);
        }
        this._sim = sim;
        // 自动存档：切后台时 + 每个月结算后（DESIGN 1：每月自动存）
        this._saver = new SaveManager(() => (this._sim ? this._sim.state : null), () => this._model);
        this._saver.startAutoSave();
        sim.onMonth = () => { if (this._saver) this._saver.saveNow(); };

        this.buildWorld(world, model);
        if (this._view) this._view.focusCell(this._openingCell[0], this._openingCell[1]);
        this._defs = buildings;
        this.buildBar(buildings);
        this.buildPlaceControls();
        // 经营界面（支线 B）放最后，压在所有东西上面
        this._ui = UiRoot.create(this.node, this._sim, model, { newGame: this._newGame });
        // 空手点建筑 → 界面开详情；详情里的「换朝向」按钮 → WorldView
        const view = this._view, ui = this._ui;
        if (this._bar) ui.attachBuildingBar(this._bar);
        if (view) ui.setArt(view.art);   // 底栏缩略图 + 居民头像
        if (view) {
            view.onBuildingTapped = (uid) => ui.onBuildingTapped(uid);
            ui.requestToggleFacing = (uid) => view.toggleFacingByUid(uid);
            // T311：街上的行人是真实居民，点一下看档案
            view.onResidentTapped = (id) => ui.openResidentById(id);
            const sim = this._sim;
            if (view.life && sim) {
                view.life.setResidentSource(() => sim.state.residents);
                // T219：到店飘「+¥N」用真实客单价
                view.life.priceOf = (defId) => (sim.buildingPrice ? sim.buildingPrice(defId) : 0);
            }
            // D024：一个月演成一天，街上的人和顶栏读同一个钟
            DayClock.progress = () => (ui.clock ? ui.clock.progress : 0);
            DayClock.speed = () => (ui.clock ? ui.clock.speed : 1);
            // 第三、四批（D026）：环境图层、特色街道小旗、招商选址
            if (sim) {
                view.envAt = sim.envAt ? (c, r) => sim.envAt!(c, r) : null;
                view.envOfDef = sim.buildingEnv ? (id) => sim.buildingEnv!(id) : null;
                const flagColors: Record<string, Color> = {
                    night: new Color(232, 87, 74), daily: new Color(76, 174, 76), school: new Color(58, 134, 214),
                    influencer: new Color(240, 120, 190), youth: new Color(246, 180, 40),
                };
                view.streetSource = () => {
                    const m = new Map<number, Color>();
                    for (const st of sim.state.streets ?? []) for (const u of st.uids) m.set(u, flagColors[st.kind] ?? flagColors.daily);
                    return m;
                };
                ui.requestPlace = (defId) => {
                    if (this._bar && this._bar.selectById(defId)) this.updatePlacementHint();
                };
                ui.toggleEnvView = () => { view.envView = !view.envView; return view.envView; };
            }
            // 施工进度（D026）：工地半透明 + 进度条
            if (sim) {
                const empty = new Map<number, number>();
                view.alertSource = () => {
                    const m = new Map<number, 'leave' | 'wish'>();
                    for (const r of sim.state.residents) {
                        if (r.homeId === null) continue;
                        if (r.leaving) m.set(r.homeId, 'leave');
                        else if (r.wish && !m.has(r.homeId)) m.set(r.homeId, 'wish');
                    }
                    return m;
                };
                // 点气泡 = 打开那位居民的档案（想走的优先），里面有吐槽 / 心愿和建议
                view.onAlertTapped = (uid, kind) => {
                    const who = sim.state.residents.find((r) => r.homeId === uid && (kind === 'leave' ? !!r.leaving : !!r.wish));
                    if (!who) return false;
                    ui.openResidentById(who.id);
                    return true;
                };
                view.constructionSource = () => {
                    const list = sim.state.construction;
                    if (!list || !list.length) return empty;
                    const m = new Map<number, number>();
                    for (const c of list) m.set(c.uid, sim.constructionProgress ? (sim.constructionProgress(c.uid, DayClock.progress()) ?? 1) : 1);
                    return m;
                };
            }
            // 放置 / 拆除的提示文字，原来在旧 HUD 里，现在归顶栏第二行
            view.onCellTapped = () => this.updatePlacementHint();
            // 盖 / 拆之后也存一次：玩家盖完楼直接关页面不会丢
            view.onTownChanged = () => { this.updatePlacementHint(); if (this._saver) this._saver.saveNow(); };
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
        // 预览中：能凑特色街道就提示（D026，DESIGN 21）
        const p = view.pending, sim = this._sim;
        const street = p && p.ok && sim && sim.streetHint ? sim.streetHint(p.def.id, p.col, p.row, p.def.width, p.def.height) : null;
        const deal = sim && sim.state.pendingDeal;
        if (deal && view.selectedBuilding && view.selectedBuilding.id === deal.defId) {
            ui.setPlacementHint(`招商选址：给${deal.company}划一块地建${view.selectedBuilding.name}（对方出钱）`);
        } else if (street) {
            ui.setPlacementHint(street);
        } else if (view.demolishing) {
            ui.setPlacementHint('拆除模式：点建筑移除');
        } else if (view.selectedBuilding) {
            ui.setPlacementHint(view.selectedBuilding.flat
                ? `修路：${view.selectedBuilding.name}，点地块直接铺`
                : `放置：${view.selectedBuilding.name}，点地块预览，按「确定」盖下`);
        } else {
            ui.setPlacementHint('');   // 空闲：顶栏第二行显示就业率和均薪（T212）；操作说明交给开场卡片和小提示
        }
    }

    /** 住户翻盖完（模拟层把 defId 换了），地图上也换成新楼（D026） */
    private _syncT = 0;
    protected update(dt: number): void {
        this._syncT -= dt;
        if (this._syncT > 0) return;
        this._syncT = 0.5;
        const sim = this._sim, model = this._model, view = this._view, defs = this._defs;
        if (!sim || !model || !view || !defs.length) return;
        let changed = false;
        for (const b of sim.state.buildings) {
            const placed = model.allBuildings().find((x) => x.uid === b.uid);
            if (!placed || placed.def.id === b.defId) continue;
            const def = defs.find((d) => d.id === b.defId);
            if (def && model.replaceDef(b.uid, def)) changed = true;
        }
        if (changed) view.redrawTown();
    }

    private placeOpening(model: TownModel, defs: BuildingDef[]): void {
        const def = (id: string) => defs.find((d) => d.id === id);
        const road = def('dirt-road'), house = def('hut') ?? def('house');   // D026：开局都是土坯农房
        if (!road || !house) return;
        // 开局放在出生点附近（map.json 的 spawn）。出生点那一排可能压着池塘、树林，
        // 所以上下找一排：9 格土路 + 路南 4 栋都放得下的最近一排
        const sp = model.terrain ? model.terrain.spawn : { col: Math.floor(model.width / 2), row: Math.floor(model.height / 2) };
        const workshop0 = def('workshop'), breakfast0 = def('breakfast'), center0 = def('center');
        // 县发展中心（D026）：路北侧正中，2×2，开局镜头对准它
        const fits = (cx: number, cy: number) => {
            for (let c = cx - 4; c <= cx + 4; c++) if (!model.canPlace(road, c, cy)) return false;
            const lots: [BuildingDef | undefined, number][] = [[house, cx - 1], [house, cx + 1], [workshop0, cx + 3], [breakfast0, cx - 3]];
            if (center0 && !model.canPlace(center0, cx - 1, cy + 1)) return false;
            return lots.every(([d, c]) => !d || model.canPlace(d, c, cy - 1));
        };
        let cx = sp.col + 4, cy = sp.row;
        search: for (let d = 0; d < 12; d++) {
            for (const dy of d === 0 ? [0] : [-d, d]) {
                for (const dx of [0, -2, 2, -4, 4]) {
                    if (fits(sp.col + 4 + dx, sp.row + dy)) { cx = sp.col + 4 + dx; cy = sp.row + dy; break search; }
                }
            }
        }
        this._openingCell = [cx, cy];
        for (let c = cx - 4; c <= cx + 4; c++) model.place(road, c, cy);
        model.place(house, cx - 1, cy - 1);
        model.place(house, cx + 1, cy - 1);
        // 开局要有饭碗：只有住宅时 6 个月内全员找不到工作搬走（M2 验收发现）。
        // 一间小作坊（4 岗）+ 一家早餐铺（2 岗，也满足吃饭），够开局 5 人里能干活的都有活干
        if (workshop0) model.place(workshop0, cx + 3, cy - 1);
        if (breakfast0) model.place(breakfast0, cx - 3, cy - 1);
        if (center0) model.place(center0, cx - 1, cy + 1);
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
        worldView.onBuilt = (b) => {
            const sim = this._sim;
            const dealBefore = !!(sim && sim.state.pendingDeal);
            // 把开工时刻（本月走到哪儿）传给模拟层：工期从这一刻算，进度条才不会一出现就半满
            const ok = sim ? sim.onBuilt(b.uid, b.def.id, DayClock.progress()) : true;
            if (ok && this._ui) this._ui.notifyBuilt();
            // 招商供地选址完成（D026）：退出放置，免得接着盖第二栋要自己掏钱
            if (ok && dealBefore && sim && !sim.state.pendingDeal) {
                this.scheduleOnce(() => {
                    if (this._bar) this._bar.clearSelection();
                    if (this._view) this._view.selectBuilding(null);
                    this.updatePlacementHint();
                }, 0);
            }
            return ok;
        };
        worldView.onDemolished = (uid) => { if (this._sim) this._sim.onDemolished(uid); };
        worldView.onPlaceRejected = (d, why) => console.log(`[GameRoot] ${d.name} 没盖成：${why}`);
        // 非道路建筑确认放置后退出选中：底栏取消高亮，玩家点别处不会再开新预览
        worldView.onBuildingConfirmed = () => {
            if (this._bar) this._bar.clearSelection();
            this.updatePlacementHint();
        };
    }

    /** 放置确认条（D022）：预览上方的「换朝向 / 确定 / ✕」，压在地图和底栏上、面板下 */
    private buildPlaceControls(): void {
        const view = this._view;
        if (!view) return;
        const sim = this._sim;
        view.canAfford = (def) => (sim ? sim.canAfford(def.id) : true);
        const bar = this._bar;
        if (bar) view.blockReason = (def) => bar.blockReason(def);
        const n = new Node('PlaceControls');
        n.layer = Layers.Enum.UI_2D;
        this.node.addChild(n);
        n.addComponent(PlaceControls).setup(view, TopBar.HEIGHT, BuildingBar.BAR_HEIGHT);
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

        // 缩放按钮上面：「环境」视图开关（D026，DESIGN 22）
        const zp = zoomNode.position;
        const envBtn = makeButton(this.node, 'EnvBtn', '环境', 96, 52, 'white', () => {
            const v = this._view;
            if (!v) return;
            v.envView = !v.envView;
            envBtn.setStyle(v.envView ? 'primary' : 'white');
            if (v.envView && this._ui) this._ui.setPlacementHint('环境视图：绿 = 环境好，红 = 有污染（工厂、矿场）。树和广场能改善');
            else this.updatePlacementHint();
        });
        envBtn.node.setPosition(zp.x - 0, zp.y + ZoomButtons.totalHeight() / 2 + 24 + 26, 0);
        InputGuard.add(envBtn.node);

        // 「环境」上面：转视角（D031）。双指扭转也能转，这个按钮兜底 + 让人知道能转
        if (this._view && this._view.canRotateView) {
            const rotBtn = makeRoundButton(this.node, 'RotateBtn', 'rotate', 64, () => { if (this._view) this._view.rotateView(1); });
            rotBtn.node.setPosition(zp.x, envBtn.node.position.y + 26 + 12 + 32, 0);
            InputGuard.add(rotBtn.node);
        }
    }

}
