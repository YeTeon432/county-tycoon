import { Color, _decorator, Component, EventTouch, EventMouse, input, Input, view, Vec2, Node, Vec3, UITransform, Camera, director, gfx } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { InputGuard } from '../core/InputGuard';
import { Facing, PlacedBuilding, TownModel } from '../core/TownModel';
import { WorldConfig } from '../core/WorldConfig';
import { ArtLibrary } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { BuildingLayer, ReachDraw } from './BuildingLayer';
import { ServiceReach } from '../core/sim/SimApi';
import { GridMap } from './GridMap';
import { LifeLayer } from './LifeLayer';
import { Tracker, TrackWhat } from './Tracker';
import { DayClock } from '../core/DayClock';
import { World3D } from './World3D';

const { ccclass } = _decorator;

/**
 * 地图的平移、缩放，以及地块的点选。
 *
 * 三个实现取舍：
 *
 * 1. 变换的是"世界容器节点"，不是 Canvas 自带的相机。
 *    Canvas 会在每次尺寸变化时强行复位相机的位置和 orthoHeight，自己挪相机等于跟引擎抢控制权；
 *    而且相机一动，同一台相机下的 UI 会跟着跑，但我们希望 HUD 钉死在屏幕上。
 *    把地图放进容器节点、只动容器，视觉上和"相机平移缩放"完全等价，UI 天然不受影响。
 *
 * 2. 输入监听挂在全局 input 上，不挂在节点上。
 *    节点事件要先做命中测试，得保证节点尺寸和屏幕一致；全局输入直接拿到原始触摸，
 *    在微信、抖音、浏览器三端行为一致。代价是它不知道哪里有 UI，
 *    所以配合 InputGuard 手动判断——UI 面板登记过的区域不响应地图操作。
 *
 * 3. 拖动和点击用"位移阈值"区分。
 *    手指按下时记下起点，松手时如果移动距离小于阈值就算点击，否则算拖动。
 *    没有直接监听 MOUSE_UP 是因为真机上只有触摸，一套代码三端通用。
 */
/** 放置预览（D022）：等玩家按「确定」的那一栋 */
export interface PendingPlace {
    def: BuildingDef;
    col: number;
    row: number;
    facing: Facing;
    /** 能不能盖下（位置合法 + 钱够） */
    ok: boolean;
    /** 不能盖时的原因，给确认条显示 */
    reason: string;
    /** 有没有第二个朝向的图 */
    canRotate: boolean;
}

@ccclass('WorldView')
export class WorldView extends Component {
    private _config: WorldConfig | null = null;
    private _world: Node | null = null;
    private _map: GridMap | null = null;
    private _buildings: BuildingLayer | null = null;
    private _life: LifeLayer | null = null;
    /** 居民追踪（T425）：箭头画在地图上面，屏幕坐标 */
    private _tracker: Tracker | null = null;
    private _trackId: number | null = null;
    /** 镜头正在平滑移向的位置（世界容器坐标）；手一碰就取消 */
    private _panTarget: { x: number; y: number } | null = null;
    private _model: TownModel | null = null;
    private _iso: IsoMath | null = null;
    private readonly _art = new ArtLibrary();
    /** 真 3D 的地面、楼、山树、人车（D033）。T540h 起没有 2D 画法了（?flat2d 去掉） */
    private _3d: World3D | null = null;

    /** 当前缩放档位在 zoomLevels 里的下标 */
    private _zoomIndex = 0;
    /** 当前缩放倍率 */
    private _zoom = 1;

    /** 上一次记录的双指间距 */
    private _pinchDistance = 0;
    /** 当前视角总角度（弧度，顺时针为正） */
    private _viewAngle = 0;
    /** 视角按钮触发的旋转动画 */
    private _turn: { from: number; to: number; elapsed: number } | null = null;
    private static readonly TURN_STEP = Math.PI / 12;
    private static readonly TURN_DURATION = 0.25;
    /** 视角转了（D031），给 HUD 用 */
    onViewRotated: ((rot: number) => void) | null = null;

    /** 当前按着的手指：id → UI 坐标 */
    private readonly _touches = new Map<number, Vec2>();
    /** 单指拖动的上一个位置 */
    private _lastX = 0;
    private _lastY = 0;
    private _lastMoveAt = 0;
    /** 惯性速度（UI 像素 / 秒） */
    private _velX = 0;
    private _velY = 0;

    /** 单指按下后的累计位移（像素），用来判断是点击还是拖动 */
    private _dragDist = 0;
    /** 本次手势是否已经因为拖动而作废了点击 */
    private _dragged = false;
    /** 按下时是否落在 UI 上（落在 UI 上就不该拖地图） */
    private _startedOnUI = false;

    /** 当前选中的建筑；null 表示"拆除模式"之外的待选状态 */
    private _selected: BuildingDef | null = null;
    /** 当前是否处于拆除模式 */
    private _demolishing = false;
    private _alwaysShowGrid = false;
    /** 鼠标当前指到哪一格，-1 表示不在图上 */
    private _hoverCol = -1;
    private _hoverRow = -1;
    private _hoverDemolition: PlacedBuilding | null = null;
    /** 放置预览：点了地块、还没按「确定」（D022，DESIGN 12）。道路不走预览 */
    private _pending: PendingPlace | null = null;
    private _pendingDemolition: PlacedBuilding | null = null;

    /** 判定"点击"的最大位移，单位是 UI 像素。手指在真机上抖一两个像素很正常 */
    private static readonly TAP_SLOP = 12;
    /** 惯性衰减（越大停得越快） */
    private static readonly FLING_DECAY = 5;
    /** 镜头中心越过地图边缘时，最多再拖出几格 */
    private static readonly EDGE_TRAVEL = 3;
    private static readonly EDGE_RETURN_RATE = 14;
    /** 点在楼缝里时，手指附近多大范围内找楼（UI 单位，换算到地图要除以倍率；T424） */
    private static readonly PICK_SLOP = 12;

    /** 复用的临时向量，避免每帧产生垃圾 */
    private static readonly _vecA = new Vec2();
    private static readonly _vecB = new Vec2();
    private static readonly _tmpWorld = new Vec3();

