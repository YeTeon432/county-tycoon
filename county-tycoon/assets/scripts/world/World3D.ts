import {
    _decorator, Component, Node, Camera, DirectionalLight, Prefab, resources, instantiate, MeshRenderer, Material,
    Color, Vec3, Quat, director, Layers, gfx, view, utils, Texture2D, Mesh, renderer, SpriteFrame,
} from 'cc';
import { IsoMath } from '../core/IsoMath';
import { TownModel } from '../core/TownModel';

const { ccclass } = _decorator;

/**
 * 真 3D 的地面、楼、山和树（D033，T540c）。
 *
 * **3D 相机跟着 2D 走**：拖动、缩放、转视角仍由 WorldView 的「世界容器平移 + 缩放」和 IsoMath（rot + spin）管，
 * 这里每帧按它们推出一台正交相机，使得地面上任何一点在屏幕上的位置和 2D 算出来的完全一样。
 * 所以点格子、点楼、楼顶气泡、追踪箭头、放置确认条这些按 2D 坐标写的东西都不用改。
 *
 * 坐标：3D 的 X = gx（格子列方向），Z = gy（行方向），Y 朝上，1 单位 = 1 格。
 * 投影：俯角 30°（等距 2:1），水平 1 单位 = hw·√2 个 2D 单位（菱形半宽 16 → 22.6）。
 *
 * 地面：一整张网格，每格一个方块，贴图坐标对到地面图集里那一格菱形的四个顶点（等距投影对平地是线性的，
 * 所以 2D 的菱形图贴回方块上正好还原），不受光，颜色和 2D 完全一样。四邻 mask 按模型坐标数（不再按视角换图）。
 * 楼 / 山 / 树：Blender 导出的 glb（docs/art/3d/export_glb.py），顶点色 + 实时光照，参数见 D033。
 */
@ccclass('World3D')
export class World3D extends Component {
    /** 3D 物体专用的层：场景里的 2D 相机也看 DEFAULT 层，放 DEFAULT 会被它按 2D 的方式再画一遍 */
    static readonly LAYER = 1 << 5;

    private _iso!: IsoMath;
    private _model!: TownModel;
    private _cam!: Camera;
    private _sun!: Node;
    private _root!: Node;
    private _groundNode: Node | null = null;
    private _mats: { lit: Material; emit: Material; ground: Material } | null = null;
    private readonly _prefabs = new Map<string, Prefab>();
    private readonly _missing = new Set<string>();
    /** uid → 楼的节点 */
    private readonly _nodes = new Map<number, { node: Node; key: string }>();
    private readonly _terrain: Node[] = [];
    private _hidden: ReadonlySet<number> = new Set();
    /** 模型、材质都到了 */
    onReady: (() => void) | null = null;
    /** 地面每格用哪一帧（GridMap 按模型坐标算） */
    groundFrame: ((col: number, row: number) => SpriteFrame | null) | null = null;

    static create(iso: IsoMath, model: TownModel, background: Color): World3D {
        Layers.addLayer('World3D', 5);
        const node = new Node('World3D');
        node.layer = World3D.LAYER;
        director.getScene()!.addChild(node);
        const w = node.addComponent(World3D);
        w.init(iso, model, background);
        return w;
    }

