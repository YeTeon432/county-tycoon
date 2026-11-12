import { Node, UITransform, Vec3, Rect } from 'cc';

/**
 * 输入遮挡登记。
 *
 * 地图的拖动/点选挂在全局 input 上（D005），好处是三端一致、不受节点尺寸限制；
 * 代价是它不知道"这个位置上有 UI"。所以任何要吃掉点击的 UI 面板，
 * 建好后调用 InputGuard.add(节点)，销毁时 InputGuard.remove(节点)，
 * 地图会先问一句"这里被 UI 占了吗"，占了就不响应。
 *
 * 判断用节点的世界包围盒。UI 坐标系和世界坐标系在设计分辨率下是同一套，
 * 所以直接用 touch 的 UI 坐标就能比。
 */
export class InputGuard {
    private static _blockers: Node[] = [];
    private static readonly _tmpRect = new Rect();

    /** 登记一块会吃点击的区域 */
    static add(node: Node): void {
        if (this._blockers.indexOf(node) < 0) {
            this._blockers.push(node);
        }
    }

    /** 注销 */
    static remove(node: Node): void {
        const i = this._blockers.indexOf(node);
        if (i >= 0) this._blockers.splice(i, 1);
    }

    /** 这个位置（UI 坐标）是否被 UI 挡住 */
    static isBlocked(x: number, y: number): boolean {
        for (let i = this._blockers.length - 1; i >= 0; i--) {
            const node = this._blockers[i];
            if (!node || !node.isValid || !node.activeInHierarchy) {
                this._blockers.splice(i, 1);
                continue;
            }
            const trans = node.getComponent(UITransform);
            if (!trans) continue;
            // 世界包围盒；UI 坐标系和世界坐标系在设计分辨率下一致，直接比即可
            const bbox = trans.getBoundingBoxToWorld();
            if (x >= bbox.x && x <= bbox.x + bbox.width
                && y >= bbox.y && y <= bbox.y + bbox.height) {
                return true;
            }
        }
        return false;
    }

    /** 换场景/重开时清空，避免残留失效节点 */
    static clear(): void {
        this._blockers.length = 0;
    }
}
