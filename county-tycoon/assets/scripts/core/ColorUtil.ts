import { Color } from 'cc';

/**
 * 颜色小工具。
 *
 * 占位阶段所有颜色都写在配置里（hex 字符串），代码里不出现魔法数字。
 * 需要"同色系的亮一点/暗一点"时用 shade 现算，避免为每个面再配一个颜色。
 */

/** '#rrggbb' / '#rrggbbaa' → Color；解析失败给洋红色，方便一眼看出配置写错了 */
export function hexToColor(hex: string, out?: Color): Color {
    const c = out ?? new Color();
    c.fromHEX(hex && hex.length > 0 ? hex : '#ff00ff');
    return c;
}

/**
 * 调亮度。
 * @param color 原色
 * @param factor <1 变暗，>1 变亮（0.7 约等于压暗三成）
 */
export function shade(color: Color, factor: number, out?: Color): Color {
    const c = out ?? new Color();
    c.r = Math.max(0, Math.min(255, Math.round(color.r * factor)));
    c.g = Math.max(0, Math.min(255, Math.round(color.g * factor)));
    c.b = Math.max(0, Math.min(255, Math.round(color.b * factor)));
    c.a = color.a;
    return c;
}
