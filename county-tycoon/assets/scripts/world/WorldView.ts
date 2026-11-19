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
    /** 真 3D 的地面、楼、山树（D033）；网址带 ?flat2d 时不建，退回 2D 画法对比用 */
    private _3d: World3D | null = null;
    static readonly use3D = !(typeof location !== 'undefined' && location.search.indexOf('flat2d') >= 0);

    /** 当前缩放档位在 zoomLevels 里的下标 */
    private _zoomIndex = 0;
    /** 当前缩放倍率 */
    private _zoom = 1;

    /** 双指缩放时记录的初始指距与初始倍率 */
    private _pinchStartDist = 0;
    private _pinchStartZoom = 1;
    /** 捏合开始时两指中点下面是地图的哪个点（地图本地坐标），缩放全程钉住它 */
    private _pinchMapX = 0;
    private _pinchMapY = 0;
    /**
     * 双指手势是捏还是扭（D031）：开头先不动，等两指距离变化或转过的弧长先超过阈值，定了就锁住。
     * 'twist' 时不缩放，地图跟着手指一点点转；松手后转到最近的 90° 停稳。
     */
    private _gesture: 'none' | 'pinch' | 'twist' = 'none';
    private _twistStartAngle = 0;
    /** 扭的时候：上一帧两指连线的角度、开始扭以来累计转了多少（弧度，UI 坐标逆时针为正）、开始时的视角 */
    private _twistLast = 0;
    private _twistAccum = 0;
    private _twistBase = 0;
    /** 判定捏 / 扭的阈值（UI 像素） */
    private static readonly GESTURE_SLOP = 14;
    /** 当前视角总角度（弧度，顺时针为正；停稳时是 90° 的整数倍） */
    private _viewAngle = 0;
    /** 转视角时钉在屏幕中心的那一点（模型坐标）；不在转时是 null */
    private _spinPivot: [number, number] | null = null;
    /** 停稳 / 按钮转的动画 */
    private _snap: { from: number; to: number; t: number; dur: number } | null = null;
    /** 地面的旋转节点：压扁 0.5 → 转 → 拉回 2 倍，等于在地平面上绕竖轴转 */
    private _groundSpin: Node | null = null;
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
    /** 鼠标/手指当前指到哪一格，-1 表示不在图上 */
    private _hoverCol = -1;
    private _hoverRow = -1;
    /** 放置预览：点了地块、还没按「确定」（D022，DESIGN 12）。道路不走预览 */
    private _pending: PendingPlace | null = null;

    /** 判定"点击"的最大位移，单位是 UI 像素。手指在真机上抖一两个像素很正常 */
    private static readonly TAP_SLOP = 12;
    /** 惯性衰减（越大停得越快） */
    private static readonly FLING_DECAY = 5;
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
    /** 预览出现 / 挪动 / 换朝向 / 消失时通知（确认条据此显示） */
    onPendingChanged: ((p: PendingPlace | null) => void) | null = null;

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

        const mapNode = GridMap.create(config, iso, model, this._art);
        // 地面挂在三层节点下面（D031 跟手转）：等距地面 = 正俯视的格子转 45° 再压扁一半，
        // 所以「压扁 0.5 → 绕原点转 → 拉高 2 倍」就是在地平面上绕地图中心（本地原点）转
        const tilt = new Node('GroundTilt');
        tilt.setScale(1, 0.5, 1);
        world.addChild(tilt);
        const spin = new Node('GroundSpin');
        tilt.addChild(spin);
        const flat = new Node('GroundFlat');
        flat.setScale(1, 2, 1);
        spin.addChild(flat);
        flat.addChild(mapNode);
        this._groundSpin = spin;
        this._map = mapNode.getComponent(GridMap);

        // 建筑层压在地面之上
        const buildingNode = BuildingLayer.create(iso, model, this._art);
        world.addChild(buildingNode);
        this._buildings = buildingNode.getComponent(BuildingLayer);

        // 真 3D（D033）：3D 相机先画地面和楼，2D 相机只清深度、把行人气泡界面压在上面
        if (WorldView.use3D) {
            if (cam) cam.clearFlags = gfx.ClearFlagBit.DEPTH_STENCIL;
            const w3 = World3D.create(iso, model, bg);
            this._3d = w3;
            const map = this._map!;
            map.render2D = false;
            map.redraw();
            w3.groundFrame = (c, r) => map.modelFrame(c, r);
            this._buildings!.has3D = (id) => w3.has(id);
            // 工地、塔吊、放置预览也是 3D 模型（T540e）
            this._buildings!.site3D = (uid, site) => w3.setSite(uid, site);
            this._buildings!.sites3DReady = () => w3.hasSites;
            this._buildings!.preview3D = (p) => w3.setPreview(p);
            this._buildings!.decal3D = (layer, list) => w3.setDecals(layer, list);
            w3.onReady = () => { if (this._buildings) this._buildings.refresh3D(); };
        }

        // 行人、车、金币：人和车挂进建筑层一起排序，金币飘在最上面
        const lifeNode = LifeLayer.create(iso, model, this._art, this._buildings!);
        world.addChild(lifeNode);
        this._life = lifeNode.getComponent(LifeLayer);
        if (this._life) this._life.busy = () => this._building;
        // 人车也进 3D（T540f）：画成纸片，被楼挡住
        if (this._3d && this._life) {
            const life = this._life;
            life.use3D = true;
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
        if (this._map) this._map.redraw();
        if (this._buildings) {
            this._buildings.redraw();
            // 树林上盖了楼，那格的树要撤掉；拆了楼树也不会长回来（树林已经砍了）——先简单整体重建
            this._buildings.syncTerrainObjects();
        }
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

    /** 选择要放置的建筑（同时退出拆除模式） */
    selectBuilding(def: BuildingDef | null): void {
        this._selected = def;
        this._demolishing = false;
        this.setPending(null);
        this.refreshGhost();
    }

    /** 切到拆除模式（同时清空选中的建筑） */
    setDemolishMode(on: boolean): void {
        this._demolishing = on;
        if (on) this._selected = null;
        this.setPending(null);
        this.refreshGhost();
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

    /** 3D 相机每帧对齐 2D 的平移 / 缩放 / 视角（放在 lateUpdate：拖动、惯性、转视角都在 update 里改完了） */
    protected lateUpdate(): void {
        const w3 = this._3d, world = this._world;
        if (!w3 || !world) return;
        const p = world.position;
        w3.syncCamera(p.x, p.y, this._zoom, this._viewAngle);
        w3.setHidden(this._building);
    }

    /**
     * 手势（D024）：自己记每根手指的位置，不依赖 getAllTouches 在抬手那一帧的内容。
     * - 单指拖地图，松手带惯性；
     * - 双指同时缩放 + 平移，缩放以两指中点为中心（手指下面那块地不跑）；
     * - 手指数变了就重新取基准，不跳；一次手势里只要出现过双指，就不算点击。
     */
    private onTouchStart(event: EventTouch): void {
        const first = this._touches.size === 0;
        for (const t of event.getTouches()) this._touches.set(t.getID(), t.getUILocation(new Vec2()));
        if (first) {
            const loc = event.getUILocation();
            this._startedOnUI = InputGuard.isBlocked(loc.x, loc.y);
            this._dragDist = 0;
            this._dragged = false;
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
            if (this._pinchStartDist <= 0 || dist <= 0) return;
            const turn = WorldView.angleDiff(Math.atan2(b.y - a.y, b.x - a.x), this._twistStartAngle);
            if (this._gesture === 'none') {
                // 捏：两指距离变了多少；扭：两指绕中点转过的弧长。谁先过阈值就是谁
                const pinch = Math.abs(dist - this._pinchStartDist);
                const twist = Math.abs(turn) * dist / 2;
                if (Math.max(pinch, twist) < WorldView.GESTURE_SLOP) return;
                this._gesture = twist > pinch && this.canRotateView ? 'twist' : 'pinch';
                if (this._gesture === 'twist') {
                    // 从按下那一刻算起：判定前扭过的那一点也算上，地图直接跟到手指的位置
                    this._snap = null;
                    this._twistBase = this._viewAngle;
                    this._twistAccum = turn;
                    this._twistLast = Math.atan2(b.y - a.y, b.x - a.x);
                    this._velX = 0; this._velY = 0;
                    this.setViewAngle(this._twistBase - this._twistAccum);
                }
                // 判定之前手指已经挪了一点：从现在起算缩放，画面不跳
                this.rebaseGesture();
                return;
            }
            if (this._gesture === 'twist') {
                // 逐帧累加，转超过半圈也不跳；UI 坐标 y 朝上，手指逆时针（+）→ 地图逆时针（视角角度 −）
                const cur = Math.atan2(b.y - a.y, b.x - a.x);
                this._twistAccum += WorldView.angleDiff(cur, this._twistLast);
                this._twistLast = cur;
                this.setViewAngle(this._twistBase - this._twistAccum);
                return;
            }
            const anchor = this.uiToNode((a.x + b.x) / 2, (a.y + b.y) / 2);
            this.setZoomAround(this._pinchStartZoom * (dist / this._pinchStartDist), anchor.x, anchor.y, this._pinchMapX, this._pinchMapY);
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
        for (const t of event.getTouches()) this._touches.delete(t.getID());
        if (this._touches.size < 2) {
            if (this._gesture === 'twist') this.snapView();
            this._gesture = 'none';
        }
        if (this._touches.size > 0) {
            // 还有手指按着：换基准接着拖 / 捏
            if (wasPinch) { this._velX = 0; this._velY = 0; }
            this.rebaseGesture();
            return;
        }
        // 全部抬起
        if (this._startedOnUI || Date.now() - this._lastMoveAt > 80) { this._velX = 0; this._velY = 0; }
        if (!this._dragged && !this._startedOnUI) {
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
            this._pinchStartDist = Math.hypot(b.x - a.x, b.y - a.y);
            this._pinchStartZoom = this._zoom;
            if (this._gesture !== 'twist') this._twistStartAngle = Math.atan2(b.y - a.y, b.x - a.x);
            const anchor = this.uiToNode((a.x + b.x) / 2, (a.y + b.y) / 2);
            const w = this._world ? this._world.position : Vec3.ZERO;
            this._pinchMapX = (anchor.x - w.x) / this._zoom;
            this._pinchMapY = (anchor.y - w.y) / this._zoom;
        } else {
            this._pinchStartDist = 0;
            const p = this._touches.values().next().value as Vec2 | undefined;
            if (p) { this._lastX = p.x; this._lastY = p.y; }
            this._lastMoveAt = Date.now();
        }
    }

    private firstTwo(): [Vec2, Vec2] {
        const it = this._touches.values();
        return [it.next().value as Vec2, it.next().value as Vec2];
    }

    /** 两个角度之差，落在 (-π, π] */
    private static angleDiff(a: number, b: number): number {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d <= -Math.PI) d += Math.PI * 2;
        return d;
    }

    get viewRotation(): number {
        return this._iso ? this._iso.rot : 0;
    }

    get canRotateView(): boolean {
        return !!this._iso && this._iso.canRotate;
    }

    /** 按钮用：平滑转 90°（dir = 1 顺时针，-1 逆时针）。正在转的话接着它的终点再转一档 */
    rotateView(dir: 1 | -1): void {
        if (!this.canRotateView) return;
        const q = Math.PI / 2;
        const base = this._snap ? this._snap.to : Math.round(this._viewAngle / q) * q;
        this._snap = { from: this._viewAngle, to: base + dir * q, t: 0, dur: 0.35 };
        this._velX = 0; this._velY = 0;
    }

    /** 松手：转到最近的 90° 停稳 */
    private snapView(): void {
        const q = Math.PI / 2;
        const to = Math.round(this._viewAngle / q) * q;
        const dur = 0.1 + 0.25 * Math.abs(to - this._viewAngle) / (q / 2);
        this._snap = { from: this._viewAngle, to, t: 0, dur };
    }

    private stepSnap(dt: number): void {
        const sn = this._snap;
        if (!sn) return;
        sn.t = Math.min(1, sn.t + dt / Math.max(0.01, sn.dur));
        const e = 1 - (1 - sn.t) * (1 - sn.t);           // 先快后慢
        if (sn.t >= 1) { this._snap = null; this.setViewAngle(sn.to); }
        else this.setViewAngle(sn.from + (sn.to - sn.from) * e);
    }

    /**
     * 把视角设到 phi（弧度，顺时针为正）（D031）。
     * 拆成「最近的 90° 档位 rot」+「多出来的 spin」：rot 决定楼用哪张图、地面瓦片换哪一格；
     * spin 让地面节点和所有楼、人车的位置连续地转。屏幕中心那一点始终不动。
     * 停在 90° 整数倍时收尾：重建山 / 树、重画环境图层、放置预览，钉住的中心点放开。
     */
    private setViewAngle(phi: number): void {
        const iso = this._iso, world = this._world;
        if (!iso || !world || !iso.canRotate) return;
        if (!this._spinPivot) {
            const w0 = world.position;
            this._spinPivot = iso.fromLocal(-w0.x / this._zoom, -w0.y / this._zoom);
        }
        const q = Math.PI / 2;
        const k = Math.round(phi / q);
        let spin = phi - k * q;
        if (Math.abs(spin) < 1e-6) spin = 0;
        const rot = ((k % 4) + 4) % 4;
        const rotChanged = rot !== iso.rot;
        iso.rot = rot;
        iso.spin = spin;
        this._viewAngle = spin === 0 ? k * q : phi;
        if (rotChanged && this._map) this._map.redraw();
        if (this._groundSpin) this._groundSpin.angle = -spin * 180 / Math.PI;   // 节点角度逆时针为正

        const [gx, gy] = this._spinPivot;
        const p = iso.toLocal(gx, gy);
        const w = world.position;
        world.setPosition(-p.x * this._zoom, -p.y * this._zoom, w.z);

        if (this._buildings) this._buildings.relayout(spin !== 0);
        if (this._life) this._life.relayout();
        if (spin === 0) {
            this._spinPivot = null;
            this.clampPosition();
            this._hoverCol = -1; this._hoverRow = -1;
            this.refreshGhost();
            if (rotChanged || this.onViewRotated) { if (this.onViewRotated) this.onViewRotated(iso.rot); }
        }
    }

    /** 正在转视角（跟手或动画中）：这时不响应点地图 */
    get rotating(): boolean {
        return this._gesture === 'twist' || !!this._snap || (!!this._iso && this._iso.spin !== 0);
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
        this.syncConstruction(dt);
        this.stepSnap(dt);
        this.stepPan(dt);
        this.updateTrack(dt);
        if (this._touches.size > 0) return;
        const v = Math.hypot(this._velX, this._velY);
        if (v < 8) { this._velX = 0; this._velY = 0; return; }
        dt = Math.min(dt, 0.05);
        this.panBy(this._velX * dt, this._velY * dt);
        const decay = Math.exp(-dt * WorldView.FLING_DECAY);
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
        if (!cell) {
            this.clearGhost();
            return;
        }
        const [col, row] = cell;

        if (this.onCellTapped) this.onCellTapped(col, row);

        if (this._demolishing) {
            this.doDemolish(col, row);
        } else if (this._selected) {
            // 道路一点就铺；其他建筑先出预览，按「确定」才盖（D022）
            if (this._selected.flat) this.doPlace(this._selected, col, row);
            else this.previewAt(this._selected, col, row);
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
        this.refreshGhost();
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
        if (this.onPendingChanged) this.onPendingChanged(p);
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
        this.setPending(null);
        if (ok && !p.def.flat) {
            this._selected = null;
            this.refreshGhost();
            if (this.onBuildingConfirmed) this.onBuildingConfirmed();
        }
        return ok;
    }

    cancelPending(): void {
        this.setPending(null);
    }

    /** 预览上方在 UI 坐标里的位置（确认条跟着它）；没有预览返回 null */
    pendingAnchorUI(out: Vec3): Vec3 | null {
        const p = this._pending, iso = this._iso, world = this._world;
        const trans = this.node.getComponent(UITransform);
        if (!p || !iso || !world || !trans) return null;
        const foot = iso.footBottom(p.col, p.row, p.def.width, p.def.height);
        const frame = this._art.get(`${p.def.id}${iso.frameSuffix(p.facing)}`) ?? this._art.get(p.def.id);
        const h = frame ? this._art.worldSize(frame).height : (p.def.width + p.def.height) * iso.hh;
        const wp = world.position;
        out.set(wp.x + foot.x * this._zoom, wp.y + (foot.y + h) * this._zoom, 0);
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

    /** 拆掉点中的那一栋 */
    private doDemolish(col: number, row: number): void {
        const model = this._model;
        const layer = this._buildings;
        if (!model || !layer) return;

        const removed = model.removeAt(col, row);
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
        const tr = this._tracker;
        const midY = tr ? (tr.insetBottom - tr.insetTop) / 2 : 0;
        this._panTarget = { x: -x * this._zoom, y: midY - y * this._zoom };
        this._velX = 0; this._velY = 0;
    }

    private stepPan(dt: number): void {
        const t = this._panTarget, world = this._world;
        if (!t || !world) return;
        const p = world.position;
        const k = 1 - Math.exp(-dt * 8);
        const nx = p.x + (t.x - p.x) * k, ny = p.y + (t.y - p.y) * k;
        world.setPosition(nx, ny, p.z);
        this.clampPosition();
        const q = world.position;
        // 到了，或者被地图边界卡住走不动了
        if (Math.abs(t.x - q.x) < 1 && Math.abs(t.y - q.y) < 1 || (Math.abs(q.x - nx) > 0.01 || Math.abs(q.y - ny) > 0.01) && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5) {
            this._panTarget = null;
        }
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
        const world = this._world, iso = this._iso;
        if (!world || !iso) return;
        const p = iso.toLocal(col + 0.5, row + 0.5);
        world.setPosition(-p.x * this._zoom, -p.y * this._zoom, 0);
        this.clampPosition();
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
        const cell = this.uiToCell(uiX, uiY);
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
        if (this._pending) {
            // 资金、地块可能变了：按现状重算一遍
            const p = this._pending;
            this.setPending(this.evalPending(p.def, p.col, p.row, p.facing));
        } else if (this._selected && this._hoverCol >= 0) {
            layer.showGhost(this._selected, this._hoverCol, this._hoverRow);
        } else {
            layer.clearGhost();
        }
    }

    private clearGhost(): void {
        this._hoverCol = -1;
        this._hoverRow = -1;
        if (this._pending) return;           // 有预览时不清（鼠标移出地图不该把预览弄没）
        if (this._buildings) this._buildings.clearGhost();
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
        const w = this._world;
        const p = w ? w.position : Vec3.ZERO;
        this.setZoomAround(zoom, 0, 0, -p.x / this._zoom, -p.y / this._zoom);
    }

    /**
     * 缩放并让地图点 (mapX, mapY) 落在本节点坐标 (anchorX, anchorY) 上。
     * 捏合时 anchor 是两指中点、map 点是捏合开始时中点下面的地，所以缩放和平移一起跟手。
     */
    private setZoomAround(zoom: number, anchorX: number, anchorY: number, mapX: number, mapY: number): void {
        const config = this._config;
        const world = this._world;
        if (!config || !world) return;
        const levels = config.zoomLevels;
        const value = Math.max(levels[0], Math.min(levels[levels.length - 1], zoom));

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

        const changed = value !== this._zoom;
        this._zoom = value;
        this.applyTransform();
        world.setPosition(anchorX - mapX * value, anchorY - mapY * value, world.position.z);
        this.clampPosition();
        if (changed && this.onZoomChanged) this.onZoomChanged(this._zoom, this._zoomIndex);
    }

    /** 平移，参数是 UI 坐标下的位移 */
    panBy(dx: number, dy: number): void {
        const world = this._world;
        if (!world) return;
        const p = world.position;
        world.setPosition(p.x + dx, p.y + dy, p.z);
        this.clampPosition();
    }

    private applyTransform(): void {
        if (this._world) {
            this._world.setScale(this._zoom, this._zoom, 1);
        }
    }

    /**
     * 限制拖动范围：地图比屏幕大时，不让边缘被拖进屏幕露出空白；
     * 地图比屏幕小时，直接钉在视口中间。
     */
    private clampPosition(): void {
        const world = this._world;
        const map = this._map;
        if (!world || !map) return;

        const visible = view.getVisibleSize();
        const halfMapW = (map.mapWidth * this._zoom) / 2;
        const halfMapH = (map.mapHeight * this._zoom) / 2;

        // 留一点余量，让玩家看得到地图边缘
        const limitX = Math.max(0, halfMapW - visible.width / 2);
        const limitY = Math.max(0, halfMapH - visible.height / 2);

        const p = world.position;
        const x = Math.max(-limitX, Math.min(limitX, p.x));
        const y = Math.max(-limitY, Math.min(limitY, p.y));
        if (x !== p.x || y !== p.y) {
            world.setPosition(x, y, p.z);
        }
    }
}
