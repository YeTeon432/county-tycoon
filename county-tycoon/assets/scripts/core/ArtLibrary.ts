import { ImageAsset, JsonAsset, Rect, Size, SpriteFrame, Texture2D, Vec2, resources } from 'cc';

/**
 * 贴图仓库：建筑图按 id 找，地面图按帧号找；找不到返回 null，由调用方回退到色块。
 *
 * 目录约定（D013 / D014 / D016）：
 *   - art/atlas.png + art/atlas-frames.json  全部建筑图打成的一张图集（docs/art/gen/pack.py 生成），
 *     帧名 = 建筑 id（朝右的版本是 <id>_r），宽必须是 (w+h)·16
 *   - art/buildings/<id>.png  可选：散图，同名时覆盖图集里的那帧，方便手改一张图直接试
 *   - art/ground/ground.png   地面图集，每帧 32×16 横排：0~3 草地，4+mask 城市道路，20+mask 土路（mask 见 GridMap）
 *
 * 过滤方式由代码定：加载原始 ImageAsset，自建 Texture2D，无 mipmap / Clamp，不进动态合图。
 *   - 倍率 1（像素图）：最近邻，保证像素锐利
 *   - 倍率 > 1（D021 起的 3D 渲染图，4 倍分辨率）：线性过滤
 * 导入面板里的 Filter Mode 改不改都不影响游戏。
 *
 * 倍率（D021）：json 里的 "scale" = 一个世界单位对应几个贴图像素（缺省 1）。
 * 贴图在世界里的尺寸 = 贴图像素 / 倍率，调用方一律用 worldSize() 取，不要直接用 rect。
 * 单帧可以有自己的倍率：frames 里写 [x, y, w, h, 倍率]（D023：人车 8 倍，脸在手机上才看得清）。
 * 地面 json 还可以给 frameWidth / frameHeight（缺省 32×16·倍率），帧按网格从左到右、从上到下排。
 */
const BUILDING_DIR = 'art/buildings';
const BUILDING_ATLAS = 'art/atlas';
const BUILDING_ATLAS_FRAMES = 'art/atlas-frames';
/** T424 点楼蒙版（docs/art/3d/hitmask.py 生成）：每帧一张「哪里有画面」的位图，可选 */
const BUILDING_HITMASK = 'art/atlas-hitmask';

/** atlas-hitmask.json：每帧 [宽格数, 高格数, base64 位图] */
interface HitMaskMeta { cell?: number; frames?: Record<string, [number, number, string]> }

/** 一帧的点击蒙版：w×h 格，一格 = 图集里 cell×cell 像素；bits 逐行，每行 rb 字节，高位在左 */
interface HitMask { w: number; h: number; rb: number; cell: number; bits: Uint8Array }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** 小游戏环境不一定有 atob，自己解 */
function decodeBase64(s: string): Uint8Array {
    const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
    const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
    let n = 0, buf = 0, bitsIn = 0;
    for (let i = 0; i < clean.length; i++) {
        buf = (buf << 6) | B64.indexOf(clean[i]);
        bitsIn += 6;
        if (bitsIn >= 8) { bitsIn -= 8; out[n++] = (buf >> bitsIn) & 0xff; }
    }
    return n === out.length ? out : out.subarray(0, n);
}
const GROUND_ATLAS = 'art/ground/ground';
const GROUND_FRAMES = 'art/ground/ground-frames';

export const GROUND_GRASS_FRAMES = 4;
/** 各种道路在地面图集里的起始帧，后面紧跟 16 种拼接（docs/art/gen/ground.py） */
export const GROUND_ROAD_BASE: Record<'city' | 'dirt', number> = { city: 4, dirt: 20 };
export const GROUND_FRAME_COUNT = 36;
/**
 * 有地形（T322）时地面帧的总数。
 * 0～35 是原来的草地 / 道路，36 起是支线 C 加的地形帧：
 *   36~51 水（36 + mask，mask = 四邻**是陆地**的位，有岸）
 *   52 桥面 gx（连左上↔右下）  53 桥面 gy（连右上↔左下）
 *   54~56 山  57~58 矿点  59~62 树林  63~64 农田  65 池塘
 */
