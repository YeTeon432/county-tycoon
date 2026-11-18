/**
 * 一天的时钟（D024）。
 *
 * 模拟层按「月」结算，画面上把一个月演成「一天」：月初是早上 startHour 点，月末是晚上 endHour 点。
 * 夜里不演（所有人都在家），所以一个月的 20 秒全用在白天。
 *
 * 谁在推进时间由 TimeController 决定；这里只是把它的进度换算成钟点，
 * 让街上的人（LifeLayer）和顶栏（TopBar）读同一个钟，不互相 import。
 * GameRoot 负责把 progress / speed 接上；没接时停在早上、速度 1。
 */
export const DayClock = {
    /** 一天从几点演到几点（config/traffic.json: day，LifeLayer 读到后写进来） */
    startHour: 6,
    endHour: 22,

    /** 本月进度 0..1（TimeController.progress） */
    progress: (): number => 0,
    /** 当前倍速：0 暂停 / 1 / 2 */
    speed: (): number => 1,

    /** 现在几点（小数，比如 7.5 = 七点半） */
    hour(): number {
        const p = Math.max(0, Math.min(1, DayClock.progress()));
        return DayClock.startHour + (DayClock.endHour - DayClock.startHour) * p;
    },

    /** 一个游戏小时对应本月进度的多少（排日程换算用） */
    hourToProgress(h: number): number {
        return (h - DayClock.startHour) / Math.max(0.001, DayClock.endHour - DayClock.startHour);
    },

    /** 顶栏显示：「上午 8 点」 */
    label(h = DayClock.hour()): string {
        const n = Math.floor(h);
        const part = n < 9 ? '早上' : n < 12 ? '上午' : n < 14 ? '中午' : n < 18 ? '下午' : '晚上';
        const shown = n > 12 ? n - 12 : n;
        return `${part} ${shown} 点`;
    },
};
