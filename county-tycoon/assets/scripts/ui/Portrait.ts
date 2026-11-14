import { Color, Graphics, Layers, Node, Sprite, UITransform } from 'cc';
import { ArtLibrary } from '../core/ArtLibrary';
import { LookInput, skinOf } from '../core/Appearance';

/**
 * 居民头像（D023，DESIGN 14）：圆形浅底 + 图集里的 face-<皮肤> 胸像。
 * 和街上的小人是同一套外观，点街上的人看到的头像就是他。
 *
 * 贴图仓库由 UiRoot.setArt 设一次（全局一份）；还没有图时返回 false，调用方继续画原来的姓氏色块。
 */
export class Portrait {
    private static _art: ArtLibrary | null = null;

    static setArt(art: ArtLibrary | null): void {
        Portrait._art = art;
    }

    /** 这个人有没有头像图（决定要不要退回姓氏色块） */
    static has(r: LookInput): boolean {
        const art = Portrait._art;
        return !!(art && art.loaded && art.get(`face-${skinOf(r)}`));
    }

    /**
     * 在 parent 里 (x, y) 处放一个直径 size 的头像。
     * bg 是圆底颜色（男蓝女粉之类）；返回 false 表示没图、什么都没放。
     */
    static place(parent: Node, r: LookInput, x: number, y: number, size: number, bg: Color): boolean {
        const art = Portrait._art;
        const frame = art && art.loaded ? art.get(`face-${skinOf(r)}`) : null;
        if (!frame) return false;
        const node = new Node('Portrait');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(size, size);
        parent.addChild(node);
        node.setPosition(x, y, 0);
        const g = node.addComponent(Graphics);
        g.fillColor = bg;
        g.circle(0, 0, size / 2);
        g.fill();
        // 头像图本身是透明底的胸像，比圆略大一点、往上提一点：肩膀落在圆底边，头顶不被切
        const img = new Node('Face');
        img.layer = Layers.Enum.UI_2D;
        img.addComponent(UITransform).setContentSize(size * 1.08, size * 1.08);
        node.addChild(img);
        img.setPosition(0, size * 0.04, 0);
        const s = img.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM;
        s.trim = false;
        s.spriteFrame = frame;
        return true;
    }
}