    /** 缩放变化时的回调，给 HUD 之类的外部模块用 */
    onZoomChanged: ((zoom: number, index: number) => void) | null = null;
    /** 点中某一格时的回调（col, row） */
    onCellTapped: ((col: number, row: number) => void) | null = null;
    /**
     * 放下之后、生效之前问一句（集成接模拟层：扣建设资金）。返回 false 就撤销这次放置。
     * 道路也会问，造价由 economy.json 决定。
     */
    onBuilt: ((b: PlacedBuilding) => boolean) | null = null;
    /** 拆掉之后通知（模拟层把住户、员工清出去） */
    onDemolished: ((uid: number) => void) | null = null;
    /** 施工进度（D026）：GameRoot 接到模拟层。返回 uid → 0..1，不在施工的不返回 */
    constructionSource: (() => Map<number, number>) | null = null;
    /** 环境视图开着吗（D026）；envAt / envOfDef 由 GameRoot 接到模拟层 */
    envView = false;
    envAt: ((col: number, row: number) => number) | null = null;
    envOfDef: ((defId: string) => number) | null = null;
    private _envKey = '';
    /**
     * 覆盖范围（T538），GameRoot 接到模拟层：
     * reachOfPending = 放置预览的店 / 学校…沿路能服务到哪；wishReachOf = 追踪的居民心愿要的范围（从他家算）。
     * 放置预览优先；没在放楼、正在追踪有这类心愿的人，就画他的心愿范围。
     */
    reachOfPending: ((defId: string, col: number, row: number, w: number, h: number) => ServiceReach | null) | null = null;
    wishReachOf: ((residentId: number) => ServiceReach | null) | null = null;
    private _reachKey = '';
    private _reachT = 0;
    /** 特色街道成员：uid → 小旗颜色（GameRoot 接） */
    streetSource: (() => ReadonlyMap<number, Color>) | null = null;
    private _flags = new Map<number, Color>();
    /** 楼顶要冒红色「!」的楼（有人想走，D026）。GameRoot 接到模拟层 */
    alertSource: (() => ReadonlyMap<number, 'leave' | 'wish'>) | null = null;
    private _alerts = new Map<number, 'leave' | 'wish'>();
    /** 点中了有气泡的楼（D026）：返回 true 表示已处理，不再开建筑详情 */
    onAlertTapped: ((uid: number, kind: 'leave' | 'wish') => boolean) | null = null;
    /** 上一帧在施工的楼（完工后要恢复原样） */
    private _building = new Set<number>();
    /** 现在在施工的楼（行人不往里走） */
    get underConstruction(): ReadonlySet<number> {
        return this._building;
    }
    /** 放置失败（资金不够等）时的提示 */
    onPlaceRejected: ((def: BuildingDef, reason: string) => void) | null = null;
    /** 非道路建筑确认放置成功后（通知底栏取消选中高亮） */
    onBuildingConfirmed: (() => void) | null = null;
    /** 空手点了一栋建筑（道路除外） */
    onBuildingTapped: ((uid: number) => void) | null = null;
    /** 放置/拆除之后的通知，给 HUD 刷新计数用 */
    onTownChanged: (() => void) | null = null;
    /** 钱够不够（预览里提前把「确定」灰掉）；不接就当够 */
    canAfford: ((def: BuildingDef) => boolean) | null = null;
    /** 盖不了的原因（没解锁 / 预算不够），预览里显示；接了就优先用它，不再问 canAfford */
    blockReason: ((def: BuildingDef) => string | null) | null = null;
    /** 放置或拆除预览改变时通知确认条。 */
    onPendingChanged: (() => void) | null = null;

    /** 追踪用：这位居民的名字和家（每帧问一次，搬家了箭头跟着换）；null = 人没了 */
    trackInfo: ((id: number) => { name: string; homeId: number | null } | null) | null = null;
    /** 追踪的人搬走 / 去世了（追踪已自动结束） */
    onTrackLost: ((id: number) => void) | null = null;

    /** 建好地图并接管输入 */
    create(config: WorldConfig, model: TownModel): void {
        this._config = config;
        this._model = model;
        this._zoomIndex = config.defaultZoomIndex;
        this._zoom = config.zoomLevels[this._zoomIndex];

        // 地图外的底色 = 草地色（T218）：缩到最小也不露出场景相机默认的紫黑
        const cam = director.getScene()?.getComponentInChildren(Camera);
        const bg = new Color().fromHEX(config.palette.background);
        if (cam) cam.clearColor = bg;

        // 世界容器：地图挂在它下面，平移缩放都作用在它身上
        const world = new Node('World');
        this.node.addChild(world);
        this._world = world;

        const iso = new IsoMath(config);
        this._iso = iso;

        // 地面每格取哪一帧（画在 World3D 里）
        const map = GridMap.create(model, this._art);
        world.addChild(map.node);
        this._map = map;

        // 建筑层压在地面之上
        const buildingNode = BuildingLayer.create(iso, model, this._art);
        world.addChild(buildingNode);
        this._buildings = buildingNode.getComponent(BuildingLayer);

        // 真 3D（D033）：3D 相机先画地面、楼、人车，2D 相机只清深度、把气泡、进度条、界面压在上面
        {
            if (cam) cam.clearFlags = gfx.ClearFlagBit.DEPTH_STENCIL;
            const w3 = World3D.create(iso, model, bg);
            this._3d = w3;
            w3.groundFrame = (c, r) => map.modelFrame(c, r);
            this._buildings!.heightOf = (id) => w3.heightOf(id);
            // 工地、塔吊、放置预览也是 3D 模型（T540e）
            this._buildings!.site3D = (uid, site) => w3.setSite(uid, site);
            this._buildings!.sites3DReady = () => w3.hasSites;
            this._buildings!.preview3D = (p) => w3.setPreview(p);
            this._buildings!.decal3D = (layer, list) => w3.setDecals(layer, list);
            w3.onReady = () => { if (this._buildings) this._buildings.refresh3D(); };
        }

        // 行人、车、金币：LifeLayer 管日程与特效，World3D 画人车
        const lifeNode = LifeLayer.create(iso, model, this._art, this._buildings!);
        world.addChild(lifeNode);
        this._life = lifeNode.getComponent(LifeLayer);
        if (this._life) this._life.busy = () => this._building;
        // 人车也进 3D（T540f）：画成纸片，被楼挡住
        if (this._3d && this._life) {
            const life = this._life;
            this._3d.actorSource = () => life.actors3D();
        }

        // 贴图异步加载，先用色块顶着，加载完两层各重画一次
        this._art.load(() => {
            if (!this.isValid) return;
            this.redrawTown();
        });

        this._world.setPosition(0, 0, 0);
        this.applyTransform();

        // 追踪箭头压在整张地图上面（WorldView 节点下、World 容器之后）
        this._tracker = Tracker.create(this.node);

        this.registerInput();
    }

