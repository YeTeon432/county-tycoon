import {
    _decorator, Component, Graphics, Layers, Node, UITransform, Color,
} from 'cc';
import { DEFAULT_WORLD_CONFIG, WorldConfig } from '../core/WorldConfig';

const { ccclass } = _decorator;

/**
 * 网格地图的绘制。
 *
 * 现阶段没有美术资源（D003：M2 之前用占位色块），所以整张地图用 Graphics 画出来，
 * 不依赖任何贴图。等正式美术到位后，这里换成按地块铺 Sprite 即可，
 * 对外的 mapWidth / mapHeight / tileSize 接口不用变。
 *
 * 节点自身的坐标原点在地图正中，所以地图范围是 [-w/2, w/2] × [-h/2, h/2]，
 * 缩放和平移都围绕中心做，数学上更省事。
 */
@ccclass('GridMap')
export class GridMap extends Component {
    private _graphics: Graphics | null = null;
    private _config: WorldConfig = DEFAULT_WORLD_CONFIG;

    /** 建一个已经画好网格的地图节点 */
    static create(config: WorldConfig): Node {
        const node = new Node('GridMap');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const map = node.addComponent(GridMap);
        map.build(config);
        return node;
    }

    /** 地图宽度，单位：美术像素（未缩放） */
    get mapWidth(): number {
        return this._config.gridWidth * this._config.tileSize;
    }

    /** 地图高度，单位：美术像素（未缩放） */
    get mapHeight(): number {
        return this._config.gridHeight * this._config.tileSize;
    }

    /** 单个地块边长，单位：美术像素（未缩放） */
    get tileSize(): number {
        return this._config.tileSize;
    }

    build(config: WorldConfig): void {
        this._config = config;

        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform);
        }
        let g = this.node.getComponent(Graphics);
        if (!g) {
            g = this.node.addComponent(Graphics);
        }
        this._graphics = g;

        this.redraw();
    }

    /**
     * 重画整张地图。
     *
     * 全部用"填充矩形"而不是描线：填充出来的边正好落在整数像素上，
     * 放大到 2/3/4 倍也不会出现半像素发虚或线条粗细不匀（D003 的整数倍放大要求）。
     */
    private redraw(): void {
        const g = this._graphics;
        if (!g) return;

        const { tileSize, gridWidth, gridHeight, palette } = this._config;
        const w = this.mapWidth;
        const h = this.mapHeight;
        const left = -w / 2;
        const bottom = -h / 2;

        g.clear();

        // 1. 地面底色
        g.fillColor = new Color().fromHEX(palette.ground);
        g.rect(left, bottom, w, h);
        g.fill();

        // 2. 网格线：1 像素宽的细条，全部塞进一次 fill
        g.fillColor = new Color().fromHEX(palette.gridLine);
        for (let i = 1; i < gridWidth; i++) {
            g.rect(left + i * tileSize, bottom, 1, h);
        }
        for (let j = 1; j < gridHeight; j++) {
            g.rect(left, bottom + j * tileSize, w, 1);
        }
        g.fill();

        // 3. 外框
        g.fillColor = new Color().fromHEX(palette.border);
        const bw = 2;
        g.rect(left, bottom + h - bw, w, bw);       // 上
        g.rect(left, bottom, w, bw);                // 下
        g.rect(left, bottom, bw, h);                // 左
        g.rect(left + w - bw, bottom, bw, h);       // 右
        g.fill();
    }
}
