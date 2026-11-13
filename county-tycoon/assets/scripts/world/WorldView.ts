import {
    _decorator, Component, EventTouch, EventMouse, input, Input, view, Vec2, Node, Vec3, UITransform,
} from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { InputGuard } from '../core/InputGuard';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { WorldConfig } from '../core/WorldConfig';
import { ArtLibrary } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { BuildingLayer } from './BuildingLayer';
import { GridMap } from './GridMap';
import { LifeLayer } from './LifeLayer';

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
@ccclass('WorldView')
export class WorldView extends Component {
    private _config: WorldConfig | null = null;
    private _world: Node | null = null;
    private _map: GridMap | null = null;
    private _buildings: BuildingLayer | null = null;
    private _life: LifeLayer | null = null;
    private _model: TownModel | null = null;
    private _iso: IsoMath | null = null;
    private readonly _art = new ArtLibrary();

    /** 当前缩放档位在 zoomLevels 里的下标 */
    private _zoomIndex = 0;
    /** 当前缩放倍率 */
    private _zoom = 1;

    /** 双指缩放时记录的初始指距与初始倍率 */
    private _pinchStartDist = 0;
    private _pinchStartZoom = 1;
    /** 是否正在用双指缩放（用来屏蔽单指拖动） */
    private _pinching = false;

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

    /** 判定"点击"的最大位移，单位是 UI 像素。手指在真机上抖一两个像素很正常 */
    private static readonly TAP_SLOP = 12;

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
    /** 放置失败（资金不够等）时的提示 */
    onPlaceRejected: ((def: BuildingDef, reason: string) => void) | null = null;
    /** 空手点了一栋建筑（道路除外） */
    onBuildingTapped: ((uid: number) => void) | null = null;
    /** 放置/拆除之后的通知，给 HUD 刷新计数用 */
    onTownChanged: (() => void) | null = null;

    /** 建好地图并接管输入 */
    create(config: WorldConfig, model: TownModel): void {
        this._config = config;
        this._model = model;
        this._zoomIndex = config.defaultZoomIndex;
        this._zoom = config.zoomLevels[this._zoomIndex];

        // 世界容器：地图挂在它下面，平移缩放都作用在它身上
        const world = new Node('World');
        this.node.addChild(world);
        this._world = world;

        const iso = new IsoMath(config);
        this._iso = iso;

        const mapNode = GridMap.create(config, iso, model, this._art);
        world.addChild(mapNode);
        this._map = mapNode.getComponent(GridMap);

        // 建筑层压在地面之上
        const buildingNode = BuildingLayer.create(iso, model, this._art);
        world.addChild(buildingNode);
        this._buildings = buildingNode.getComponent(BuildingLayer);

        // 行人、车、金币：人和车挂进建筑层一起排序，金币飘在最上面
        const lifeNode = LifeLayer.create(iso, model, this._art, this._buildings!);
        world.addChild(lifeNode);
        this._life = lifeNode.getComponent(LifeLayer);

        // 贴图异步加载，先用色块顶着，加载完两层各重画一次
        this._art.load(() => {
            if (!this.isValid) return;
            this.redrawTown();
        });

        this._world.setPosition(0, 0, 0);
        this.applyTransform();

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
        if (this._buildings) this._buildings.redraw();
        if (this._life) this._life.onTownChanged();
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
        this.refreshGhost();
    }

    /** 切到拆除模式（同时清空选中的建筑） */
    setDemolishMode(on: boolean): void {
        this._demolishing = on;
        if (on) this._selected = null;
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
    }

    private onTouchStart(event: EventTouch): void {
        const loc = event.getUILocation();
        this._startedOnUI = InputGuard.isBlocked(loc.x, loc.y);

        if (event.getAllTouches().length >= 2) {
            this._pinching = true;
            this._pinchStartDist = this.touchDistance(event);
            this._pinchStartZoom = this._zoom;
            // 双指开始就作废点击，免得缩放完松手误放一个建筑
            this._dragged = true;
        } else {
            this._pinching = false;
            this._dragDist = 0;
            this._dragged = false;
        }
    }

    private onTouchMove(event: EventTouch): void {
        // UI 上的手势交给 UI 自己处理
        if (this._startedOnUI) return;

        if (event.getAllTouches().length >= 2 || this._pinching) {
            // 双指：只缩放，不平移，避免两个手势互相打架
            const dist = this.touchDistance(event);
            if (this._pinchStartDist > 0 && dist > 0) {
                this.setZoom(this._pinchStartZoom * (dist / this._pinchStartDist), false);
            }
            return;
        }

        // 单指：拖动地图
        const delta = event.getUIDelta();
        if (delta.x !== 0 || delta.y !== 0) {
            this._dragDist += Math.hypot(delta.x, delta.y);
            if (this._dragDist > WorldView.TAP_SLOP) {
                this._dragged = true;
                this.panBy(delta.x, delta.y);
            }
        }
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.getAllTouches().length < 2) {
            const wasPinching = this._pinching;
            this._pinching = false;
            this._pinchStartDist = 0;
            // 松手后吸附到最近的档位，保证放大后像素始终落在整数倍上（D003）
            if (wasPinching) this.setZoom(this._zoom, true);
        }

