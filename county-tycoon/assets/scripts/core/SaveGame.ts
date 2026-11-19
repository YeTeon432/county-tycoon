/**
 * 存档（T320）。
 *
 * 存的是"纯数据"：模拟层状态 SimState + 地图上的建筑摆放（TownModel）。
 * 两者都已经是可 JSON 序列化的结构，所以存档就是一次 JSON.stringify。
 * 画面层的东西（缩放倍率、相机位置）不存 —— 读档后重新摆一遍即可，
 * 免得以后改渲染时老存档带进一堆不认识的字段。
 *
 * 几条硬规矩（PARALLEL.md 支线 D）：
 *   - key 带版本号：county-save-v1
 *   - 读到旧版本要能迁移或丢弃，绝不能崩
 *   - 走平台存储（Platform.getItem / setItem），不直接碰 wx / localStorage
 *   - onHide 时自动存（小游戏没有可靠的"退出"事件）
 */
import { BuildingDef } from './BuildingConfig';
import { TownModel, PlacedBuilding, Facing } from './TownModel';
import { SimState } from './sim/types';
import { getPlatform } from '../platform/Platform';

/** 当前存档格式版本。加字段不用改；改了结构才加 1，并在这里写迁移 */
export const SAVE_VERSION = 1;
/** 存档 key。读旧版本时用 LEGACY_KEYS 挨个试 */
export const SAVE_KEY = 'county-save-v1';

/** 一栋建筑在存档里的样子。defId 而不是整个 def：参数改数值后老存档自动吃到新数值 */
export interface SavedBuilding {
    uid: number;
    defId: string;
    col: number;
    row: number;
    facing: Facing | null;
}

export interface SaveFile {
    version: number;
    /** 存档时间戳（毫秒），"上次游戏时间"和离线收益都要用 */
    savedAt: number;
    sim: SimState;
    town: {
        width: number;
        height: number;
        nextUid: number;
        buildings: SavedBuilding[];
    };
}

export interface LoadResult {
    ok: boolean;
    /** ok 为 false 时给出原因，方便日志和"存档损坏"提示 */
    reason?: string;
    save?: SaveFile;
}

/** TownModel 里取"下一栋的 uid"，读档时要把编号接上，不然新建筑会撞号 */
export function captureTown(model: TownModel): SaveFile['town'] {
    const buildings: SavedBuilding[] = model.allBuildings().map((b) => ({
        uid: b.uid,
        defId: b.def.id,
        col: b.col,
        row: b.row,
        facing: b.facing,
    }));
    return {
        width: model.width,
        height: model.height,
        nextUid: model.peekNextUid(),
        buildings,
    };
}

/**
 * 把存档里的建筑填回 TownModel。
 *
 * 返回没能放回去的（配置里已经删掉的建筑 id、或者坐标上已经有别人）。
 * 这些不需要让玩家看见 —— 跳过它们，游戏照常能玩，日志里记一笔即可。
 */
export function restoreTown(
    model: TownModel,
    saved: SaveFile['town'],
    defs: Map<string, BuildingDef>,
): SavedBuilding[] {
    const skipped: SavedBuilding[] = [];
    if (!saved || !Array.isArray(saved.buildings)) return skipped;

    // 先按 uid 排一下，保证"同一份存档读两次结果一样"
    const list = saved.buildings.slice().sort((a, b) => a.uid - b.uid);
    for (const sb of list) {
        const def = defs.get(sb.defId);
        if (!def) {
            console.warn(`[SaveGame] 存档里的建筑 ${sb.defId} 已经不存在，跳过`);
            skipped.push(sb);
            continue;
        }
        const placed = model.placeWithUid(def, sb.col, sb.row, sb.uid);
        if (!placed) {
            console.warn(`[SaveGame] 建筑 ${sb.defId}@(${sb.col},${sb.row}) 放不回去，跳过`);
            skipped.push(sb);
            continue;
        }
        placed.facing = sb.facing ?? null;
    }
    model.ensureNextUidAtLeast(saved.nextUid || 1);
    // 老存档里朝向还是 null 的建筑（放下时四周没路），按当前道路重新推一次；
    // 已经是 'L' / 'R' 的不动，玩家手动换过的朝向必须保留。
    model.settleFacings();
    model.fixFacings();
    return skipped;
}

