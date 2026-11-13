/**
 * 抖音小游戏实现（T104）。
 *
 * 抖音的 tt.* 和微信的 wx.* 形状一致，共用一份实现。
 * 已知差异记在这里，以后遇到再补：
 *   - storage 配额和错误码和微信不同，但都是抛异常，公共实现里已经兜住；
 *   - 震动接口同样叫 tt.vibrateShort / tt.vibrateLong。
 */
import { IPlatform, createMiniGamePlatform } from './types';

export function createTtPlatform(tt: any): IPlatform {
    return createMiniGamePlatform(tt, 'tt');
}
