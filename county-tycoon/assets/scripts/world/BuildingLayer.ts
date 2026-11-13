import { _decorator, Component, Graphics, Layers, Node, UITransform, Color, Sprite, SpriteFrame, Vec2 } from 'cc';
import { BuildingDef } from '../core/BuildingConfig';
import { ArtLibrary } from '../core/ArtLibrary';
import { IsoMath } from '../core/IsoMath';
import { PlacedBuilding, TownModel } from '../core/TownModel';
import { hexToColor, shade } from '../core/ColorUtil';

const { ccclass } = _decorator;

/**
 * 建筑层（等距，D014）。
 *
 * 每栋建筑一个子节点，节点原点 = 占地菱形的最下顶点：
 *   - 有贴图：Sprite，锚点在图的底边中点
 *   - 没贴图：Graphics 画一个等距色块（屋顶 + 左墙 + 右墙），颜色取 buildings.json 的 color
 * 每次重画后按 IsoMath.depth 排兄弟顺序，后面的建筑压住前面的。
 * 贴地的东西（马路，def.flat）不在这里画，交给 GridMap。
 *
 * 放置预览是单独一层 Graphics（Ghost 节点），永远压在最上面。
 */
@ccclass('BuildingLayer')
export class BuildingLayer extends Component {
    private _iso: IsoMath | null = null;
    private _model: TownModel | null = null;
    private _art: ArtLibrary | null = null;

    private _objRoot: Node | null = null;
    private _ghost: Graphics | null = null;
    /** uid -> 节点。重画时只增删有变化的 */
    private readonly _nodes = new Map<number, Node>();
    /** uid -> 节点当前显示的是哪张图（null = 色块）。贴图晚到、朝向变化时据此重建 */
    private readonly _shown = new Map<number, SpriteFrame | null>();
    /** 尺寸不对的图只警告一次 */
    private readonly _warned = new Set<string>();

    private readonly _cMain = new Color();
    private readonly _cTmp = new Color();
    private readonly _cGhostOk = new Color(255, 255, 255, 80);
    private readonly _cGhostBad = new Color(224, 74, 74, 110);
    private readonly _cGhostEdgeOk = new Color(255, 255, 255, 230);
    private readonly _cGhostEdgeBad = new Color(224, 74, 74, 240);

    static create(iso: IsoMath, model: TownModel, art: ArtLibrary): Node {
        const node = new Node('BuildingLayer');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        node.addComponent(BuildingLayer).setup(iso, model, art);
        return node;
    }

    get art(): ArtLibrary | null {
        return this._art;
    }

    /** 测试探针用：按前后顺序排好的建筑节点 */
    get objectRoot(): Node | null {
        return this._objRoot;
    }

    setup(iso: IsoMath, model: TownModel, art: ArtLibrary): void {
        this._iso = iso;
        this._model = model;
        this._art = art;
        this._objRoot = BuildingLayer.makeChild(this.node, 'Objects');
        this._ghost = BuildingLayer.makeChild(this.node, 'Ghost').addComponent(Graphics);
        this.redraw();
    }