    private init(iso: IsoMath, model: TownModel, background: Color): void {
        this._iso = iso;
        this._model = model;
        const g = director.getScene()!.globals;
        // 线性色调映射（= Blender 出图的 Standard；默认 ACES 会把白墙压灰）；灯光是按 2D 图量化拟合的（D033）
        g.postSettings.toneMappingType = 1;
        g.ambient.skyIllum = 70000;
        g.ambient.skyLightingColor = new Color().fromHEX('#8cb4ff');
        g.ambient.groundLightingColor = new Color().fromHEX('#303030');
        // 影子先不开（和 2D 版一致：楼自己院子里的暗部已经烘在顶点色里）。平面投影在运行时开没生效，
        // 要不要落地影子放到 T540g 性能那一步一起定
        g.shadows.enabled = false;

        this._root = this.child(this.node, 'Objects');
        const camNode = this.child(this.node, 'Cam3D');
        const cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.near = 1; cam.far = 400;
        cam.priority = -1;                                   // 先画 3D，2D（行人、气泡、界面）压在上面
        cam.clearFlags = gfx.ClearFlagBit.ALL;
        cam.clearColor = background;
        cam.visibility = World3D.LAYER;
        this._cam = cam;

        this._sun = this.child(this.node, 'Sun');
        const sun = this._sun.addComponent(DirectionalLight);
        sun.illuminance = 100000;
        sun.color = new Color(255, 245, 230, 255);
        sun.visibility = World3D.LAYER;

        resources.load(['models3d/building', 'models3d/emit', 'models3d/ground-unlit'], Material, (err, mats) => {
            if (err) { console.error('[World3D] 材质', err.message); return; }
            const by = (n: string) => mats.find((m) => m.name === n)!;
            this._mats = { lit: by('building'), emit: by('emit'), ground: by('ground-unlit') };
            resources.loadDir('models3d', Prefab, (e2, list) => {
                if (e2) console.error('[World3D] 模型', e2.message);
                for (const p of list ?? []) this._prefabs.set(p.name, p);
                this.redraw();
                if (this.onReady) this.onReady();
            });
        });
    }

    /** 有没有这栋楼的 3D 模型（没有的继续画 2D 图） */
    has(defId: string): boolean {
        return this._prefabs.has(defId);
    }

    get ready(): boolean {
        return !!this._mats && this._prefabs.size > 0;
    }

    /**
     * 相机对齐 2D：worldPos / zoom 是 WorldView 世界容器的位置和倍率，angle 是视角（弧度，顺时针为正）。
     * 屏幕中心对着 2D 地图本地坐标 (−worldPos / zoom) 那一点。
     */
    syncCamera(wx: number, wy: number, zoom: number, angle: number): void {
        const iso = this._iso, cam = this._cam;
        if (!cam) return;
        const [gx, gy] = iso.fromLocal(-wx / zoom, -wy / zoom);
        const yaw = 45 + angle * 180 / Math.PI;
        const q = Quat.fromEuler(new Quat(), -30, yaw, 0);
        const back = Vec3.transformQuat(new Vec3(), new Vec3(0, 0, 1), q);
        cam.node.setRotation(q);
        cam.node.setPosition(gx + back.x * 150, back.y * 150, gy + back.z * 150);
        cam.orthoHeight = view.getVisibleSize().height / 2 / (iso.hw * Math.SQRT2 * zoom);
        // 太阳跟着相机转：光永远从屏幕左上来，四个方向亮暗面一致（同预渲染图）
        this._sun.setRotationFromEuler(-50, yaw + 60, 0);
    }

    /** 施工中的楼藏起来（工地还是 2D 图） */
    setHidden(uids: ReadonlySet<number>): void {
        this._hidden = uids;
        this._nodes.forEach((v, uid) => { const a = !uids.has(uid); if (v.node.active !== a) v.node.active = a; });
    }

    /** 地面、楼、山树全部对一遍（盖楼、拆楼、修路后调） */
    redraw(): void {
        if (!this._mats) return;
        this.buildGround();
        this.syncBuildings();
        this.syncTerrain();
    }

    // ---------------------------------------------------------------- 楼
    private syncBuildings(): void {
        const alive = new Set<number>();
        for (const b of this._model.allBuildings()) {
            if (b.def.flat || !this._prefabs.has(b.def.id)) continue;
            alive.add(b.uid);
            const key = `${b.def.id}|${b.col},${b.row}|${b.facing ?? ''}`;
            const cur = this._nodes.get(b.uid);
            if (cur && cur.key === key) continue;
            if (cur) cur.node.destroy();
            const node = this.place(b.def.id, b.col, b.row, b.def.width, b.def.height, b.facing === 'R' ? 1 : 0);
            if (!node) continue;
            node.active = !this._hidden.has(b.uid);
            this._nodes.set(b.uid, { node, key });
        }
        this._nodes.forEach((v, uid) => { if (!alive.has(uid)) { v.node.destroy(); this._nodes.delete(uid); } });
    }

