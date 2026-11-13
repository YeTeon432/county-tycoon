/**
 * 微信小游戏实现（T104）。
 * 只有全局有 `wx` 时才会被创建；识别逻辑在 Platform.ts。
 */
import { IPlatform, createMiniGamePlatform } from './types';

export function createWxPlatform(wx: any): IPlatform {
    const base = createMiniGamePlatform(wx, 'wx');
    return {
        ...base,
        vibrate(kind) {
            // 微信新版本 vibrateShort 需要 type 参数，老版本不认这个参数也不会报错；
            // 统一走公共实现即可，这里保留钩子，微信特有的能力（登录、分享）以后加在这里。
            base.vibrate(kind);
        },
    };
}
