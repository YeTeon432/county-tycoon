"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapBuilder = void 0;
exports.loadConfig = loadConfig;
exports.basicTown = basicTown;
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../../assets/scripts/core/sim/config");
const townView_1 = require("../../assets/scripts/core/sim/townView");
/**
 * 测试用的地图搭建器：先摆路，再摆楼，最后交给 SimpleTownView。
 * 坐标和 TownModel 一致：col 从左往右，row 从下往上，记左下角。
 */
class MapBuilder {
    constructor(width = 20, height = 20) {
        this.width = width;
        this.height = height;
        this._list = [];
        this._next = 1;
    }
    /** 一条横向的路，从 (x0, y) 到 (x1, y) */
    hRoad(x0, x1, y) {
        for (let x = x0; x <= x1; x++)
            this.road(x, y);
        return this;
    }
    /** 一条纵向的路，从 (x, y0) 到 (x, y1) */
    vRoad(x, y0, y1) {
        for (let y = y0; y <= y1; y++)
            this.road(x, y);
        return this;
    }
    road(col, row) {
        this._list.push({
            uid: this._next++, defId: 'dirt-road',
            col, row, width: 1, height: 1, road: true,
        });
        return this;
    }
    /** 放一栋楼，返回 uid */
    build(defId, col, row, width = 1, height = 1) {
        const uid = this._next++;
        this._list.push({ uid, defId, col, row, width, height, road: false });
        return uid;
    }
    view() {
        const list = this._list;
        return new townView_1.SimpleTownView(this.width, this.height, () => list);
    }
}
exports.MapBuilder = MapBuilder;
/** 读真实的配置表（和游戏里同一份文件） */
function loadConfig(root = (0, path_1.join)(process.cwd(), 'assets/resources/config')) {
    const economy = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(root, 'economy.json'), 'utf8'));
    const names = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(root, 'names.json'), 'utf8'));
    return (0, config_1.makeSimConfig)(economy, names);
}
/** 一个最小的像样县城：一条主路 + 两栋房 + 几家店 */
function basicTown(cfg) {
    const map = new MapBuilder(24, 24);
    map.hRoad(2, 18, 5);
    map.hRoad(2, 18, 10);
    map.vRoad(10, 5, 10);
    const map2 = map;
    // 路下侧（row 4）盖房，路上侧（row 6）开店
    const house1 = map2.build('house', 4, 4);
    const house2 = map2.build('house', 6, 4);
    const breakfast = map2.build('breakfast', 4, 6);
    const supermarket = map2.build('supermarket', 6, 6, 2, 2);
    const barber = map2.build('barber', 8, 6);
    const milkTea = map2.build('milk-tea', 11, 6);
    const parcel = map2.build('parcel', 13, 6);
    const workshop = map2.build('workshop', 14, 4);
    return { map: map2, view: map2.view(), houses: [house1, house2], shops: { breakfast, supermarket, barber, milkTea, parcel, workshop } };
}