export const GROUND_FRAME_COUNT_TERRAIN = 69;

/** atlas-frames.json：第一张图集的帧 + 其余几张（D031 背面图） */
interface AtlasMeta {
    scale?: number;
    frames?: Record<string, number[]>;
    pages?: { image?: string; frames?: Record<string, number[]> }[];
}

export class ArtLibrary {
    private readonly _buildings = new Map<string, SpriteFrame>();
    private _ground: SpriteFrame[] = [];
    /** 帧名 → 帧号，来自 art/ground/ground-frames.json。地形按名字取帧，不认帧号 */
    private _groundNames = new Map<string, number>();
    private _loaded = false;
    /** 建筑图集的倍率（贴图像素 / 世界单位） */
    private _scale = 1;
    /** 单帧倍率（atlas-frames.json 里第 5 个数）；没写的帧用图集倍率。人车是 8 倍，建筑 4 倍 */
    private readonly _frameScale = new Map<SpriteFrame, number>();
    /** 帧 → 点击蒙版（T424）；没有蒙版的帧（散图、人车）调用方自己退回按矩形判定 */
    private readonly _hitMask = new Map<SpriteFrame, HitMask>();
    private _maskMeta: HitMaskMeta | null = null;

    /** 已加载的建筑图数量（调试 / 测试用） */
    get count(): number {
        return this._buildings.size;
    }

    get groundFrameCount(): number {
        return this._ground.length;
    }

    get loaded(): boolean {
        return this._loaded;
    }

    /** 建筑 / 角色贴图的倍率：贴图像素 / 世界单位（D021 起是 4） */
    get scale(): number {
        return this._scale;
    }

    /** 一张建筑 / 角色贴图在世界里的宽高（贴图像素 ÷ 倍率） */
    worldSize(frame: SpriteFrame): { width: number; height: number } {
        const k = this._frameScale.get(frame) ?? this._scale;
        return { width: frame.rect.width / k, height: frame.rect.height / k };
    }

    /** 这一帧有没有点击蒙版 */
    hasHitMask(frame: SpriteFrame): boolean {
        return this._hitMask.has(frame);
    }

    /**
     * 点击蒙版查一点（T424）。x 从图左边量、y 从图**底边**往上量，单位是世界单位（同 worldSize）。
     * 图外返回 false；没有蒙版返回 null（调用方退回按矩形）。
     */
    opaqueAt(frame: SpriteFrame, x: number, y: number): boolean | null {
        const m = this._hitMask.get(frame);
        if (!m) return null;
        const k = (this._frameScale.get(frame) ?? this._scale) / m.cell;   // 世界单位 → 蒙版格
        const gx = Math.floor(x * k), gy = m.h - 1 - Math.floor(y * k);
        if (gx < 0 || gx >= m.w || gy < 0 || gy >= m.h) return false;
        return (m.bits[gy * m.rb + (gx >> 3)] & (0x80 >> (gx & 7))) !== 0;
    }

    /** 某个建筑的贴图；没有图就是 null */
    get(id: string): SpriteFrame | null {
        return this._buildings.get(id) ?? null;
    }

    /** 地面图集的第 index 帧；图集没加载到就是 null */
    ground(index: number): SpriteFrame | null {
        return this._ground[index] ?? null;
    }

    /**
     * 按名字取地面帧（T322）。名字 → 帧号的映射来自 art/ground/ground-frames.json，
     * 由支线 C 维护；代码这边只认名字，美术加帧、调顺序都不用改代码。
     * 名字不存在时返回 null，调用方自己回退。
     */
    groundByName(name: string): SpriteFrame | null {
        const i = this._groundNames.get(name);
        if (i === undefined) return null;
        return this._ground[i] ?? null;
    }

    /** 地面帧名有没有加载到（没加载到时 GridMap 退回按帧号取） */
    get hasGroundNames(): boolean {
        return this._groundNames.size > 0;
    }