    get zoom(): number {
        return this._zoom;
    }

    get zoomLevels(): number[] {
        return this._config ? this._config.zoomLevels : [];
    }

    /** 建筑或马路有变化：地面（马路拼接）和建筑层都要重画 */
    redrawTown(): void {
        if (this._buildings) this._buildings.redraw();
        if (this._life) this._life.onTownChanged();
        if (this._3d) this._3d.redraw();
    }

    /** 贴图仓库（底栏缩略图用） */
    get art(): ArtLibrary {
        return this._art;
    }

    get model(): TownModel | null {
        return this._model;
    }

    get selectedBuilding(): BuildingDef | null {
        return this._selected;
    }

    get demolishing(): boolean {
        return this._demolishing;
    }

    get alwaysShowGrid(): boolean {
        return this._alwaysShowGrid;
    }

    set alwaysShowGrid(on: boolean) {
        this._alwaysShowGrid = on;
        this.updateGridVisibility();
    }

    /** 选择要放置的建筑（同时退出拆除模式） */
    selectBuilding(def: BuildingDef | null): void {
        this._selected = def;
        this._demolishing = false;
        this.resetEditPreview();
    }

    /** 切到拆除模式（同时清空选中的建筑） */
    setDemolishMode(on: boolean): void {
        this._demolishing = on;
        if (on) this._selected = null;
        this.resetEditPreview();
    }

    private resetEditPreview(): void {
        this._hoverCol = this._hoverRow = -1;
        this._hoverDemolition = this._pendingDemolition = null;
        this.updateGridVisibility();
        this.setPending(null);
        this._3d?.setDemolitionTarget(null);
    }

    private updateGridVisibility(): void {
        this._3d?.setGridVisible(this._alwaysShowGrid || !!this._selected || this._demolishing);
    }

    private registerInput(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        // 桌面调试用：滚轮换档、鼠标移动显示预览框
        input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        InputGuard.clear();
        if (this._3d && this._3d.isValid) this._3d.node.destroy();
    }

    /** 移动、惯性和转向更新完后，用同一帧的状态画地图、人车和追踪标记。 */
    protected lateUpdate(dt: number): void {
        const w3 = this._3d, world = this._world;
        if (w3 && world) {
            const p = world.position;
            w3.syncCamera(p.x, p.y, this._zoom, this._viewAngle);
            w3.setHidden(this._building);
        }
        this.updateTrack(dt);
    }

    /**
     * 手势（D024、D037）：自己记每根手指的位置。
     * - 单指拖地图，松手带惯性；
     * - 双指捏合围绕两指中点缩放，单指负责拖动，按钮负责转视角；
     * - 手指数变了就重新取基准，不跳；一次手势里只要出现过双指，就不算点击。
     */
    private onTouchStart(event: EventTouch): void {
        const first = this._touches.size === 0;
        for (const t of event.getTouches()) this._touches.set(t.getID(), t.getUILocation(new Vec2()));
        if (first) {
            const loc = event.getUILocation();
            this._startedOnUI = InputGuard.isBlocked(loc.x, loc.y);
            this._dragDist = 0;
            this._dragged = this.rotating;
            this._velX = 0; this._velY = 0;
            this._panTarget = null;
        }
        if (this._touches.size >= 2) this._dragged = true;   // 双指开始就作废点击
        this.rebaseGesture();
    }

    private onTouchMove(event: EventTouch): void {
        for (const t of event.getTouches()) {
            const p = this._touches.get(t.getID());
            if (p) t.getUILocation(p);
        }
        // UI 上开始的手势交给 UI 自己处理
        if (this._startedOnUI) return;

        if (this._touches.size >= 2) {
            const [a, b] = this.firstTwo();
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const previousDistance = this._pinchDistance;
            // 到倍率上限或下限仍更新指距，手指一反向便立即响应。
            this._pinchDistance = dist;
            if (previousDistance <= 0 || dist <= 0 || Math.abs(dist - previousDistance) < 1e-6) return;
            const anchor = this.uiToNode((a.x + b.x) / 2, (a.y + b.y) / 2);
            this.setZoomAround(this._zoom * (dist / previousDistance), anchor.x, anchor.y);
            return;
        }

        // 单指：拖动地图（和上一次位置比，手指数变化后不跳）
        const p = this._touches.values().next().value as Vec2 | undefined;
        if (!p) return;
        const dx = p.x - this._lastX, dy = p.y - this._lastY;
        this._lastX = p.x; this._lastY = p.y;
        if (dx === 0 && dy === 0) return;
        this._dragDist += Math.hypot(dx, dy);
        if (this._dragDist > WorldView.TAP_SLOP) this._dragged = true;
        if (!this._dragged) return;
        this.panBy(dx, dy);
        // 惯性速度：平滑一下，免得最后一帧抖动决定甩出去的方向
        const now = Date.now();
        const dt = Math.max(1, now - this._lastMoveAt) / 1000;
        this._lastMoveAt = now;
        const k = 0.35;
        this._velX = this._velX * (1 - k) + (dx / dt) * k;
        this._velY = this._velY * (1 - k) + (dy / dt) * k;
    }

    private onTouchEnd(event: EventTouch): void {
        const wasPinch = this._touches.size >= 2;
        const cancelled = event.type === Input.EventType.TOUCH_CANCEL;
        let released = false;
        for (const t of event.getTouches()) {
            if (this._touches.delete(t.getID())) released = true;
        }
        // Cocos 会按每根手指重复派发同一批抬手事件。
        if (!released) return;
        if (cancelled || wasPinch) { this._velX = 0; this._velY = 0; }
        if (this._touches.size > 0) {
            // 还有手指按着：换基准接着拖 / 捏
            this.rebaseGesture();
            return;
        }
        // 全部抬起
        if (this._startedOnUI || Date.now() - this._lastMoveAt > 80) { this._velX = 0; this._velY = 0; }
        if (!cancelled && !this._dragged && !this._startedOnUI && !this.rotating) {
            const loc = event.getUILocation();
            this.tapAt(loc.x, loc.y);
        }
        this._dragged = false;
        this._dragDist = 0;
        this._startedOnUI = false;
    }

