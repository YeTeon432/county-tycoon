import { ImageAsset, Rect, Size, SpriteFrame, Texture2D, Vec2, resources } from 'cc';

/**
 * 贴图仓库：建筑图按 id 找，地面图按帧号找；找不到返回 null，由调用方回退到色块。
 *
 * 目录约定（D013 / D014）：
 *   - art/buildings/<id>.png  建筑，文件名 = buildings.json 里的 id，宽必须是 (w+h)·16
 *   - art/ground/ground.png   地面图集，每帧 32×16 横排：0~3 草地，4+mask 马路（mask 见 GridMap）
 *
 * 像素锐利由代码保证：加载原始 ImageAsset，自建 Texture2D 并强制最近邻 / 无 mipmap / Clamp，
 * 也不进动态合图（合图纹理是线性过滤）。导入面板里的 Filter Mode 改不改都不影响游戏。
 */
const BUILDING_DIR = 'art/buildings';
const GROUND_ATLAS = 'art/ground/ground';

export const GROUND_GRASS_FRAMES = 4;
export const GROUND_ROAD_BASE = 4;

export class ArtLibrary {
    private readonly _buildings = new Map<string, SpriteFrame>();
    private _ground: SpriteFrame[] = [];
    private _loaded = false;

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

    /** 某个建筑的贴图；没有图就是 null */
    get(id: string): SpriteFrame | null {
        return this._buildings.get(id) ?? null;
    }

    /** 地面图集的第 index 帧；图集没加载到就是 null */
    ground(index: number): SpriteFrame | null {
        return this._ground[index] ?? null;
    }

    /** 加载全部贴图。全部结束（无论成败）后回调一次；单张坏了只跳过那一张 */
    load(onDone: () => void): void {
        const infos = resources.getDirWithPath(BUILDING_DIR, ImageAsset);
        const hasGround = !!resources.getInfoWithPath(GROUND_ATLAS, ImageAsset);
        let pending = infos.length + (hasGround ? 1 : 0);

        const finish = () => {
            pending--;
            if (pending <= 0) {
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

        for (const info of infos) {
            const path = info.path;
            const id = path.substring(path.lastIndexOf('/') + 1);
            resources.load(path, ImageAsset, (err, image) => {
                if (err || !image) {
                    console.warn(`[ArtLibrary] ${path} 加载失败，用色块代替`, err);
                } else {
                    this._buildings.set(id, ArtLibrary.makePixelFrame(ArtLibrary.makePixelTexture(image)));
                }
                finish();
            });
        }

        if (hasGround) {
            resources.load(GROUND_ATLAS, ImageAsset, (err, image) => {
                if (err || !image) {
                    console.warn('[ArtLibrary] 地面图集加载失败，用色块代替', err);
                } else {
                    this._ground = ArtLibrary.slice(image, 32, 16);
                }
                finish();
            });
        }
    }

    /** 横排图集切成等宽帧，共用同一张纹理（同纹理的精灵能合批，整片地面一次绘制） */
    private static slice(image: ImageAsset, fw: number, fh: number): SpriteFrame[] {
        const tex = ArtLibrary.makePixelTexture(image);
        const n = Math.floor(image.width / fw);
        const frames: SpriteFrame[] = [];
        for (let i = 0; i < n; i++) {
            const f = new SpriteFrame();
            f.reset({
                texture: tex,
                rect: new Rect(i * fw, 0, fw, fh),
                originalSize: new Size(fw, fh),
                offset: new Vec2(0, 0),
            });
            f.packable = false;
            frames.push(f);
        }
        return frames;
    }

    /** 像素风专用纹理：最近邻、无 mipmap、边缘 Clamp */
    static makePixelTexture(image: ImageAsset): Texture2D {
        const tex = new Texture2D();
        tex.image = image;
        tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
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
