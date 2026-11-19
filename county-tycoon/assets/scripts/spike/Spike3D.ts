import {
    _decorator, Component, Node, Camera, DirectionalLight, Prefab, resources, instantiate, MeshRenderer, Material,
    Color, Vec3, view, primitives, utils, director, Layers, renderer, gfx, Quat, input, Input, EventTouch,
} from 'cc';

const { ccclass } = _decorator;
const GRASS = '#5a9c41', ROAD = '#44484a';   // 反推的底色：受光后 = 2D 地面图的草 #79da6a、柏油 #5f6a78（T540b）

/**
 * T540a 技术验证：真 3D 楼（D033 草案）。网址带 ?spike3d 时 GameRoot 只建这个，不进游戏。
 * 摆一小片县城（Blender 导出的 glb，顶点色 + 实时光照），正交相机按等距角度看，
 * 横向拖动 = 连续转视角。window.__spike.setAngle(deg) 给无头截图用。
 */
@ccclass('Spike3D')
export class Spike3D extends Component {
    private _pivot!: Node;
    private _yaw = 0;
    private _mat!: Material;
    private _groundMat!: Material;
    private _emitMat!: Material;
    private _grass: MeshRenderer | null = null;
    private _roads: MeshRenderer[] = [];

    /** 地面底色：反推出来的，让受光后正好等于 2D 地面图的颜色（草 #79da6a、柏油 #5f6a78） */
    setGround(grass: string, road: string): void {
        this._grass?.getMaterialInstance(0)!.setProperty('mainColor', new Color().fromHEX(grass));
        for (const r of this._roads) r.getMaterialInstance(0)!.setProperty('mainColor', new Color().fromHEX(road));
    }

    setup(): void {
        const scene = director.getScene()!;
        const g = scene.globals;
        g.ambient.skyIllum = 70000;
        g.ambient.skyLightingColor = new Color().fromHEX('#8cb4ff');   // 阴面偏天蓝，和预渲染图一样（线性色调映射下按楼身平均色拟合，T540b）
        g.ambient.groundLightingColor = new Color().fromHEX('#303030');   // 地面反光暗：楼顶比墙亮，同 Blender（天光只从上来）
        // 色调映射用线性（= Blender 出图的 Standard）。默认的 ACES 会把白墙压灰、颜色洗淡
        g.postSettings.toneMappingType = 1;
        g.shadows.enabled = true;
        g.shadows.type = renderer.scene.ShadowType.ShadowMap;
        g.shadows.shadowColor = new Color(0, 0, 0, 90);

        // 相机支架：pivot 在地图中心，绕 Y 转 = 转视角；相机俯角 30°（等距 2:1）
        this._pivot = new Node('Pivot');
        this.node.addChild(this._pivot);
        const camNode = new Node('Cam3D');
        this._pivot.addChild(camNode);
        const cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        // 和 2D 版 ×3 一样大：一格菱形宽 = 32×3 设计像素，菱形宽对应 √2 个世界单位
        cam.orthoHeight = view.getVisibleSize().height / 2 / (96 / Math.SQRT2);
        cam.near = 0.1; cam.far = 200;
        cam.priority = -1;
        cam.clearFlags = gfx.ClearFlagBit.ALL;
        cam.clearColor = new Color(108, 191, 74, 255);
        cam.visibility = Layers.Enum.DEFAULT;
        const pitch = 30, dist = 50;
        camNode.setRotationFromEuler(-pitch, 45, 0);
        const back = new Vec3(0, 0, dist);
        Vec3.transformQuat(back, back, camNode.rotation);
        camNode.setPosition(back);

        // 太阳：跟着相机转（光永远从屏幕左上来，和预渲染图一致）
        const sunNode = new Node('Sun');
        this._pivot.addChild(sunNode);
        sunNode.setRotationFromEuler(-50, 45 + 60, 0);
        const sun = sunNode.addComponent(DirectionalLight);
        sun.illuminance = 100000;
        sun.color = new Color(255, 245, 230, 255);
        sun.shadowEnabled = true;
        (sun as any).shadowFixedArea = true;
        (sun as any).shadowNear = 0.1; (sun as any).shadowFar = 60;
        (sun as any).shadowOrthoSize = 8;
        (sun as any).shadowPcf = 2;

        // 材质用资源文件（.mtl）：新渲染管线只编项目里引用到的 effect，代码里 new 出来的找不到
        resources.load(['models3d/building', 'models3d/ground', 'models3d/emit'], Material, (err, mats) => {
            if (err) { console.error('[spike] 材质', err.message); return; }
            this._mat = mats.find((m) => m.name === 'building')!;
            this._groundMat = mats.find((m) => m.name === 'ground')!;
            this._emitMat = mats.find((m) => m.name === 'emit')!;
            const one = /[?&]one=([\w-]+)/.exec(location.search);
            if (one) {                       // 单栋对比：楼放原点，镜头对准占地中心，和预渲染图同一个角度
                cam.orthoHeight = 2.4;
                cam.clearColor = new Color(255, 255, 255, 255);
                this.place(one[1], 0, 0, 0);
                this._pivot.setPosition(1, 0.6, -1);
                return;
            }
            this.ground();
            this.town();
        });

        input.on(Input.EventType.TOUCH_MOVE, (e: EventTouch) => this.setAngle(this._yaw - e.getDelta().x * 0.4), this);
        // 调光用：__spike.light(太阳照度, 天光照度, 天光色 hex, 地面反光色 hex)
        const light = (sunLux: number, skyLux: number, sky: string, gnd: string) => {
            sun.illuminance = sunLux; g.ambient.skyIllum = skyLux;
            g.ambient.skyLightingColor = new Color().fromHEX(sky);
            g.ambient.groundLightingColor = new Color().fromHEX(gnd);
        };
        (window as any).__spike = { setAngle: (d: number) => this.setAngle(d), node: this.node, light, tm: (t: number) => { g.postSettings.toneMappingType = t; }, ground: (grass: string, road: string) => this.setGround(grass, road), bg: (hex: string) => { cam.clearColor = new Color().fromHEX(hex); } };
    }