    /** 手指数变了：重新记录捏合 / 拖动的起点 */
    private rebaseGesture(): void {
        if (this._touches.size >= 2) {
            const [a, b] = this.firstTwo();
            this._pinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
        } else {
            this._pinchDistance = 0;
            const p = this._touches.values().next().value as Vec2 | undefined;
            if (p) { this._lastX = p.x; this._lastY = p.y; }
            this._lastMoveAt = Date.now();
        }
    }

    private firstTwo(): [Vec2, Vec2] {
        const it = this._touches.values();
        return [it.next().value as Vec2, it.next().value as Vec2];
    }

    get viewRotation(): number {
        return this._iso ? this._iso.rot : 0;
    }

    get canRotateView(): boolean {
        return !!this._iso && this._iso.canRotate;
    }

    /** 转向按钮按当前动画的目标角度累加步长，连续点击时每一下都算。 */
    rotateView(dir: 1 | -1): void {
        if (!this.canRotateView) return;
        const base = this._turn?.to ?? this._viewAngle;
        this._turn = { from: this._viewAngle, to: base + dir * WorldView.TURN_STEP, elapsed: 0 };
        this._panTarget = null;
        this._velX = 0; this._velY = 0;
    }

    private stepTurn(dt: number): void {
        const turn = this._turn;
        if (!turn) return;
        turn.elapsed += dt;
        const t = Math.min(1, turn.elapsed / WorldView.TURN_DURATION);
        const eased = t * t * (3 - 2 * t);
        if (t === 1) this._turn = null;
        this.setViewAngle(t === 1 ? turn.to : turn.from + (turn.to - turn.from) * eased);
    }

    /**
     * 把视角设到 phi（弧度，顺时针为正）。rot 和 spin 一起用于 3D 相机和界面的坐标换算。
     * 每帧围绕当前屏幕中心转，玩家在动画中拖动或缩放时，下一帧继续用更新后的中心。
     */
    private setViewAngle(phi: number): void {
        const iso = this._iso, world = this._world;
        if (!iso || !world || !iso.canRotate) return;
        const [gx, gy] = this.gridAtCenter(world.position.x, world.position.y);
        const q = Math.PI / 2;
        const k = Math.round(phi / q);
        let spin = phi - k * q;
        if (Math.abs(spin) < 1e-6) spin = 0;
        const rot = ((k % 4) + 4) % 4;
        iso.rot = rot;
        iso.spin = spin;
        this._viewAngle = spin === 0 ? k * q : phi;

        this.centerOnGrid(gx, gy);

        this._buildings?.relayout(this.rotating);
        if (!this._turn) {
            this.clearGhost();
            this.onViewRotated?.(iso.rot);
        }
    }

    /** 正在播放旋转动画 */
    get rotating(): boolean {
        return this._turn !== null;
    }

    /** UI 坐标 → 本节点本地坐标（屏幕中心为原点） */
    private uiToNode(uiX: number, uiY: number): { x: number; y: number } {
        const trans = this.node.getComponent(UITransform);
        WorldView._tmpWorld.set(uiX, uiY, 0);
        if (trans) trans.convertToNodeSpaceAR(WorldView._tmpWorld, WorldView._tmpWorld);
        return { x: WorldView._tmpWorld.x, y: WorldView._tmpWorld.y };
    }

    private syncConstruction(dt: number): void {
        const layer = this._buildings;
        if (!layer || !this.constructionSource) return;
        const now = this.constructionSource();
        layer.tickConstruction(Math.min(dt, 0.1) * DayClock.speed());   // 暂停时塔吊也停
        this._building.forEach((uid) => { if (!now.has(uid)) layer.setConstruction(uid, null); });
        now.forEach((p, uid) => layer.setConstruction(uid, p));
        this._building = new Set(now.keys());
        this.syncEnv(layer);
        this.syncReach(layer, dt);
        if (this.streetSource) {
            const f = this.streetSource();
            this._flags.forEach((_c, uid) => { if (!f.has(uid)) layer.setStreetFlag(uid, null); });
            f.forEach((c, uid) => { if (this._flags.get(uid) !== c) layer.setStreetFlag(uid, c); });
            this._flags = new Map(f);
        }
        if (this.alertSource) {
            const a = this.alertSource();
            this._alerts.forEach((_k, uid) => { if (!a.has(uid)) layer.setAlert(uid, null); });
            a.forEach((k, uid) => { if (this._alerts.get(uid) !== k) layer.setAlert(uid, k); });
            this._alerts = new Map(a);
        }
    }

    /**
     * 覆盖范围图层（T538）：放置预览的店 / 学校…优先；没在放楼、正在追踪有店 / 学校 / 卫生院心愿的人，画他家的心愿范围。
     */
    private syncReach(layer: BuildingLayer, dt: number): void {
        const model = this._model;
        if (!model) return;
        const p = this._pending;
        this._reachT -= dt;
        const key = `${model.allBuildings().length}|${p ? `${p.def.id}@${p.col},${p.row}` : ''}|${this._trackId ?? ''}`;
        // 追踪时心愿会自己变（实现 / 过期 / 新心愿），每秒再对一次
        if (key === this._reachKey && (this._trackId === null || p || this._reachT > 0)) return;
        this._reachKey = key;
        this._reachT = 1;
        let reach: ServiceReach | null = null;
        if (p && this.reachOfPending) reach = this.reachOfPending(p.def.id, p.col, p.row, p.def.width, p.def.height);
        else if (!p && this._trackId !== null && this.wishReachOf) reach = this.wishReachOf(this._trackId);
        if (!reach) { layer.drawReach(null); return; }
        const homes: ReachDraw['homes'] = [];
        for (const uid of reach.homes) {
            const b = model.allBuildings().find((x) => x.uid === uid);
            if (b) homes.push({ col: b.col, row: b.row, width: b.def.width, height: b.def.height });
        }
        layer.drawReach({ roads: reach.roads, homes });
    }

