/**
 * 地面帧名的计算（T322）。
 *
 * 纯函数，不 import 'cc'：这样可以在 node 下拿真实 map.json 跑一遍，
 * 确认「代码会要的每个帧名，ground-frames.json 里都真有」。
 * 之前取帧逻辑埋在 GridMap 里，只能靠开编辑器肉眼看，帧名打错一个就是一片空白。
 *
 * 名字约定（和 docs/PARALLEL.md 支线 C 一致，由支线 C 维护）：
 *   grass-0..3、city-<mask>、dirt-<mask>（mask 0..15）
 *   water-<mask>：mask = 四邻**是陆地**的位（1 左上、2 右上、4 右下、8 左下）
 *   bridge-gx / bridge-gy
 *   mountain-0..2、ore-0..1、forest-0..3、pond
 *
 * 位定义（和 docs/art/gen/terrain.py 一致）：
 *   1 = 左上邻 (col-1)   2 = 右上邻 (row-1)   4 = 右下邻 (col+1)   8 = 左下邻 (row+1)
 */
import { TerrainType } from './Terrain';

/** 道路种类，和 BuildingDef.road 一致 */
export type RoadKind = 'dirt' | 'city';

/** 地形 → 帧名前缀和变体数 */
export const TERRAIN_FRAMES: Record<string, { prefix: string; variants: number }> = {
    mountain: { prefix: 'mountain', variants: 3 },
    ore: { prefix: 'ore', variants: 2 },
    forest: { prefix: 'forest', variants: 4 },
};

/** 坐标哈希取一个 0..n-1 的变体号，同一格每次都一样 */
export function variantOf(col: number, row: number, n: number): number {
    const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
    return h % Math.max(1, n);
}

/** 草地：0 最常见，带花的最少（和 D014 时期的取法一致） */
export function grassName(col: number, row: number, grassFrames = 4): string {
    const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
    const r = h % 10;
    const i = r < 4 ? 0 : (r < 6 ? 1 : (r < 8 ? 2 : grassFrames - 1));
    return `grass-${i}`;
}

export function roadName(kind: RoadKind, mask: number): string {
    return `${kind}-${mask}`;
}

/** 水的 mask：位 = 四邻**是陆地**（非水）的方向，这些边画岸 */
export function waterName(landMask: number): string {
    return `water-${landMask}`;
}

export function terrainName(type: TerrainType, col: number, row: number): string {
    switch (type) {
        case 'mountain':
            return `mountain-${variantOf(col, row, 3)}`;
        case 'ore':
            return `ore-${variantOf(col, row, 2)}`;
        case 'forest':
            return `forest-${variantOf(col, row, 4)}`;
        case 'pond':
            return 'pond';
        case 'river':
            return 'water-0';   // 调用方一般用 waterName(mask)，这只是兜底
        case 'bridge':
            return 'bridge-gx'; // 调用方一般用 bridgeName()，这只是兜底
        default:
            return grassName(col, row);
    }
}

/** 四邻位（1 左上 / 2 右上 / 4 右下 / 8 左下） */
export function neighborMask(test: (c: number, r: number) => boolean, col: number, row: number): number {
    return (test(col - 1, row) ? 1 : 0)
        | (test(col, row - 1) ? 2 : 0)
        | (test(col + 1, row) ? 4 : 0)
        | (test(col, row + 1) ? 8 : 0);
}

/**
 * 桥面朝哪个方向。
 *
 *   bridge-gx 连左上↔右下，也就是**沿 col 轴**的一段桥面
 *   bridge-gy 连右上↔左下，也就是**沿 row 轴**的一段桥面
 *
 * 判定要看"河往哪走"，桥必须横跨它：
 *   左右两格都是水/桥 → 河沿 col 轴 → 桥跨 row 轴 → **gy**
 *   上下两格都是水/桥 → 河沿 row 轴 → 桥跨 col 轴 → **gx**
 *
 * 两个都不成立（桥头 / 岸边）时按 gy 兜底：地图里主要那条河是沿 col 走的，
 * 正常搭桥就是这么横跨过去的。
 */
export function bridgeName(same: (c: number, r: number) => boolean, col: number, row: number): string {
    if (same(col - 1, row) && same(col + 1, row)) return 'bridge-gy';
    if (same(col, row - 1) && same(col, row + 1)) return 'bridge-gx';
    return 'bridge-gy';
}
