import { ImageAsset, SpriteFrame, Texture2D, resources } from 'cc';

/**
 * 建筑贴图仓库：按建筑 id 找图，找不到就返回 null，由调用方回退到色块。
 *
 * 约定（D011）：
 *   - 图放在 assets/resources/art/buildings/<id>.png，文件名 = buildings.json 里的 id
 *   - 只加载目录里真实存在的图（先查清单再加载），缺图不会刷一堆 404 报错
 *
 * 像素锐利的保证不靠导入设置：这里加载的是原始 ImageAsset，
 * 自己建 Texture2D 并强制 最近邻过滤 / 关 mipmap / Clamp。
 * 这样就算编辑器里忘了把 Filter Mode 改成 Point，游戏里也不会糊。
 */
const ART_DIR = 'art/buildings';

export class BuildingArt {
    private readonly _frames = new Map<string, SpriteFrame>();
    private _loaded = false;

    /** 已加载的贴图数量（调试 / 测试用） */
    get count(): number {
        return this._frames.size;
    }

    get loaded(): boolean {
        return this._loaded;
    }

    /** 某个建筑的贴图；没有图就是 null */
    get(id: string): SpriteFrame | null {
        return this._frames.get(id) ?? null;
    }

    /**
     * 加载目录下所有建筑图。全部结束（无论成败）后回调一次。
     * 单张图坏了只跳过那一张，不影响其它。
     */
    load(onDone: () => void): void {
        const infos = resources.getDirWithPath(ART_DIR, ImageAsset);
        if (infos.length === 0) {
            this._loaded = true;
            onDone();
            return;
        }

        let pending = infos.length;
        const finish = () => {
            pending--;
            if (pending === 0) {
                this._loaded = true;
                console.log(`[BuildingArt] 已加载 ${this._frames.size} 张建筑图`);
                onDone();
            }
        };

        for (const info of infos) {
            const path = info.path;
            const id = path.substring(path.lastIndexOf('/') + 1);
            resources.load(path, ImageAsset, (err, image) => {
                if (err || !image) {
                    console.warn(`[BuildingArt] ${path} 加载失败，用色块代替`, err);
                } else {
                    this._frames.set(id, BuildingArt.makePixelFrame(image));
                }
                finish();
            });
        }
    }

    /** 用原始图片建一个"像素风专用"的 SpriteFrame：最近邻、无 mipmap、边缘 Clamp */
    static makePixelFrame(image: ImageAsset): SpriteFrame {
        const tex = new Texture2D();
        tex.image = image;
        tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        tex.setMipFilter(Texture2D.Filter.NONE);
        tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);

        const frame = new SpriteFrame();
        frame.texture = tex;
        // 不进动态合图：合图纹理是线性过滤，进去就糊了
        frame.packable = false;
        return frame;
    }
}
