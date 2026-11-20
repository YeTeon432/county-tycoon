/**
 * 平台适配层入口（T104）。
 *
 * 业务代码只写：
 *   import { getPlatform } from '../platform/Platform';
 *   const p = getPlatform();
 *   p.setItem('county-save-v1', json);
 * 不出现任何 wx. / tt. / localStorage（CLAUDE.md 的约定）。
 *
 * 平台差异不要散落到业务里：微信独有的能力（登录、分享、激励视频）
 * 以后加进 IPlatform（见 types.ts），三家各写各的。
 */
import { settings, sys } from 'cc';
import { IPlatform, createMiniGamePlatform, SystemInfo } from './types';
import { createWxPlatform } from './wx';
import { createTtPlatform } from './tt';
import { createNativePlatform } from './native';
import { createWebPlatform } from './web';

export * from './types';

let _instance: IPlatform | null = null;

/**
 * 取当前平台的实现。第一次调用时自动识别并缓存。
 * 拿不到宿主（node 测试、未知环境）就退回 web 实现 —— 它内部还有内存兜底。
 */
export function getPlatform(): IPlatform {
    if (!_instance) _instance = detectPlatform();
    return _instance;
}

/** 由桌面网页版的启动模板开启。 */
export function usesLandscapeWebLayout(): boolean {
    return settings.querySettings('screen', 'landscapeWebLayout') === true;
}

/** 测试或特殊场景注入别的实现；传 null 恢复自动识别 */
export function setPlatform(platform: IPlatform | null): void {
    _instance = platform;
}

/**
 * 按宿主全局对象判断。两家小游戏的 API 形状一样，靠对象名区分；
 * 原生应用用引擎的存储和前后台事件，其余退回网页预览实现。
 */
export function detectPlatform(): IPlatform {
    const host = globalThis as any;
    if (host.wx && typeof host.wx.setStorageSync === 'function') {
        return createWxPlatform(host.wx);
    }
    if (host.tt && typeof host.tt.setStorageSync === 'function') {
        return createTtPlatform(host.tt);
    }
    if (sys.isNative) return createNativePlatform();
    return createWebPlatform();
}

/**
 * 纯内存实现：测试用，也给"存储彻底不可用"兜底。
 * 不导出成平台实现，只通过 setPlatform 注入。
 */
export function createMemoryPlatform(name: IPlatform['name'] = 'web'): IPlatform {
    const map = new Map<string, string>();
    const info: SystemInfo = {
        screenWidth: 0, screenHeight: 0, pixelRatio: 1,
        safeArea: { left: 0, top: 0, right: 0, bottom: 0 }, platform: 'memory',
    };
    return {
        name,
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => { map.set(k, v); return true; },
        removeItem: (k) => { map.delete(k); },
        systemInfo: () => info,
        onShow: () => { /* 无生命周期 */ },
        offShow: () => { /* 无 */ },
        onHide: () => { /* 无 */ },
        offHide: () => { /* 无 */ },
        vibrate: () => { /* 无 */ },
    };
}

// 保留 createMiniGamePlatform 的导出，方便以后写别的宿主（比如 QQ / 支付宝）
export { createMiniGamePlatform };
