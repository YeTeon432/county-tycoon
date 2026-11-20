import { Game, game, screen, sys, view } from 'cc';
import { DEFAULT_SYSTEM_INFO, IPlatform, SystemInfo } from './types';

/** 原生应用的持久化和前后台事件由 Cocos 提供。 */
export function createNativePlatform(): IPlatform {
    return {
        name: 'native',
        getItem(key) {
            try {
                return sys.localStorage.getItem(key) || null;
            } catch (err) {
                console.warn('[platform:native] 读存储失败', key, err);
                return null;
            }
        },
        setItem(key, value) {
            try {
                sys.localStorage.setItem(key, value);
                return true;
            } catch (err) {
                console.warn('[platform:native] 写存储失败', key, err);
                return false;
            }
        },
        removeItem(key) {
            try {
                sys.localStorage.removeItem(key);
            } catch (err) {
                console.warn('[platform:native] 删存储失败', key, err);
            }
        },
        systemInfo(): SystemInfo {
            try {
                const ratio = screen.devicePixelRatio || 1;
                const { width, height } = screen.windowSize;
                const safe = sys.getSafeAreaRect(false);
                const viewport = view.getViewportRect();
                const x = (v: number) => (viewport.x + v * view.getScaleX()) / ratio;
                const y = (v: number) => (height - viewport.y - v * view.getScaleY()) / ratio;
                return {
                    screenWidth: width / ratio,
                    screenHeight: height / ratio,
                    pixelRatio: ratio,
                    safeArea: { left: x(safe.xMin), top: y(safe.yMax), right: x(safe.xMax), bottom: y(safe.yMin) },
                    platform: sys.os,
                };
            } catch (err) {
                console.warn('[platform:native] 读取屏幕安全区失败', err);
                return DEFAULT_SYSTEM_INFO;
            }
        },
        onShow(cb) { game.on(Game.EVENT_SHOW, cb); },
        offShow(cb) { game.off(Game.EVENT_SHOW, cb); },
        onHide(cb) { game.on(Game.EVENT_HIDE, cb); },
        offHide(cb) { game.off(Game.EVENT_HIDE, cb); },
        vibrate() { /* 原生版暂无震动。 */ },
    };
}