    /** 环境图层：开着环境视图就画全县；正在预览有污染 / 绿化的楼就画它的影响范围 */
    private syncEnv(layer: BuildingLayer): void {
        const model = this._model;
        if (!model) return;
        const p = this._pending;
        const env = p && this.envOfDef ? this.envOfDef(p.def.id) : 0;
        const key = `${this.envView ? 1 : 0}|${model.allBuildings().length}|${p && env ? `${p.def.id}@${p.col},${p.row}` : ''}`;
        if (key === this._envKey) return;
        this._envKey = key;
        const cells: [number, number, number][] = [];
        if (this.envView && this.envAt) {
            for (let r = 0; r < model.height; r++) for (let c = 0; c < model.width; c++) {
                const v = this.envAt(c, r);
                if (Math.abs(v) >= 0.25) cells.push([c, r, v]);
            }
        } else if (p && env) {
            const cx = p.col + p.def.width / 2, cy = p.row + p.def.height / 2;
            for (let r = Math.floor(cy - 4); r <= cy + 4; r++) for (let c = Math.floor(cx - 4); c <= cx + 4; c++) {
                const d = Math.max(Math.abs(c + 0.5 - cx), Math.abs(r + 0.5 - cy));
                if (d > 3 || d < 0.5 || !model.inBounds(c, r)) continue;
                cells.push([c, r, env * (1 - (d - 1) / 4)]);
            }
        }
        layer.drawEnv(cells);
    }

    /** 松手后的惯性滑动 */
    protected update(dt: number): void {
        this.stepTurn(dt);
        this.syncConstruction(dt);
        this.stepPan(dt);
        if (this._touches.size > 0 || this.rotating || this._panTarget) return;
        if (this.stepEdgeReturn(dt)) {
            this._velX = 0; this._velY = 0;
            return;
        }
        const v = Math.hypot(this._velX, this._velY);
        if (v < 8) { this._velX = 0; this._velY = 0; return; }
        dt = Math.min(dt, 0.05);
        const decay = Math.exp(-dt * WorldView.FLING_DECAY);
        const travel = (1 - decay) / WorldView.FLING_DECAY;
        this.panBy(this._velX * travel, this._velY * travel);
        this._velX *= decay; this._velY *= decay;
    }

    /** 屏幕/UI 坐标 → 地块坐标 → 交给上层处理 */
    private tapAt(uiX: number, uiY: number): void {
        // 追踪：点了屏幕边上的圆 → 镜头移到人 / 他家
        if (this._tracker && this._tracker.tracking) {
            const trans = this.node.getComponent(UITransform);
            if (trans) {
                const v = trans.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
                const what = this._tracker.hit(v.x, v.y);
                if (what) { this.focusTrack(what); return; }
            }
        }
        const cell = this.uiToCell(uiX, uiY);
        if (this._demolishing) {
            if (cell) this.onCellTapped?.(...cell);
            this.setPendingDemolition(this.demolitionAt(uiX, uiY, cell));
            return;
        }
        if (!cell) {
            this.clearGhost();
            return;
        }
        const [col, row] = cell;

        if (this.onCellTapped) this.onCellTapped(col, row);

        if (this._selected) {
            // 道路一点就铺；其他建筑先出预览，按「确定」才盖（D022）
            if (this._selected.flat) {
                if (this.doPlace(this._selected, col, row)) this.clearGhost();
                else {
                    this._hoverCol = col;
                    this._hoverRow = row;
                    this.refreshGhost();
                }
            } else {
                this.previewAt(this._selected, col, row);
            }
        } else {
            // 没选建筑也没开拆除：点中建筑交给界面打开详情（换朝向改成详情里的按钮），点空地什么都不做。
            // 街上的人和车不能点（T424：老是抢走点楼；想看某人从居民总览「追踪」）。
            // 先按楼的真实画面找（点楼身、楼顶都算），点在楼缝里就找手指附近最近的楼，再找不到才看脚下那一格
            const lp = this.uiToLocal(uiX, uiY);
            const hitUid = lp && this._buildings ? this._buildings.pickBuildingAt(lp.x, lp.y, WorldView.PICK_SLOP / this._zoom) : null;
            const b = this._model
                ? (hitUid !== null ? this._model.allBuildings().find((x) => x.uid === hitUid) ?? null : this._model.getAt(col, row))
                : null;
            if (b && !b.def.flat) {
                // 气泡只在点中气泡本身时才接管，点楼身还是看住户 / 员工
                const k = this._alerts.get(b.uid);
                if (k && this.onAlertTapped && lp && this._buildings && this._buildings.hitAlert(b.uid, lp.x, lp.y)
                    && this.onAlertTapped(b.uid, k)) return;
                if (this.onBuildingTapped) this.onBuildingTapped(b.uid);
            }
            return;
        }
    }

    /** 按 uid 换朝向（建筑详情面板的按钮用）。没有两个朝向的建筑返回 false */
    toggleFacingByUid(uid: number): boolean {
        const b = this._model ? this._model.allBuildings().find((x) => x.uid === uid) : null;
        return b ? this.toggleFacing(b.col, b.row) : false;
    }

    /** 手动换朝向；只有画了两个朝向的建筑才有意义（行道树、广场只有一张图） */
    toggleFacing(col: number, row: number): boolean {
        const model = this._model;
        if (!model) return false;
        const b = model.getAt(col, row);
        if (!b || b.def.flat || !this._art.get(`${b.def.id}_r`)) return false;
        model.toggleFacing(col, row);
        this.redrawTown();
        if (this.onTownChanged) this.onTownChanged();
        return true;
    }

    // ---------------- 放置预览（D022） ----------------
    get pending(): PendingPlace | null {
        return this._pending;
    }

    /** 在某格出预览：默认朝向按四周的路选（和 settleFacings 同一规则），没路朝 L */
    private previewAt(def: BuildingDef, col: number, row: number): void {
        const model = this._model;
        if (!model) return;
        // 同一格再点一次：保留玩家已经换过的朝向
        const keep = this._pending && this._pending.def === def && this._pending.col === col && this._pending.row === row;
        const facing = keep ? this._pending!.facing : (model.facingByRoads(def, col, row) ?? 'L');
        this.setPending(this.evalPending(def, col, row, facing));
    }

    private evalPending(def: BuildingDef, col: number, row: number, facing: Facing): PendingPlace {
        const model = this._model!;
        let reason = '';
        if (!model.canPlace(def, col, row)) reason = '这里放不下';
        else if (this.blockReason) reason = this.blockReason(def) ?? '';
        else if (this.canAfford && !this.canAfford(def)) reason = '预算不够';
        return { def, col, row, facing, ok: reason === '', reason, canRotate: !!this._art.get(`${def.id}_r`) };
    }

    private setPending(p: PendingPlace | null): void {
        this._pending = p;
        const layer = this._buildings;
        if (layer) {
            if (p) layer.showPreview(p.def, p.col, p.row, p.facing, p.ok);
            else layer.clearGhost();
        }
        this.onPendingChanged?.();
    }