    setAngle(deg: number): void {
        this._yaw = deg;
        this._pivot.setRotationFromEuler(0, deg, 0);
    }

    /** 草地 + 一条丁字路（先用纯色块代替贴图） */
    private ground(): void {
        const plane = (x: number, z: number, w: number, d: number, c: Color, y = 0) => {
            const n = new Node('g');
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = utils.MeshUtils.createMesh(primitives.plane({ width: w, length: d, widthSegments: 1, lengthSegments: 1 }));
            mr.material = this._groundMat;
            mr.getMaterialInstance(0)!.setProperty('mainColor', c);
            mr.receiveShadow = 1;
            n.setPosition(x, y, z);
            this.node.addChild(n);
            return mr;
        };
        this._grass = plane(0, 0, 40, 40, new Color(108, 191, 74, 255));
        this._roads.push(plane(0, 1.5, 14, 1, new Color(85, 88, 94, 255), 0.005));     // 横路（沿 x）
        this._roads.push(plane(0.5, -2.5, 1, 7, new Color(85, 88, 94, 255), 0.006));   // 竖路（沿 z）
        this.setGround(GRASS, ROAD);
    }

    /** 照着截图摆一小片：楼的占地 (col,row) 左上角，Blender x → Cocos x，Blender y → Cocos -z（导出器已转好） */
    private town(): void {
        const items: [string, number, number, number][] = [   // 名字、x、z、朝向（绕 Y 转几个 90°）
            ['supermarket', 1, -2, 0], ['hotpot', 1, -4.5, 0], ['apartment', -2, -4.5, 0], ['supermarket', -2.5, -1.5, 1],
            ['house', -3, 2, 0], ['milk-tea', -1.5, 2, 0], ['clinic', 1.5, 2, 0], ['bank', 3, 2, 0],
            ['net-cafe', 0, 2, 0], ['tree', -1, 0, 0], ['tree', 3.5, -1, 0], ['terrain-forest-1', 4, 4, 0], ['villa', -5, -2, 0],
        ];
        for (const [name, x, z, turn] of items) this.place(name, x, z, turn);
    }

    private place(name: string, x: number, z: number, turn: number): void {
        resources.load(`models3d/${name}/${name}`, Prefab, (err, pf) => {
            if (err) { console.error('[spike]', name, err.message); return; }
            const n = instantiate(pf);
            n.walk((c) => {
                const mr = c.getComponent(MeshRenderer);
                if (!mr) return;
                // 子网格 0 受光（顶点色已乘环境光遮蔽），1 招牌 / 灯（不受光，阴面也亮）
                for (let i = 0; i < mr.sharedMaterials.length; i++) mr.setMaterial(i === 1 ? this._emitMat : this._mat, i);
                mr.shadowCastingMode = 1; mr.receiveShadow = 1;
            });
            const holder = new Node(name);
            holder.addChild(n);
            holder.setPosition(x, 0, z);
            holder.setRotation(Quat.fromEuler(new Quat(), 0, turn * 90, 0));
            this.node.addChild(holder);
        });
    }
}
