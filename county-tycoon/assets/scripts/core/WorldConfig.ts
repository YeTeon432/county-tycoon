import { JsonAsset, resources } from 'cc';

/**
 * 世界配置。
 *
 * 按 CLAUDE.md 的约定，地块尺寸、缩放倍率这类数值不写死在业务代码里，
 * 统一放在 assets/resources/config/world.json，改数值不用改代码。
 * 这里再留一份内置默认值：json 读不到时游戏仍然能跑起来（只是用默认数值）。
 */
export interface WorldPalette {
    /** 地图之外的底色 */
    background: string;
    /** 地面填充色 */
    ground: string;
    /** 网格线颜色 */
    gridLine: string;
    /** 地图外框颜色 */
    border: string;
}

export interface WorldConfig {
    /** 等距菱形地块的宽，单位"美术像素"（D014：32） */
    tileWidth: number;
    /** 等距菱形地块的高（D014：16，宽高 2:1） */
    tileHeight: number;
    /** 地图横向地块数 */
    gridWidth: number;
    /** 地图纵向地块数 */
    gridHeight: number;
    /**
     * 允许的缩放档位。每档都是美术像素的整数倍，
     * 这样放大后一个美术像素正好占整数个屏幕像素，不会糊（D003）。
     */
    zoomLevels: number[];
    /** 默认档位在 zoomLevels 里的下标 */
    defaultZoomIndex: number;
    /** 占位配色，取自固定调色板（D011 / D014） */
    palette: WorldPalette;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
    tileWidth: 32,
    tileHeight: 16,
    gridWidth: 64,
    gridHeight: 64,
    zoomLevels: [2, 3, 4, 5],
    defaultZoomIndex: 2,
    palette: {
        background: '#2e222f',
        ground: '#547e64',
        gridLine: '#3a5b46',
        border: '#b2ba90',
    },
};

/** 把 json 里的部分字段覆盖到默认值上，缺的字段继续用默认值 */
function mergeConfig(base: WorldConfig, patch: Partial<WorldConfig>): WorldConfig {
    return {
        ...base,
        ...patch,
        palette: { ...base.palette, ...(patch.palette ?? {}) },
        zoomLevels: (patch.zoomLevels && patch.zoomLevels.length > 0)
            ? patch.zoomLevels
            : base.zoomLevels,
    };
}

/** 读取世界配置；失败时回退到内置默认值，不会让游戏卡住 */
export function loadWorldConfig(): Promise<WorldConfig> {
    return new Promise((resolve) => {
        resources.load('config/world', JsonAsset, (err, asset) => {
            if (err || !asset || !asset.json) {
                console.warn('[WorldConfig] 没读到 config/world.json，先用内置默认配置', err);
                resolve(DEFAULT_WORLD_CONFIG);
                return;
            }
            resolve(mergeConfig(DEFAULT_WORLD_CONFIG, asset.json as Partial<WorldConfig>));
        });
    });
}