    /** 预览换朝向（没有 _r 图的建筑不动） */
    rotatePending(): void {
        const p = this._pending;
        if (!p || !p.canRotate) return;
        this.setPending(this.evalPending(p.def, p.col, p.row, this._model ? this._model.nextFacing(p.def, p.col, p.row, p.facing) : p.facing));
    }

    /** 按「确定」：按预览的位置和朝向盖下。非道路建筑盖完后退出选中，免得点别处又开新预览 */
    confirmPending(): boolean {
        const p = this._pending;
        if (!p) return false;
        const fresh = this.evalPending(p.def, p.col, p.row, p.facing);   // 资金可能刚变过
        if (!fresh.ok) { this.setPending(fresh); return false; }
        const ok = this.doPlace(p.def, p.col, p.row, p.facing);
        if (ok && !p.def.flat) {
            this.selectBuilding(null);
            if (this.onBuildingConfirmed) this.onBuildingConfirmed();
        } else {
            this.setPending(null);
        }
        return ok;
    }

    cancelPending(): void {
        if (this._pendingDemolition) this.setPendingDemolition(null);
        else this.setPending(null);
    }

    /** 预览上方在 UI 坐标里的位置（确认条跟着它）；没有预览返回 null */
    pendingAnchorUI(out: Vec3): Vec3 | null {
        const p = this._pending ?? this._pendingDemolition;
        const iso = this._iso, world = this._world;
        const trans = this.node.getComponent(UITransform);
        if (!p || !iso || !world || !trans) return null;
        const box = iso.footprintBounds(p.col, p.row, p.def.width, p.def.height);
        const roof = box.top + (this._buildings?.previewRoofHeight(p.def.id) ?? 0);
        const wp = world.position;
        out.set(wp.x + box.x * this._zoom, wp.y + roof * this._zoom, 0);
        return trans.convertToWorldSpaceAR(out, out);
    }

    /** 盖一栋（道路点一下直接走这里；其他建筑由 confirmPending 调） */
    private doPlace(def: BuildingDef, col: number, row: number, facing: Facing | null = null): boolean {
        const model = this._model;
        const layer = this._buildings;
        if (!model || !layer) return false;

        const placed = model.place(def, col, row, facing);
        if (!placed) {
            // 放不下（越界或已占用）：给一点反馈，但不弹窗打断操作
            console.log(`[WorldView] ${def.name} 放不下：(${col}, ${row})`);
            return false;
        }
        if (this.onBuilt && !this.onBuilt(placed)) {
            model.removeAt(col, row);
            if (this.onPlaceRejected) this.onPlaceRejected(def, '建设资金不够');
            return false;
        }
        this.redrawTown();
        if (this.onTownChanged) this.onTownChanged();
        return true;
    }

    get pendingDemolition(): PlacedBuilding | null {
        return this._pendingDemolition;
    }

    private demolitionAt(uiX: number, uiY: number, cell: [number, number] | null): PlacedBuilding | null {
        const model = this._model;
        if (!model || this.rotating) return null;
        const lp = this.uiToLocal(uiX, uiY);
        const uid = lp ? this._buildings?.pickBuildingAt(lp.x, lp.y) : null;
        if (uid != null) {
            const building = model.allBuildings().find((b) => b.uid === uid);
            if (building) return building;
        }
        return cell ? model.getAt(...cell) : null;
    }

    private setPendingDemolition(target: PlacedBuilding | null): void {
        this._hoverDemolition = null;
        this._pendingDemolition = target;
        this.refreshGhost();
        this.onPendingChanged?.();
    }

    confirmDemolition(): void {
        const model = this._model;
        const target = this._pendingDemolition;
        if (!model || !target || !this._demolishing) return;
        this.setPendingDemolition(null);
        if (model.getAt(target.col, target.row) !== target) return;
        const removed = model.removeAt(target.col, target.row);
        if (!removed) return;
        if (this.onDemolished) this.onDemolished(removed.uid);
        this.redrawTown();
        if (this.onTownChanged) this.onTownChanged();
    }

    // ---------------- 居民追踪（T425） ----------------
    /** 开始追踪某位居民（null = 结束）。镜头先移到他身上，之后地图照常自由拖 */
    track(id: number | null): void {
        const tr = this._tracker;
        if (!tr) return;
        this._trackId = id;
        if (this._life) this._life.tracked = id;
        const info = id !== null && this.trackInfo ? this.trackInfo(id) : null;
        if (id === null || !info) {
            this._trackId = null;
            if (this._life) this._life.tracked = null;
            tr.end();
            return;
        }
        tr.begin(info.name);
        this.focusTrack('person');
    }

    get trackingId(): number | null {
        return this._trackId;
    }

    /** 可见地图区域四边让多少（界面告诉：顶栏、底栏有多高） */
    setTrackInsets(top: number, bottom: number): void {
        if (this._tracker) { this._tracker.insetTop = top; this._tracker.insetBottom = bottom; }
    }

    /** 追踪的人此刻在干什么（追踪条写字用）：在路上去哪 / 在哪栋楼里 */
    trackWhere(): { walking: boolean; uid: number | null; to: number | null } | null {
        if (this._trackId === null || !this._life) return null;
        const w = this._life.whereIs(this._trackId);
        return w ? { walking: w.walking, uid: w.uid, to: w.to } : null;
    }

    /** 镜头平滑移到追踪的人 / 他家 */
    focusTrack(what: TrackWhat): void {
        const p = this.trackLocal(what);
        if (p) this.panToLocal(p.x, p.y);
    }

    /** 追踪目标在地图本地坐标里的位置（人：头顶；在楼里或家：楼顶） */
    private trackLocal(what: TrackWhat): { x: number; y: number } | null {
        const id = this._trackId, life = this._life, layer = this._buildings;
        if (id === null || !life || !layer) return null;
        if (what === 'home') {
            const info = this.trackInfo ? this.trackInfo(id) : null;
            return info && info.homeId !== null ? layer.topOf(info.homeId) : null;
        }
        const w = life.whereIs(id);
        if (!w) return null;
        if (w.walking) return { x: w.x, y: w.y };
        return w.uid !== null ? layer.topOf(w.uid) : null;
    }