/**
 * 分段存储（T548）：微信 / 抖音单个 key 最多 1MB，人口七八百时整份存档就超了，setStorageSync 抛错 = 存档丢了。
 * 所以按 CHUNK 个字符切段，存在 `<SAVE_KEY>.<槽>.<段号>`；SAVE_KEY 本身只放一张目录 {chunked, slot, n, len}。
 * 两个槽 a / b 轮流写：先写新槽的所有段，全部成功才改目录指向它。写到一半失败（配额满、被杀进程）
 * 目录还指着旧槽，上一份存档完好；旧槽也顺手当备份，新槽读坏了退回它。
 * 老存档（SAVE_KEY 里直接是整份 JSON）照样能读。
 */
const CHUNK = 200_000;   // 字符数；全是中文时 UTF-8 也才 600KB，留足余量
const SLOTS = ['a', 'b'];

interface SaveIndex { chunked: true; slot: string; n: number; len: number; prev?: { slot: string; n: number; len: number } }

function chunkKey(slot: string, i: number): string {
    return `${SAVE_KEY}.${slot}.${i}`;
}

function readIndex(): SaveIndex | null {
    const text = getPlatform().getItem(SAVE_KEY);
    if (!text || text.charCodeAt(0) !== 123 /* { */ || text.length > 1000) return null;
    try {
        const v = JSON.parse(text);
        return v && v.chunked ? v as SaveIndex : null;
    } catch (e) {
        return null;
    }
}

function readSlot(slot: string, n: number, len: number): string | null {
    const p = getPlatform();
    let text = '';
    for (let i = 0; i < n; i++) {
        const part = p.getItem(chunkKey(slot, i));
        if (part === null) return null;
        text += part;
    }
    return text.length === len ? text : null;
}

/** 把一整份存档文本分段写进去。返回 false 时上一份存档不受影响 */
export function writeSaveText(text: string): boolean {
    const p = getPlatform();
    const old = readIndex();
    const slot = old && old.slot === SLOTS[0] ? SLOTS[1] : SLOTS[0];
    const n = Math.max(1, Math.ceil(text.length / CHUNK));
    for (let i = 0; i < n; i++) {
        if (!p.setItem(chunkKey(slot, i), text.slice(i * CHUNK, (i + 1) * CHUNK))) {
            console.error(`[SaveGame] 存档第 ${i + 1}/${n} 段写失败，保留上一份`);
            return false;
        }
    }
    // 这个槽上次可能分得更多段，多出来的删掉
    for (let i = n; p.getItem(chunkKey(slot, i)) !== null; i++) p.removeItem(chunkKey(slot, i));
    const index: SaveIndex = { chunked: true, slot, n, len: text.length };
    if (old) index.prev = { slot: old.slot, n: old.n, len: old.len };
    return p.setItem(SAVE_KEY, JSON.stringify(index));
}

/** 读出整份存档文本：新格式按目录拼段（坏了退回备份槽），老格式直接返回 */
export function readSaveText(): string | null {
    const raw = getPlatform().getItem(SAVE_KEY);
    if (!raw) return null;
    const index = readIndex();
    if (!index) return raw;   // 老存档：整份 JSON
    const text = readSlot(index.slot, index.n, index.len);
    if (text !== null) return text;
    console.warn('[SaveGame] 最新存档段不全，读上一份');
    return index.prev ? readSlot(index.prev.slot, index.prev.n, index.prev.len) : null;
}

/** 写存档。返回 false 表示存储写失败（配额满等），调用方据此提示玩家 */
export function writeSave(state: SimState, model: TownModel): boolean {
    const file: SaveFile = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        sim: state,
        town: captureTown(model),
    };
    let text: string;
    try {
        text = JSON.stringify(file);
    } catch (e) {
        console.error('[SaveGame] 存档序列化失败（状态里有循环引用？）', e);
        return false;
    }
    return writeSaveText(text);
}

