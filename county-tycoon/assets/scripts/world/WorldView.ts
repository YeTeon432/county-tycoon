import {
    _decorator, Component, EventTouch, EventMouse, input, Input, view, Vec2, Node,
} from 'cc';
import { WorldConfig } from '../core/WorldConfig';
import { GridMap } from './GridMap';

const { ccclass } = _decorator;

/**
 * 地图的平移与缩放。
 *
 * 两个实现取舍：
 *
 * 1. 变换的是"世界容器节点"，不是 Canvas 自带的相机。
 *    Canvas 会在每次尺寸变化时强行复位相机的位置和 orthoHeight，自己挪相机等于跟引擎抢控制权；
 *    而且相机一动，同一台相机下的 UI 会跟着跑，但我们希望 HUD 钉死在屏幕上。
 *    把地图放进容器节点、只动容器，视觉上和"相机平移缩放"完全等价，UI 天然不受影响。
 *
 * 2. 输入监听挂在全局 input 上，不挂在节点上。
 *    节点事件要先做命中测试，得保证节点尺寸和屏幕一致；全局输入直接拿到原始触摸，
 *    在微信、抖音、浏览器三端行为一致，后面 T102 做点选地块时也不受 UI 遮挡影响。
 */
@ccclass('WorldView')
export class WorldView extends Component {
    private _config: WorldConfig | null = null;
    private _world: Node | null = null;
    private _map: GridMap | null = null;

    /** 当前缩放档位在 zoomLevels 里的下标 */
    private _zoomIndex = 0;
    /** 当前缩放倍率 */
    private _zoom = 1;

    /** 双指缩放时记录的初始指距与初始倍率 */
    private _pinchStartDist = 0;
    private _pinchStartZoom = 1;
    /** 是否正在用双指缩放（用来屏蔽单指拖动） */
    private _pinching = false;

    /** 复用的临时向量，避免每帧产生垃圾 */
    private static readonly _vecA = new Vec2();
    private static readonly _vecB = new Vec2();

    /** 缩放变化时的回调，给 HUD 之类的外部模块用 */
    onZoomChanged: ((zoom: number, index: number) => void) | null = null;

    /** 建好地图并接管输入 */
    create(config: WorldConfig): void {
        this._config = config;
        this._zoomIndex = config.defaultZoomIndex;
        this._zoom = config.zoomLevels[this._zoomIndex];

        // 世界容器：地图挂在它下面，平移缩放都作用在它身上
        const world = new Node('World');
        this.node.addChild(world);
        this._world = world;

        const mapNode = GridMap.create(config);
        world.addChild(mapNode);
        this._map = mapNode.getComponent(GridMap);

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

    private registerInput(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        // 滚轮只在桌面浏览器调试时有，真机上不存在
        input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    private onTouchStart(event: EventTouch): void {
        if (event.getAllTouches().length >= 2) {
            this._pinching = true;
            this._pinchStartDist = this.touchDistance(event);
            this._pinchStartZoom = this._zoom;
        } else {
            this._pinching = false;
        }
    }

    private onTouchMove(event: EventTouch): void {
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
            this.panBy(delta.x, delta.y);
        }
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.getAllTouches().length < 2) {
            this._pinching = false;
            this._pinchStartDist = 0;
            // 松手后吸附到最近的档位，保证放大后像素始终落在整数倍上（D003）
            this.setZoom(this._zoom, true);
        }
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