    private updateTrack(dt: number): void {
        const tr = this._tracker, world = this._world;
        if (!tr || !tr.tracking || this._trackId === null || !world) return;
        const id = this._trackId;
        const info = this.trackInfo ? this.trackInfo(id) : null;
        if (!info) {
            this.track(null);
            if (this.onTrackLost) this.onTrackLost(id);
            return;
        }
        const wp = world.position, z = this._zoom;
        const toView = (p: { x: number; y: number } | null) => (p ? { x: wp.x + p.x * z, y: wp.y + p.y * z } : null);
        const person = this.trackLocal('person');
        const home = info.homeId !== null && this._buildings ? this._buildings.topOf(info.homeId) : null;
        const w = this._life ? this._life.whereIs(id) : null;
        const stacked = !!w && !w.walking && w.uid !== null && w.uid === info.homeId;
        const vis = view.getVisibleSize();
        tr.draw(toView(person), toView(home), stacked, vis.width, vis.height, dt);
    }

    /** 让地图本地坐标 (x, y) 移到可见区域中间（顶栏、底栏挡住的部分不算） */
    private panToLocal(x: number, y: number): void {
        const iso = this._iso;
        if (!iso) return;
        const tr = this._tracker;
        const midY = tr ? (tr.insetBottom - tr.insetTop) / 2 : 0;
        const [gx, gy] = iso.fromLocal(x, y - midY / this._zoom);
        const p = iso.toLocal(this.limitGrid(gx, iso.cols), this.limitGrid(gy, iso.rows));
        this._panTarget = { x: -p.x * this._zoom, y: -p.y * this._zoom };
        this._velX = 0; this._velY = 0;
    }

    private stepPan(dt: number): void {
        const t = this._panTarget, world = this._world;
        if (!t || !world) return;
        const p = world.position;
        if (Math.hypot(t.x - p.x, t.y - p.y) < 1) {
            world.setPosition(t.x, t.y, p.z);
            this._panTarget = null;
            return;
        }
        const k = 1 - Math.exp(-dt * 8);
        world.setPosition(p.x + (t.x - p.x) * k, p.y + (t.y - p.y) * k, p.z);
    }

    /**
     * 招商选址引导（D032）：给当前选中的建筑挑一块挨着路、离住宅最近的空地，直接放好预览、镜头移过去。
     * 玩家可以点别处换位置。找不到空地返回 false。
     */
    suggestPlacement(): boolean {
        const model = this._model, def = this._selected;
        if (!model || !def || def.flat) return false;
        const all = model.allBuildings().filter((b) => !b.def.flat);
        const homes = all.filter((b) => b.def.category === '住宅');
        const ref = homes.length ? homes : all;
        let nc = model.width / 2, nr = model.height / 2;
        if (ref.length) {
            nc = ref.reduce((a, b) => a + b.col + b.def.width / 2, 0) / ref.length;
            nr = ref.reduce((a, b) => a + b.row + b.def.height / 2, 0) / ref.length;
        }
        const spot = model.findSpot(def, nc, nr);
        if (!spot) return false;
        this.previewAt(def, spot.col, spot.row);
        this.focusCell(spot.col + (def.width - 1) / 2, spot.row + (def.height - 1) / 2);
        return true;
    }

    /** 镜头对准某一格（开局对准出生点用） */
    focusCell(col: number, row: number): void {
        const iso = this._iso;
        if (!iso || !this._world) return;
        this._panTarget = null;
        this._velX = 0; this._velY = 0;
        this.centerOnGrid(this.limitGrid(col + 0.5, iso.cols), this.limitGrid(row + 0.5, iso.rows));
    }

    /** 按钮用：放大 / 缩小一档 */
    zoomStep(delta: number): void {
        const config = this._config;
        if (!config) return;
        // 捏合后倍率可能在两档之间：放大就去上面一档，缩小就去下面一档
        const levels = config.zoomLevels;
        const eps = 1e-3;
        const target = delta > 0
            ? levels.find((z) => z > this._zoom + eps)
            : [...levels].reverse().find((z) => z < this._zoom - eps);
        if (target === undefined) return;
        this.setZoom(target);
    }

    get zoomIndex(): number {
        return this._zoomIndex;
    }

    private onMouseWheel(event: EventMouse): void {
        const scrollY = event.getScrollY();
        if (scrollY === 0 || !this._config) return;
        // 滚轮一格换一档
        this.zoomStep(scrollY > 0 ? 1 : -1);
    }

    /** 桌面调试：鼠标划过时显示放置预览 */
    private onMouseMove(event: EventMouse): void {
        if (!this._selected && !this._demolishing) return;
        const loc = event.getUILocation();
        this.updateHover(loc.x, loc.y);
    }

    /** 更新预览位置 */
    private updateHover(uiX: number, uiY: number): void {
        if (this._pending || this._pendingDemolition) return;
        if (this.rotating || InputGuard.isBlocked(uiX, uiY)) {
            this.clearGhost();
            return;
        }
        const cell = this.uiToCell(uiX, uiY);
        if (this._demolishing) {
            const target = this.demolitionAt(uiX, uiY, cell);
            if (target === this._hoverDemolition) return;
            this._hoverDemolition = target;
            this.refreshGhost();
            return;
        }
        if (!cell) {
            this.clearGhost();
            return;
        }
        const [col, row] = cell;
        if (col === this._hoverCol && row === this._hoverRow) return;
        this._hoverCol = col;
        this._hoverRow = row;
        this.refreshGhost();
    }

    /** 按当前模式重画预览 */
    private refreshGhost(): void {
        const layer = this._buildings;
        if (!layer) return;
        const target = this._pendingDemolition ?? this._hoverDemolition;
        this._3d?.setDemolitionTarget(target?.uid ?? null);
        if (this._pending) {
            // 资金、地块可能变了：按现状重算一遍
            const p = this._pending;
            this.setPending(this.evalPending(p.def, p.col, p.row, p.facing));
        } else if (target) {
            layer.showDemolition(target);
        } else if (this._selected && this._hoverCol >= 0) {
            const { ok } = this.evalPending(this._selected, this._hoverCol, this._hoverRow, 'L');
            layer.showGhost(this._selected, this._hoverCol, this._hoverRow, ok);
        } else {
            layer.clearGhost();
        }
    }

    private clearGhost(): void {
        if (this._hoverCol < 0 && !this._hoverDemolition) return;
        this._hoverCol = -1;
        this._hoverRow = -1;
        this._hoverDemolition = null;
        if (!this._pending && !this._pendingDemolition) this.refreshGhost();
    }

