import { _decorator, Component, Graphics, Layers, Node, UITransform, Color, Rect } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { WorldConfig } from '../core/WorldConfig';
import { hexToColor, shade } from '../core/ColorUtil';

const { ccclass } = _decorator;

/**
 * 把 TownModel 里的建筑画出来，外加"当前能不能放"的预览框。
 *
 * 和 GridMap 一样用 Graphics 纯色块，不依赖贴图（D003：M2 之前全用占位色）。
 * 画法上做了一点区分，让 1×1 和 2×2 一眼能分出来：
 *   - 主体填充建筑自己的颜色
 *   - 顶部一条稍暗的边当"屋檐"
 *   - 内部留 1 像素缝隙，相邻建筑不会糊成一片
 * 全部是整数坐标的矩形，放大到 2/3/4 倍后仍然锐利。
 *
 * 节点原点和 GridMap 一致（地图正中），所以建筑位置直接按地块坐标算。
 */
@ccclass('BuildingLayer')
export class BuildingLayer extends Component {
    private _graphics: Graphics | null = null;
    private _config: WorldConfig | null = null;
    private _model: TownModel | null = null;

    /** 复用的临时颜色，避免每个矩形都 new 一个 */
    private readonly _cMain = new Color();
    private readonly _cRoof = new Color();
    private readonly _cGhostOk = new Color(255, 255, 255, 70);
    private readonly _cGhostBad = new Color(220, 60, 60, 90);
    private readonly _cGhostEdgeOk = new Color(255, 255, 255, 200);
    private readonly _cGhostEdgeBad = new Color(220, 60, 60, 220);

    static create(config: WorldConfig, model: TownModel): Node {
        const node = new Node('BuildingLayer');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const comp = node.addComponent(BuildingLayer);
        comp.setup(config, model);
        return node;
    }

    setup(config: WorldConfig, model: TownModel): void {
        this._config = config;
        this._model = model;
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform);
        }
        let g = this.node.getComponent(Graphics);
        if (!g) g = this.node.addComponent(Graphics);
        this._graphics = g;
        this.redraw();
    }

    /** 建筑增删之后调一次 */
    redraw(): void {
        const g = this._graphics;
        const model = this._model;
        const config = this._config;
        if (!g || !model || !config) return;

        g.clear();

        const list = model.allBuildings();
        for (let i = 0; i < list.length; i++) {
            this.drawBuilding(g, config, list[i]);
        }
    }

    /** 一栋建筑：主体 + 顶部阴影条 + 1 像素内缩，避免相邻建筑粘连 */
    private drawBuilding(g: Graphics, config: WorldConfig, b: PlacedBuilding): void {
        const tile = config.tileSize;
        const w = b.def.width * tile;
        const h = b.def.height * tile;
        const left = this.cellLeft(b.col, config);
        const bottom = this.cellBottom(b.row, config);
        const inset = 1;

        // 主体
        hexToColor(b.def.color, this._cMain);
        g.fillColor = this._cMain;
        g.rect(left + inset, bottom + inset, w - inset * 2, h - inset * 2);
        g.fill();

        // 顶部一条暗色屋檐，让方块有"上面"的方向感
        g.fillColor = shade(this._cMain, 0.72, this._cRoof);
        g.rect(left + inset, bottom + h - inset - tile / 4, w - inset * 2, tile / 4);
        g.fill();
    }

    /**
     * 画放置预览。
     * @param def 当前选中的建筑
     * @param col 鼠标/手指所在的左下角列
     * @param row 同上
     */
    showGhost(def: BuildingDef | null, col: number, row: number): void {
        const g = this._graphics;
        const config = this._config;
        const model = this._model;
        if (!g || !config || !model) return;

        // 先重画已有建筑，再叠预览，避免预览残留
        this.redraw();
        if (!def) return;

        const tile = config.tileSize;
        const w = def.width * tile;
        const h = def.height * tile;
        const left = this.cellLeft(col, config);
        const bottom = this.cellBottom(row, config);
        const ok = model.canPlace(def, col, row);

        // 半透明填充
        g.fillColor = ok ? this._cGhostOk : this._cGhostBad;
        g.rect(left + 1, bottom + 1, w - 2, h - 2);
        g.fill();

        // 四边描一条 2 像素的框，边缘落在整像素上
        g.fillColor = ok ? this._cGhostEdgeOk : this._cGhostEdgeBad;
        const t = 2;
        g.rect(left, bottom, w, t);
        g.rect(left, bottom + h - t, w, t);
        g.rect(left, bottom, t, h);
        g.rect(left + w - t, bottom, t, h);
        g.fill();
    }

    /** 清掉预览（只留建筑） */
    clearGhost(): void {
        this.redraw();
    }

    /** 第 col 列左边界，相对地图中心 */
    private cellLeft(col: number, config: WorldConfig): number {
        return -config.gridWidth * config.tileSize / 2 + col * config.tileSize;
    }

    /** 第 row 行下边界，相对地图中心（屏幕 y 向上） */
    private cellBottom(row: number, config: WorldConfig): number {
        return -config.gridHeight * config.tileSize / 2 + row * config.tileSize;
    }
}