    /** 加载全部贴图。全部结束（无论成败）后回调一次；单张坏了只跳过那一张 */
    load(onDone: () => void): void {
        const infos = resources.getDirWithPath(BUILDING_DIR, ImageAsset);
        const hasGround = !!resources.getInfoWithPath(GROUND_ATLAS, ImageAsset);
        const hasGroundFrames = !!resources.getInfoWithPath(GROUND_FRAMES, JsonAsset);
        const hasAtlas = !!resources.getInfoWithPath(BUILDING_ATLAS, ImageAsset)
            && !!resources.getInfoWithPath(BUILDING_ATLAS_FRAMES, JsonAsset);
        const hasMask = hasAtlas && !!resources.getInfoWithPath(BUILDING_HITMASK, JsonAsset);
        let pending = infos.length + (hasGround ? 1 : 0) + (hasGroundFrames ? 1 : 0) + (hasAtlas ? 1 : 0);

        const finish = () => {
            pending--;
            if (pending <= 0) {
                this.applyHitMask();
                this._loaded = true;
                console.log(`[ArtLibrary] 建筑图 ${this._buildings.size} 张，地面帧 ${this._ground.length} 个`);
                onDone();
            }
        };
        if (pending === 0) {
            pending = 1;
            finish();
            return;
        }

        // 先图集，散图后覆盖：散图回调里直接 set，图集回调里只补没有的
        if (hasAtlas) {
            resources.load(BUILDING_ATLAS_FRAMES, JsonAsset, (e1, json) => {
                resources.load(BUILDING_ATLAS, ImageAsset, (e2, image) => {
                    const meta = json && json.json ? (json.json as AtlasMeta) : null;
                    const frames = meta ? meta.frames : null;
                    if (e1 || e2 || !image || !frames) {
                        console.warn('[ArtLibrary] 建筑图集加载失败，用色块代替', e1 || e2);
                    } else {
                        this._scale = ArtLibrary.validScale(meta!.scale);
                        this.addFrames(ArtLibrary.makeTexture(image, this._scale), frames);
                        // D031：背面图在后面几张图集里（视角转到背面才用）
                        for (const page of meta!.pages ?? []) {
                            if (!page || !page.image || !page.frames) continue;
                            pending++;
                            resources.load(page.image, ImageAsset, (e3, img) => {
                                if (e3 || !img) console.warn(`[ArtLibrary] ${page.image} 加载失败，背面用正面图代替`, e3);
                                else this.addFrames(ArtLibrary.makeTexture(img, this._scale), page.frames!);
                                finish();
                            });
                        }
                    }
                    if (hasMask) this.loadHitMask(finish); else finish();
                });
            });
        }

        for (const info of infos) {
            const path = info.path;
            const id = path.substring(path.lastIndexOf('/') + 1);
            resources.load(path, ImageAsset, (err, image) => {
                if (err || !image) {
                    console.warn(`[ArtLibrary] ${path} 加载失败，用色块代替`, err);
                } else {
                    // 散图和图集同一倍率（图集先加载完才有准；散图只用来临时试图）
                    this._buildings.set(id, ArtLibrary.makePixelFrame(ArtLibrary.makeTexture(image, this._scale)));
                }
                finish();
            });
        }

        // 地面：先读帧名表（里面有倍率和帧尺寸），再切图
        const loadGroundImage = (scale: number, fw: number, fh: number) => {
            resources.load(GROUND_ATLAS, ImageAsset, (err, image) => {
                if (err || !image) {
                    console.warn('[ArtLibrary] 地面图集加载失败，用色块代替', err);
                } else {
                    this._ground = ArtLibrary.slice(image, fw, fh, scale);
                }
                finish();
            });
        };
        if (hasGroundFrames) {
            resources.load(GROUND_FRAMES, JsonAsset, (err, json) => {
                let scale = 1, fw = 32, fh = 16;
                if (err || !json || !json.json) {
                    console.warn('[ArtLibrary] ground-frames.json 加载失败，地形退回按帧号取', err);
                } else {
                    const meta = json.json as { frames?: Record<string, number>; scale?: number; frameWidth?: number; frameHeight?: number };
                    scale = ArtLibrary.validScale(meta.scale);
                    fw = Number(meta.frameWidth) > 0 ? Number(meta.frameWidth) : 32 * scale;
                    fh = Number(meta.frameHeight) > 0 ? Number(meta.frameHeight) : 16 * scale;
                    if (meta.frames) {
                        for (const name of Object.keys(meta.frames)) {
                            const i = Number(meta.frames[name]);
                            if (Number.isFinite(i)) this._groundNames.set(name, i);
                        }
                    }
                }
                finish();
                if (hasGround) loadGroundImage(scale, fw, fh);
            });
        } else if (hasGround) {
            loadGroundImage(1, 32, 16);
        }
    }