    /** 建筑增删、贴图加载完之后调一次 */
    redraw(): void {
        const model = this._model;
        const root = this._objRoot;
        if (!model || !root) return;

        const list = model.allBuildings();
        const alive = new Set<number>();
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.def.flat) continue;
            alive.add(b.uid);
            this.syncNode(b);
        }

        this._nodes.forEach((node, uid) => {
            if (!alive.has(uid)) {
                // destroy 要到帧末才生效，先摘下来，同一帧内再查子节点也是对的
                node.removeFromParent();
                node.destroy();
                this._nodes.delete(uid);
                this._shown.delete(uid);
            }
        });

        this.sortByDepth(list);
    }

    private sortByDepth(list: PlacedBuilding[]): void {
        const sorted = list.filter((b) => !b.def.flat).sort((a, b) =>
            IsoMath.depth(a.col, a.row, a.def.width, a.def.height)
            - IsoMath.depth(b.col, b.row, b.def.width, b.def.height)
            || a.col - b.col);
        for (let i = 0; i < sorted.length; i++) {
            const n = this._nodes.get(sorted[i].uid);
            if (n && n.getSiblingIndex() !== i) n.setSiblingIndex(i);
        }
    }

    /**
     * 门面朝哪边（D015）。等距下只看得到左下墙（朝 +row）和右下墙（朝 +col）：
     *   - 左下边挨着马路 → 默认图（门面在左墙）
     *   - 否则右下边挨着马路 → `<id>_r` 图（门面在右墙）
     *   - 都不挨（马路在背后或没有马路）→ 默认图
     */
    private facesRight(b: PlacedBuilding): boolean {
        const m = this._model!;
        const road = (c: number, r: number) => {
            const x = m.getAt(c, r);
            return !!x && x.def.flat;
        };
        for (let c = b.col; c < b.col + b.def.width; c++) {
            if (road(c, b.row + b.def.height)) return false;
        }
        for (let r = b.row; r < b.row + b.def.height; r++) {
            if (road(b.col + b.def.width, r)) return true;
        }
        return false;
    }

    /** 能用的贴图：要有图，且宽度符合 (w+h)·半宽；朝右的图缺了就用默认图 */
    private usableFrame(def: BuildingDef, right: boolean) {
        const art = this._art;
        const iso = this._iso!;
        const frame = art ? ((right ? art.get(`${def.id}_r`) : null) ?? art.get(def.id)) : null;
        if (!frame) return null;
        const want = (def.width + def.height) * iso.hw;
        const fw = frame.rect.width;
        if (fw !== want) {
            if (!this._warned.has(def.id)) {
                this._warned.add(def.id);
                console.warn(`[BuildingLayer] ${def.id}.png 宽 ${fw}，等距 ${def.width}×${def.height} 应为 ${want}，先用色块`);
            }
            return null;
        }
        return frame;
    }

    private syncNode(b: PlacedBuilding): void {
        const iso = this._iso!;
        const frame = this.usableFrame(b.def, this.facesRight(b));
        let node = this._nodes.get(b.uid);
        if (node && this._shown.get(b.uid) === frame) return;
        if (node) {
            node.removeFromParent();
            node.destroy();
        }

        node = BuildingLayer.makeChild(this._objRoot!, `B${b.uid}_${b.def.id}`);
        const p = iso.footBottom(b.col, b.row, b.def.width, b.def.height);
        node.setPosition(p.x, p.y, 0);

        if (frame) {
            const ui = node.getComponent(UITransform)!;
            ui.setAnchorPoint(new Vec2(0.5, 0));
            ui.setContentSize(frame.rect.width, frame.rect.height);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.trim = false;
            sprite.spriteFrame = frame;
        } else {
            this.drawBlock(node.addComponent(Graphics), b.def);
        }
        this._nodes.set(b.uid, node);
        this._shown.set(b.uid, frame);
    }

    /** 没贴图：等距色块。原点是占地最下顶点，墙高按占地大小给一个合理值 */
    private drawBlock(g: Graphics, def: BuildingDef): void {
        const iso = this._iso!;
        const w = def.width, h = def.height;
        const hw = iso.hw, hh = iso.hh;
        const H = 10 + 6 * Math.max(w, h);
        const B = { x: 0, y: 0 };
        const R = { x: h * hw, y: h * hh };
        const L = { x: -w * hw, y: w * hh };
        const T = { x: (h - w) * hw, y: (w + h) * hh };
        const quad = (pts: { x: number; y: number }[], c: Color) => {
            g.fillColor = c;
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.close();
            g.fill();
        };
        const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + H });

        hexToColor(def.color, this._cMain);
        quad([L, B, up(B), up(L)], shade(this._cMain, 0.85, this._cTmp));
        quad([B, R, up(R), up(B)], shade(this._cMain, 0.65, this._cTmp));
        quad([up(T), up(R), up(B), up(L)], this._cMain);
    }

    /** 放置预览：占地菱形，绿白可放 / 红色不可放 */
    showGhost(def: BuildingDef | null, col: number, row: number): void {
        const g = this._ghost;
        const iso = this._iso;
        const model = this._model;
        if (!g || !iso || !model) return;

        g.clear();
        if (!def) return;

        const ok = model.canPlace(def, col, row);
        const pts = iso.footprint(col, row, def.width, def.height);
        const path = () => {
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.close();
        };
        g.fillColor = ok ? this._cGhostOk : this._cGhostBad;
        path();
        g.fill();
        g.lineWidth = 1.5;
        g.strokeColor = ok ? this._cGhostEdgeOk : this._cGhostEdgeBad;
        path();
        g.stroke();
    }

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
}
