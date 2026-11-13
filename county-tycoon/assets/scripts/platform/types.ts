/**
 * 平台适配层的公共类型（T104）。
 *
 * 单独一个文件，是为了让 wx.ts / tt.ts / web.ts 各自只 import 它，
 * 不互相 import，也不 import 入口 Platform.ts —— Cocos 的模块系统里
 * 循环依赖虽然能跑，但会让加载顺序变得难以捉摸，这里直接避开。
 *
 * 这一层故意不 import 'cc'：纯宿主能力（存储、生命周期、震动），
 * 可以在 node 下直接构造假实现来测存档逻辑。
 */

/** 当前跑在哪个宿主上 */
export type PlatformName = 'wx' | 'tt' | 'web';

/** 安全区，单位是屏幕逻辑像素（刘海屏、底部小黑条） */
export interface SafeArea {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** 系统信息。字段少而稳，宿主没有的项给 0，业务代码不用判断 undefined */
export interface SystemInfo {
    /** 屏幕宽（逻辑像素，不是物理像素） */
    screenWidth: number;
    screenHeight: number;
    /** 设备像素比，做高清 UI 时用 */
    pixelRatio: number;
    safeArea: SafeArea;
    /** 宿主报上来的字符串（iOS / Android / devtools……），只用于日志和埋点 */
    platform: string;
}

/** 震动强度：short = 点击反馈，long = 出错 / 重要提示 */
export type VibrateKind = 'short' | 'long';

/**
 * 平台能力。所有方法都不允许抛异常：
 * 存储满了、宿主没实现某项能力，都安静地失败（最多打一行 warn），
 * 不能让一次存储失败把整局游戏搞崩。
 */
export interface IPlatform {
    readonly name: PlatformName;

    /** 读存档；没有或读失败返回 null */
    getItem(key: string): string | null;
    /** 写存档；失败返回 false（比如超出配额），调用方可以据此提示玩家 */
    setItem(key: string, value: string): boolean;
    /** 删存档；不存在也当成功 */
    removeItem(key: string): void;

    /** 屏幕尺寸、像素比、安全区。每帧都调也没关系，内部缓存一份 */
    systemInfo(): SystemInfo;

    /** 切回前台（暂停后回来要重算时间、恢复音效） */
    onShow(cb: () => void): void;
    offShow(cb: () => void): void;
    /** 切到后台（要立刻自动存档：小游戏没有可靠的"退出"事件，onHide 是最后一道） */
    onHide(cb: () => void): void;
    offHide(cb: () => void): void;

    /** 震动；浏览器和桌面端没有就静默忽略 */
    vibrate(kind: VibrateKind): void;
}

export const DEFAULT_SYSTEM_INFO: SystemInfo = {
    screenWidth: 0,
    screenHeight: 0,
    pixelRatio: 1,
    safeArea: { left: 0, top: 0, right: 0, bottom: 0 },
    platform: 'unknown',
};

/** 把宿主的 systemInfo 结果规整成我们的结构，缺字段给默认值 */
export function normalizeSystemInfo(raw: any): SystemInfo {
    if (!raw) return { ...DEFAULT_SYSTEM_INFO, safeArea: { ...DEFAULT_SYSTEM_INFO.safeArea } };
    const r = raw.safeArea;
    return {
        screenWidth: Number(raw.screenWidth) || 0,
        screenHeight: Number(raw.screenHeight) || 0,
        pixelRatio: Number(raw.pixelRatio) || 1,
        safeArea: r
            ? {
                left: Number(r.left) || 0,
                top: Number(r.top) || 0,
                right: Number(r.right) || 0,
                bottom: Number(r.bottom) || 0,
            }
            : { ...DEFAULT_SYSTEM_INFO.safeArea },
        platform: typeof raw.platform === 'string' ? raw.platform : 'unknown',
    };
}

/**
 * 小游戏框架（wx / tt）的公共实现。
 *
 * 两家的 API 名字、参数、返回值几乎一模一样，差别只在全局对象名和
 * 少数接口是否存在，所以用一份代码、把宿主对象传进来。
 * 真正不同的地方在各自的 xxx.ts 里补。
 */
export function createMiniGamePlatform(api: any, name: PlatformName): IPlatform {
    // systemInfoSync 在部分低版本里不存在，取不到就只缓存一次空结果
    let cached: SystemInfo | null = null;

    const showCbs = new Set<() => void>();
    const hideCbs = new Set<() => void>();
    let hooked = false;

    const ensureHooked = (): void => {
        if (hooked) return;
        hooked = true;
        // wx.onShow / tt.onShow 支持注册多个回调，但我们也只在第一次注册一次，
        // 内部再分发给自己记的集合 —— 这样 off 的语义才是干净的。
        if (typeof api.onShow === 'function') {
            api.onShow(() => { showCbs.forEach((cb) => swallow(cb)); });
        }
        if (typeof api.onHide === 'function') {
            api.onHide(() => { hideCbs.forEach((cb) => swallow(cb)); });
        }
    };

    return {
        name,

        getItem(key: string): string | null {
            try {
                const v = api.getStorageSync(key);
                // 微信里取不到时返回空字符串而不是 undefined，两种都当"没有"
                return typeof v === 'string' && v.length > 0 ? v : null;
            } catch (e) {
                console.warn(`[platform:${name}] getStorageSync 失败`, key, e);
                return null;
            }
        },

        setItem(key: string, value: string): boolean {
            try {
                api.setStorageSync(key, value);
                return true;
            } catch (e) {
                // 最常见的是超过 10MB 配额、或写得太频繁触发限制
                console.warn(`[platform:${name}] setStorageSync 失败`, key, e);
                return false;
            }
        },

        removeItem(key: string): void {
            try {
                if (typeof api.removeStorageSync === 'function') api.removeStorageSync(key);
                else api.setStorageSync(key, '');
            } catch (e) {
                console.warn(`[platform:${name}] removeStorageSync 失败`, key, e);
            }
        },

        systemInfo(): SystemInfo {
            if (cached) return cached;
            let raw: any = null;
            try {
                raw = typeof api.getSystemInfoSync === 'function' ? api.getSystemInfoSync() : null;
            } catch (e) {
                console.warn(`[platform:${name}] getSystemInfoSync 失败`, e);
            }
            cached = normalizeSystemInfo(raw);
            return cached;
        },

        onShow(cb: () => void): void {
            showCbs.add(cb);
            ensureHooked();
        },
        offShow(cb: () => void): void {
            showCbs.delete(cb);
        },
        onHide(cb: () => void): void {
            hideCbs.add(cb);
            ensureHooked();
        },
        offHide(cb: () => void): void {
            hideCbs.delete(cb);
        },

        vibrate(kind: VibrateKind): void {
            try {
                if (kind === 'long') {
                    if (typeof api.vibrateLong === 'function') { api.vibrateLong({}); return; }
                } else if (typeof api.vibrateShort === 'function') {
                    api.vibrateShort({ type: 'light' });
                    return;
                }
            } catch (e) {
                // 设备不支持震动、或用户关了震动权限，忽略
            }
        },
    };
}

/** 回调里抛异常不能影响其它回调，也不能把宿主的 onShow 打断 */
function swallow(cb: () => void): void {
    try {
        cb();
    } catch (e) {
        console.error('[platform] 生命周期回调抛异常', e);
    }
}
