/**
 * 浏览器 / 编辑器预览实现（T104）。
 *
 * 预览时没有 wx / tt，用 localStorage 顶着，方便在浏览器里反复测存档。
 * localStorage 也可能不可用（无痕模式、file:// 协议、被禁），
 * 这时退回内存存储：本次运行能存能读，关掉就没了 —— 比直接崩掉强。
 */
import {
    IPlatform, SystemInfo, DEFAULT_SYSTEM_INFO, normalizeSystemInfo,
} from './types';

export function createWebPlatform(): IPlatform {
    const memory = new Map<string, string>();
    const storage = pickStorage();

    const showCbs = new Set<() => void>();
    const hideCbs = new Set<() => void>();
    let hooked = false;

    const ensureHooked = (): void => {
        if (hooked) return;
        hooked = true;
        if (typeof document !== 'undefined' && document.addEventListener) {
            // 小游戏里 onHide 是"切后台"，浏览器对应的概念是 visibilitychange
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') hideCbs.forEach(fire);
                else showCbs.forEach(fire);
            });
        }
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('blur', () => hideCbs.forEach(fire));
            window.addEventListener('focus', () => showCbs.forEach(fire));
        }
    };

    return {
        name: 'web',

        getItem(key: string): string | null {
            try {
                const v = storage ? storage.getItem(key) : (memory.get(key) ?? null);
                return v && v.length > 0 ? v : null;
            } catch (e) {
                console.warn('[platform:web] 读存储失败', key, e);
                return null;
            }
        },

        setItem(key: string, value: string): boolean {
            try {
                if (storage) storage.setItem(key, value);
                else memory.set(key, value);
                return true;
            } catch (e) {
                // 配额满（QuotaExceededError）。退到内存，至少这一局不丢
                console.warn('[platform:web] 写存储失败，改用内存', key, e);
                memory.set(key, value);
                return false;
            }
        },

        removeItem(key: string): void {
            try {
                if (storage) storage.removeItem(key);
            } catch (e) {
                console.warn('[platform:web] 删存储失败', key, e);
            }
            memory.delete(key);
        },

        systemInfo(): SystemInfo {
            const raw = typeof window !== 'undefined'
                ? {
                    screenWidth: window.innerWidth,
                    screenHeight: window.innerHeight,
                    pixelRatio: window.devicePixelRatio,
                    platform: 'web',
                }
                : null;
            return raw ? normalizeSystemInfo(raw) : { ...DEFAULT_SYSTEM_INFO };
        },

        onShow(cb: () => void): void { showCbs.add(cb); ensureHooked(); },
        offShow(cb: () => void): void { showCbs.delete(cb); },
        onHide(cb: () => void): void { hideCbs.add(cb); ensureHooked(); },
        offHide(cb: () => void): void { hideCbs.delete(cb); },

        vibrate(kind) {
            const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
            if (nav && typeof nav.vibrate === 'function') {
                try { nav.vibrate(kind === 'long' ? 120 : 20); } catch (e) { /* 忽略 */ }
            }
        },
    };
}

/** 探测 localStorage 真的能写（有些环境对象存在但一写就抛异常） */
function pickStorage(): Storage | null {
    try {
        const s = typeof localStorage !== 'undefined' ? localStorage : null;
        if (!s) return null;
        const probe = '__ct_probe__';
        s.setItem(probe, '1');
        s.removeItem(probe);
        return s;
    } catch (e) {
        return null;
    }
}

function fire(cb: () => void): void {
    try { cb(); } catch (e) { console.error('[platform:web] 生命周期回调抛异常', e); }
}
