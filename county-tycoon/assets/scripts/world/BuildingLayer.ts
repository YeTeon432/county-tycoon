import { _decorator, Component, Graphics, Layers, Node, UITransform, Color, Sprite, Vec2 } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { BuildingArt } from '../core/BuildingArt';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { WorldConfig } from '../core/WorldConfig';
import { hexToColor, shade } from '../core/ColorUtil';

const { ccclass } = _decorator;

/**
 * 把 TownModel 里的建筑画出来，外加"当前能不能放"的预览框。
 *
 * 有贴图的建筑用 Sprite，没贴图的回退成色块（D011），两者可以混在一张地图上，
 * 美术画一张接一张，不用等全部画完。
 *
 * 节点结构（后画的压在上面）：
 *   BuildingLayer   Graphics：没贴图的建筑画成色块
 *     ├ Sprites      每栋有贴图的建筑一个子节点，按 uid 复用
 *     └ Ghost        Graphics：放置预览，单独一层，永远压在建筑上面
 *
 * 色块画法：主体 + 顶部暗色"屋檐" + 1 像素内缩，相邻建筑不会糊成一片。
 * 全部是整数坐标，放大到 2/3/4 倍后仍然锐利。
 *
 * 节点原点和 GridMap 一致（地图正中），所以建筑位置直接按地块坐标算。
 */
@ccclass('BuildingLayer')
export class BuildingLayer extends Component {
    private _blocks: Graphics | null = null;
    private _ghost: Graphics | null = null;
    private _spriteRoot: Node | null = null;
    /** uid -> 精灵节点。重画时只增删有变化的，不整批重建 */
    private readonly _spriteNodes = new Map<number, Node>();

    private _config: WorldConfig | null = null;
    private _model: TownModel | null = null;
    private readonly _art = new BuildingArt();

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

    /** 贴图仓库（测试探针用来确认加载了几张） */
    get art(): BuildingArt {
        return this._art;
    }

    setup(config: WorldConfig, model: TownModel): void {
        this._config = config;
        this._model = model;
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform);
        }
        this._blocks = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);

        this._spriteRoot = BuildingLayer.makeChild(this.node, 'Sprites');
        const ghostNode = BuildingLayer.makeChild(this.node, 'Ghost');
        this._ghost = ghostNode.addComponent(Graphics);

        this.redraw();
        // 贴图异步加载，先用色块顶着，加载完再整体重画一次
        this._art.load(() => {
            if (this.isValid) this.redraw();
        });
    }

    /** 建筑增删之后调一次 */
    redraw(): void {
        const g = this._blocks;
        const model = this._model;
        const config = this._config;
        if (!g || !model || !config) return;

        g.clear();

        const list = model.allBuildings();
        const alive = new Set<number>();
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const frame = this._art.get(b.def.id);
            if (frame) {
                alive.add(b.uid);
                this.syncSprite(b, config);
            } else {
                this.drawBlock(g, config, b);
            }
        }

        // 拆掉的建筑：回收它的精灵节点
        this._spriteNodes.forEach((node, uid) => {
            if (!alive.has(uid)) {
                // destroy 要等到帧末才生效，先摘下来，同一帧内再查子节点也是对的
                node.removeFromParent();
                node.destroy();
                this._spriteNodes.delete(uid);
            }
        });
    }

    /** 有贴图的建筑：建或复用一个 Sprite 节点，左下角对齐到地块 */
    private syncSprite(b: PlacedBuilding, config: WorldConfig): void {
        const root = this._spriteRoot;
        if (!root) return;
        let node = this._spriteNodes.get(b.uid);
        if (node) return; // 建筑放下后不会移动，已有就不用动

        const tile = config.tileSize;
        const w = b.def.width * tile;
        const h = b.def.height * tile;
        const frame = this._art.get(b.def.id)!;

        node = BuildingLayer.makeChild(root, `B${b.uid}_${b.def.id}`);
        const ui = node.getComponent(UITransform)!;
        ui.setAnchorPoint(new Vec2(0, 0));
        ui.setContentSize(w, h);
        node.setPosition(this.cellLeft(b.col, config), this.cellBottom(b.row, config), 0);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = frame;

        const tex = frame.texture;
        if (tex.width !== w || tex.height !== h) {
            // 尺寸不对也照样显示（会被拉伸），但提醒一下，多半是导出时缩放没设 100%
            console.warn(`[BuildingLayer] ${b.def.id}.png 是 ${tex.width}×${tex.height}，应为 ${w}×${h}`);
        }
        this._spriteNodes.set(b.uid, node);
    }

    /** 没贴图的建筑：主体 + 顶部阴影条 + 1 像素内缩 */
    private drawBlock(g: Graphics, config: WorldConfig, b: PlacedBuilding): void {
        const tile = config.tileSize;
        const w = b.def.width * tile;
        const h = b.def.height * tile;
        const left = this.cellLeft(b.col, config);
        const bottom = this.cellBottom(b.row, config);
        const inset = 1;

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
        const g = this._ghost;
        const config = this._config;
        const model = this._model;
        if (!g || !config || !model) return;

        g.clear();
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
        if (this._ghost) this._ghost.clear();
    }

    private static makeChild(parent: Node, name: string): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        parent.addChild(node);
        return node;
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