    /**
     * UI 坐标 → 地块坐标。
     *
     * UI 坐标的原点是视口左下角，而本节点（Game）的原点在屏幕正中，
     * 两者差一个 Canvas 尺寸的一半。这里用 UITransform 做逆变换，
     * 而不是手写减去 360/640 —— 以后改设计分辨率或给 Canvas 加偏移都不用改这里。
     * 拿到本节点本地坐标后，再减掉世界容器的位移、除以缩放，就得到地图本地坐标。
     * 越界返回 null。
     */
    /** 行人层（GameRoot 接居民名单用） */
    get life(): LifeLayer | null {
        return this._life;
    }

    /** UI 坐标 → 地图本地坐标 */
    private uiToLocal(uiX: number, uiY: number): { x: number; y: number } | null {
        const world = this._world;
        const trans = this.node.getComponent(UITransform);
        if (!world || !trans) return null;
        WorldView._tmpWorld.set(uiX, uiY, 0);
        trans.convertToNodeSpaceAR(WorldView._tmpWorld, WorldView._tmpWorld);
        const p = world.position;
        return { x: (WorldView._tmpWorld.x - p.x) / this._zoom, y: (WorldView._tmpWorld.y - p.y) / this._zoom };
    }

    private uiToCell(uiX: number, uiY: number): [number, number] | null {
        const world = this._world;
        const config = this._config;
        const trans = this.node.getComponent(UITransform);
        if (!world || !config || !trans) return null;

        // UI 坐标 → 本节点本地坐标（屏幕中心为原点）
        WorldView._tmpWorld.set(uiX, uiY, 0);
        trans.convertToNodeSpaceAR(WorldView._tmpWorld, WorldView._tmpWorld);

        // 再逆掉世界容器的平移和缩放 → 地图本地坐标
        const p = world.position;
        const localX = (WorldView._tmpWorld.x - p.x) / this._zoom;
        const localY = (WorldView._tmpWorld.y - p.y) / this._zoom;

        return this._iso ? this._iso.toCell(localX, localY) : null;
    }

    /**
     * 设置缩放倍率（连续，不吸附；D024 取代 D005 的整数倍吸附——D021 起是 3D 预渲染图，不需要像素对齐）。
     * 以屏幕中心为缩放中心。
     */
    setZoom(zoom: number): void {
        this.setZoomAround(zoom, 0, 0);
    }

    /** 缩放前后，让相同的地图点留在锚点下方。 */
    private setZoomAround(zoom: number, anchorX: number, anchorY: number): void {
        const config = this._config;
        const world = this._world;
        const iso = this._iso;
        if (!config || !world || !iso) return;
        const levels = config.zoomLevels;
        const value = Math.max(levels[0], Math.min(levels[levels.length - 1], zoom));
        if (value === this._zoom) return;

        // 下标 = 最接近的档位（按钮显示、滚轮换档用）
        let nearest = 0, gap = Infinity;
        for (let i = 0; i < levels.length; i++) {
            const d = Math.abs(levels[i] - value);
            if (d < gap) { gap = d; nearest = i; }
        }
        // 两档之间时下标别停在两端，免得 +/- 按钮误显示成「到头了」
        const eps = 1e-3;
        if (nearest === levels.length - 1 && value < levels[nearest] - eps) nearest--;
        if (nearest === 0 && value > levels[0] + eps) nearest = Math.min(1, levels.length - 1);
        this._zoomIndex = nearest;

        const ratio = value / this._zoom;
        const p = world.position;
        this._panTarget = null;
        this._zoom = value;
        this.applyTransform();
        const [gx, gy] = this.gridAtCenter(anchorX - (anchorX - p.x) * ratio, anchorY - (anchorY - p.y) * ratio);
        const margin = WorldView.EDGE_TRAVEL;
        this.centerOnGrid(this.limitGrid(gx, iso.cols, margin), this.limitGrid(gy, iso.rows, margin));
        this.onZoomChanged?.(this._zoom, this._zoomIndex);
    }

    /** 平移，参数是 UI 坐标下的位移 */
    panBy(dx: number, dy: number): void {
        const world = this._world;
        const iso = this._iso;
        if (!world || !iso) return;
        const p = world.position;
        const [gx, gy] = this.gridAtCenter(p.x, p.y);
        const [nextX, nextY] = this.gridAtCenter(p.x + dx, p.y + dy);
        this.centerOnGrid(this.resistEdge(gx, nextX, iso.cols), this.resistEdge(gy, nextY, iso.rows));
    }

    private applyTransform(): void {
        if (this._world) {
            this._world.setScale(this._zoom, this._zoom, 1);
        }
    }

    /** 世界容器的位置和镜头正下方的地面坐标互相换算。 */
    private gridAtCenter(wx: number, wy: number): [number, number] {
        return this._iso!.fromLocal(-wx / this._zoom, -wy / this._zoom);
    }

    private centerOnGrid(gx: number, gy: number): void {
        const world = this._world!;
        const p = this._iso!.toLocal(gx, gy);
        world.setPosition(-p.x * this._zoom, -p.y * this._zoom, world.position.z);
    }

    private limitGrid(value: number, size: number, margin = 0): number {
        return Math.max(-margin, Math.min(size + margin, value));
    }

    /** 在地图内跟手；越界后越往外越难拉，反向时立刻跟手。 */
    private resistEdge(current: number, next: number, size: number): number {
        if (next >= 0 && next <= size) return next;
        const edge = next < 0 ? 0 : size;
        const dir = next < 0 ? -1 : 1;
        const before = Math.max(0, (current - edge) * dir);
        const after = (next - edge) * dir;
        if (after <= before) return next;
        const travel = WorldView.EDGE_TRAVEL;
        const remaining = (travel - before) * Math.exp(-(after - before) / travel);
        return edge + dir * (travel - remaining);
    }

    /** 松手后只沿越界的格子轴退回地图边缘。 */
    private stepEdgeReturn(dt: number): boolean {
        const world = this._world, iso = this._iso;
        if (!world || !iso) return false;
        const p = world.position;
        const [gx, gy] = this.gridAtCenter(p.x, p.y);
        const x = this.limitGrid(gx, iso.cols), y = this.limitGrid(gy, iso.rows);
        const distance = Math.hypot(gx - x, gy - y);
        if (distance < 1e-6) return false;
        const decay = distance < 0.002 ? 0 : Math.exp(-dt * WorldView.EDGE_RETURN_RATE);
        this.centerOnGrid(x + (gx - x) * decay, y + (gy - y) * decay);
        return true;
    }
}