    /**
     * 摆一个模型。glb 的原点 = 占地的「左下边」角：Blender 里 x = gx、−y = gy，导到 Cocos 后 z = −y_blender，
     * 所以模型原点放在 (col, 0, row + h)。turn = 绕占地中心转几个 90°：1 = 门面从左下（+gy）转到右下（+gx）。
     */
    private place(id: string, col: number, row: number, w: number, h: number, turn: number): Node | null {
        const pf = this._prefabs.get(id);
        if (!pf) {
            if (!this._missing.has(id)) { this._missing.add(id); console.warn(`[World3D] 没有 3D 模型：${id}`); }
            return null;
        }
        const pivot = this.child(this._root, id);
        pivot.setPosition(col + w / 2, 0, row + h / 2);
        pivot.setRotationFromEuler(0, turn * 90, 0);
        const m = instantiate(pf);
        m.setPosition(-w / 2, 0, h / 2);
        pivot.addChild(m);
        m.walk((c) => {
            c.layer = World3D.LAYER;
            const mr = c.getComponent(MeshRenderer);
            if (!mr) return;
            // 子网格 0 受光（顶点色已乘环境光遮蔽），1 招牌 / 灯（不受光，阴面也亮）
            for (let i = 0; i < mr.sharedMaterials.length; i++) mr.setMaterial(i === 1 ? this._mats!.emit : this._mats!.lit, i);
            mr.shadowCastingMode = 0;
        });
        return pivot;
    }

    // ---------------------------------------------------------------- 山、树林（地形上立起来的，规则同 BuildingLayer.syncTerrainObjects）
    private syncTerrain(): void {
        for (const n of this._terrain) n.destroy();
        this._terrain.length = 0;
        const t = this._model.terrain;
        if (!t) return;
        for (let r = 0; r < t.height; r++) {
            for (let c = 0; c < t.width; c++) {
                if (this._model.getAt(c, r)) continue;
                const kind = t.typeAt(c, r);
                const hsh = ((c * 73856093) ^ (r * 19349663)) >>> 0;
                const id = kind === 'mountain' ? `terrain-mountain-${hsh % 3}`
                    : kind === 'forest' ? `terrain-forest-${hsh % 4}`
                        : kind === 'pond' && hsh % 3 === 0 ? 'terrain-pond-lily' : null;
                if (!id) continue;
                const n = this.place(id, c, r, 1, 1, 0);
                if (n) this._terrain.push(n);
            }
        }
    }

    // ---------------------------------------------------------------- 地面
    private buildGround(): void {
        const iso = this._iso, frameOf = this.groundFrame;
        if (!frameOf) return;
        const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
        let tex: Texture2D | null = null;
        for (let r = 0; r < iso.rows; r++) {
            for (let c = 0; c < iso.cols; c++) {
                const f = frameOf(c, r);
                if (!f) continue;
                tex = tex ?? (f.texture as Texture2D);
                const tw = tex.width, th = tex.height, R = f.rect;
                // 菱形四个顶点往中心收 1 像素，免得线性采样采到隔壁帧
                const cx = R.x + R.width / 2, cy = R.y + R.height / 2, k = 1;
                const uv = (x: number, y: number) => {
                    const dx = Math.sign(cx - x) * k, dy = Math.sign(cy - y) * k / 2;
                    uvs.push((x + dx) / tw, (y + dy) / th);
                };
                const i0 = pos.length / 3;
                // 方块四角 → 菱形的上、右、下、左顶点
                pos.push(c, 0, r); uv(cx, R.y);
                pos.push(c + 1, 0, r); uv(R.x + R.width, cy);
                pos.push(c + 1, 0, r + 1); uv(cx, R.y + R.height);
                pos.push(c, 0, r + 1); uv(R.x, cy);
                idx.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
            }
        }
        if (!tex || !this._mats) return;
        const mesh: Mesh = utils.MeshUtils.createMesh({ positions: pos, uvs, indices: idx });
        if (!this._groundNode) {
            this._groundNode = this.child(this.node, 'Ground');
            const mr = this._groundNode.addComponent(MeshRenderer);
            mr.setMaterial(this._mats.ground, 0);
            mr.shadowCastingMode = 0;
        }
        const mr = this._groundNode.getComponent(MeshRenderer)!;
        mr.mesh = mesh;
        mr.getMaterialInstance(0)!.setProperty('mainTexture', tex);
    }

    private child(parent: Node, name: string): Node {
        const n = new Node(name);
        n.layer = World3D.LAYER;
        parent.addChild(n);
        return n;
    }
}