        // 点击：没拖动过、也没落在 UI 上，才当成玩家想动这一格
        if (!this._dragged && !this._startedOnUI) {
            const loc = event.getUILocation();
            this.tapAt(loc.x, loc.y);
        }

        this._dragged = false;
        this._dragDist = 0;
        this._startedOnUI = false;
    }

    /** 屏幕/UI 坐标 → 地块坐标 → 交给上层处理 */
    private tapAt(uiX: number, uiY: number): void {
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
            this.doPlace(this._selected, col, row);
        } else {
            // 没选建筑也没开拆除：点中建筑交给界面打开详情（换朝向改成详情里的按钮），点空地什么都不做
            const b = this._model ? this._model.getAt(col, row) : null;
            if (b && !b.def.flat && this.onBuildingTapped) this.onBuildingTapped(b.uid);
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

    /** 在当前手指/鼠标位置放一栋建筑 */
    private doPlace(def: BuildingDef, col: number, row: number): void {
        const model = this._model;
        const layer = this._buildings;
        if (!model || !layer) return;

        const placed = model.place(def, col, row);
        if (!placed) {
            // 放不下（越界或已占用）：给一点反馈，但不弹窗打断操作
            console.log(`[WorldView] ${def.name} 放不下：(${col}, ${row})`);
            return;
        }
        if (this.onBuilt && !this.onBuilt(placed)) {
            model.removeAt(col, row);
            if (this.onPlaceRejected) this.onPlaceRejected(def, '建设资金不够');
            return;
        }
        this.redrawTown();
        if (this.onTownChanged) this.onTownChanged();
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

    /** 按钮用：放大 / 缩小一档 */
    zoomStep(delta: number): void {
        const config = this._config;
        if (!config) return;
        const levels = config.zoomLevels;
        const next = Math.max(0, Math.min(levels.length - 1, this._zoomIndex + delta));
        if (next === this._zoomIndex) return;
        this._zoomIndex = next;
        this.setZoom(levels[next], false);
    }

    get zoomIndex(): number {
        return this._zoomIndex;
    }

    private onMouseWheel(event: EventMouse): void {
        const scrollY = event.getScrollY();
        if (scrollY === 0 || !this._config) return;
        const levels = this._config.zoomLevels;
        // 滚轮一格换一档，不做连续缩放
        const next = scrollY > 0 ? this._zoomIndex + 1 : this._zoomIndex - 1;
        this._zoomIndex = Math.max(0, Math.min(levels.length - 1, next));
        this.setZoom(levels[this._zoomIndex], false);
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
        if (this._selected && this._hoverCol >= 0) {
            layer.showGhost(this._selected, this._hoverCol, this._hoverRow);
        } else {
            layer.clearGhost();
        }
    }

    private clearGhost(): void {
        this._hoverCol = -1;
        this._hoverRow = -1;
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

    /** 两指之间的距离，用 UI 坐标，与设备分辨率无关 */
    private touchDistance(event: EventTouch): number {
        const touches = event.getAllTouches();
        if (touches.length < 2) return 0;
        const a = touches[0].getUILocation(WorldView._vecA);
        const b = touches[1].getUILocation(WorldView._vecB);
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    /**
     * 设置缩放倍率。
     * @param zoom 目标倍率
     * @param snap true 表示吸附到配置里的整数倍档位
     */
    setZoom(zoom: number, snap: boolean): void {
        const config = this._config;
        if (!config) return;

        const levels = config.zoomLevels;

        // 倍率限制在配置的区间内
        let value = Math.max(levels[0], Math.min(levels[levels.length - 1], zoom));

        if (snap) {
            let best = 0;
            let bestGap = Infinity;
            for (let i = 0; i < levels.length; i++) {
                const gap = Math.abs(levels[i] - value);
                if (gap < bestGap) {
                    bestGap = gap;
                    best = i;
                }
            }
            this._zoomIndex = best;
            value = levels[best];
        } else {
            // 连续缩放时同步下标，滚轮切换档位时用得到
            let nearest = 0;
            let gap = Infinity;
            for (let i = 0; i < levels.length; i++) {
                const d = Math.abs(levels[i] - value);
                if (d < gap) { gap = d; nearest = i; }
            }
            this._zoomIndex = nearest;
        }

        if (value === this._zoom) {
            this.clampPosition();
            return;
        }

        this._zoom = value;
        this.applyTransform();
        this.clampPosition();

        if (this.onZoomChanged) {
            this.onZoomChanged(this._zoom, this._zoomIndex);
        }
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