    /** 一张图集里的帧登记进来；散图已经占了的名字不覆盖 */
    private addFrames(tex: Texture2D, frames: Record<string, number[]>): void {
        for (const id of Object.keys(frames)) {
            const [x, y, w, h, k] = frames[id];
            if (this._buildings.has(id)) continue;
            const f = ArtLibrary.rectFrame(tex, x, y, w, h);
            if (Number(k) > 0) this._frameScale.set(f, Number(k));
            this._buildings.set(id, f);
        }
    }

    /** 读点击蒙版（只读进来，等全部图集帧登记完再在 applyHitMask 里配对）；读不到就算了（点楼退回按矩形） */
    private loadHitMask(done: () => void): void {
        resources.load(BUILDING_HITMASK, JsonAsset, (err, json) => {
            const meta = !err && json && json.json ? (json.json as HitMaskMeta) : null;
            if (!meta || !meta.frames) console.warn('[ArtLibrary] 点楼蒙版加载失败，点楼按矩形判定', err);
            else this._maskMeta = meta;
            done();
        });
    }

    /** 蒙版和帧配对。背面图集（D031 pages）是异步加载的，所以放到全部加载完再做 */
    private applyHitMask(): void {
        const meta = this._maskMeta;
        this._maskMeta = null;
        if (!meta || !meta.frames) return;
        const cell = Number(meta.cell) > 0 ? Number(meta.cell) : 4;
        for (const id of Object.keys(meta.frames)) {
            const f = this._buildings.get(id);
            const [w, h, b64] = meta.frames[id];
            if (!f || !(w > 0) || !(h > 0)) continue;
            // 散图覆盖了图集帧时尺寸对不上，不用这张蒙版
            if (Math.ceil(f.rect.width / cell) !== w || Math.ceil(f.rect.height / cell) !== h) continue;
            this._hitMask.set(f, { w, h, rb: (w + 7) >> 3, cell, bits: decodeBase64(b64) });
        }
        console.log(`[ArtLibrary] 点楼蒙版 ${this._hitMask.size} 张`);
    }

    /** 图集按网格切成等大的帧（从左到右、从上到下），共用同一张纹理（同纹理的精灵能合批，整片地面一次绘制） */
    private static slice(image: ImageAsset, fw: number, fh: number, scale: number): SpriteFrame[] {
        const tex = ArtLibrary.makeTexture(image, scale);
        const cols = Math.floor(image.width / fw);
        const rows = Math.floor(image.height / fh);
        const frames: SpriteFrame[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) frames.push(ArtLibrary.rectFrame(tex, c * fw, r * fh, fw, fh));
        }
        return frames;
    }

    private static validScale(v: unknown): number {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : 1;
    }

    /** 图集里的一块。坐标原点左上，和 PIL / pack.py 一致 */
    private static rectFrame(tex: Texture2D, x: number, y: number, w: number, h: number): SpriteFrame {
        const f = new SpriteFrame();
        f.reset({
            texture: tex,
            rect: new Rect(x, y, w, h),
            originalSize: new Size(w, h),
            offset: new Vec2(0, 0),
        });
        f.packable = false;
        return f;
    }

    /** 倍率 1 是像素图：最近邻；倍率 > 1 是高分辨率渲染图：线性。都无 mipmap、边缘 Clamp */
    static makeTexture(image: ImageAsset, scale: number): Texture2D {
        const tex = new Texture2D();
        tex.image = image;
        const f = scale > 1 ? Texture2D.Filter.LINEAR : Texture2D.Filter.NEAREST;
        tex.setFilters(f, f);
        tex.setMipFilter(Texture2D.Filter.NONE);
        tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        return tex;
    }

    static makePixelFrame(tex: Texture2D): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = tex;
        // 不进动态合图：合图纹理是线性过滤，进去就糊了
        frame.packable = false;
        return frame;
    }
}