/**
 * 读存档。
 *
 * 任何异常都变成 { ok: false }，不往外抛：
 * 存档坏了只该回到新游戏，不该白屏。
 */
export function readSave(): LoadResult {
    const text = readSaveText();
    if (!text) return { ok: false, reason: 'empty' };

    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        console.warn('[SaveGame] 存档不是合法 JSON', e);
        return { ok: false, reason: 'corrupt' };
    }

    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt' };

    const version = Number(raw.version) || 0;
    if (version > SAVE_VERSION) {
        // 玩家在旧版本客户端上读到了新存档（比如装了降级包）。不冒险，丢弃
        console.warn(`[SaveGame] 存档版本 ${version} 比当前 ${SAVE_VERSION} 新，丢弃`);
        return { ok: false, reason: 'future-version' };
    }
    const migrated = migrate(raw, version);
    if (!migrated) return { ok: false, reason: 'migrate-failed' };

    const problem = validate(migrated);
    if (problem) {
        console.warn('[SaveGame] 存档结构不完整：' + problem);
        return { ok: false, reason: problem };
    }
    return { ok: true, save: migrated };
}

/** 删档（重开一局用） */
export function clearSave(): void {
    const p = getPlatform();
    for (const slot of SLOTS) for (let i = 0; p.getItem(chunkKey(slot, i)) !== null; i++) p.removeItem(chunkKey(slot, i));
    p.removeItem(SAVE_KEY);
}

/**
 * 版本迁移。目前只有 v1，写法先留好：
 * v1 → v2 就在这里把 raw.sim 里缺的字段补上，返回同一份对象。
 * 迁不动（数据结构变化太大）就返回 null，让调用方走新游戏，绝不抛异常。
 */
function migrate(raw: any, version: number): SaveFile | null {
    if (version < 1) return null;
    if (version === SAVE_VERSION) return raw as SaveFile;
    // 以后版本更低时在这里逐级迁移
    return raw as SaveFile;
}

/** 结构检查：只查"能不能跑起来"必须有的东西，不做严格校验 */
function validate(f: SaveFile): string | null {
    if (!f.sim || typeof f.sim !== 'object') return 'no-sim';
    if (!Array.isArray(f.sim.residents)) return 'no-residents';
    if (!Array.isArray(f.sim.buildings)) return 'no-buildings';
    if (!f.sim.finance || typeof f.sim.finance.funds !== 'number') return 'no-finance';
    if (!f.town || !Array.isArray(f.town.buildings)) return 'no-town';
    return null;
}

/**
 * 存档管理：把"存什么"和"什么时候存"收在一起。
 *
 * 自动存档挂在平台的 onHide 上。小游戏切后台后可能直接被系统回收，
 * onHide 是最后一次能安全写盘的机会，所以这里同步写，不做防抖。
 */
export class SaveManager {
    /** 取当前状态的两个回调。存档时现取，免得持有过期的引用 */
    private _getState: () => SimState | null;
    private _getTown: () => TownModel | null;
    private _onHideBound = () => this.saveNow();
    private _hooked = false;

    constructor(getState: () => SimState | null, getTown: () => TownModel | null) {
        this._getState = getState;
        this._getTown = getTown;
    }

    /** 现在存一次。返回 false 表示没存成（没状态 / 存储写失败） */
    saveNow(): boolean {
        const state = this._getState();
        const town = this._getTown();
        if (!state || !town) return false;
        return writeSave(state, town);
    }

    /** 接上平台的切后台事件，开始自动存 */
    startAutoSave(): void {
        if (this._hooked) return;
        this._hooked = true;
        getPlatform().onHide(this._onHideBound);
    }

    /** 解除自动存（换场景、测试之间用） */
    stopAutoSave(): void {
        if (!this._hooked) return;
        this._hooked = false;
        getPlatform().offHide(this._onHideBound);
    }
}

/** 读档后把 uid 编号对齐用的辅助，供调用方检查 */
export function nextUidOf(file: SaveFile): number {
    return file.town.nextUid;
}

export type { PlacedBuilding };
