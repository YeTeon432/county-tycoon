import { _decorator, Component } from 'cc';
import { SimApi } from '../core/sim/SimApi';
import { MonthlyReport } from '../core/sim/types';
import { Speed } from './TopBar';

const { ccclass } = _decorator;

/**
 * 时间推进（T307）。
 *
 * 由它按 secondsPerMonth 定时调 sim.stepMonth()，顶栏只管显示速度和把点击转过来。
 * 把「时间」和「界面」放在一起是故意的：模拟层是纯粹的 stepMonth()，
 * 谁来决定什么时候调它是画面层的事（DESIGN 1）。
 *
 * secondsPerMonth 照 CLAUDE.md 的约定不写死在这里：优先用 economy.json 里的值，
 * 读不到时用 60 秒（DESIGN 1，D025）。economy.json 由支线 A 建，读法做成容错，
 * 不存在也不影响。
 *
 * 倍速的实现是"累积时间乘以倍率"，不是"把 stepMonth 调快"——
 * 一个月必须完整结算一次，中途打断会让报告和状态对不上。
 */
@ccclass('TimeController')
export class TimeController extends Component {
    /** 一个游戏月对应的现实秒数 */
    static readonly DEFAULT_SECONDS_PER_MONTH = 60;

    /** 每次结算完一个月后回调（账单、顶栏刷新用） */
    onMonthStepped: ((report: MonthlyReport) => void) | null = null;

    private _sim: SimApi | null = null;
    private _speed: Speed = 1;
    private _secondsPerMonth = TimeController.DEFAULT_SECONDS_PER_MONTH;
    /** 已累积的现实秒数（已乘倍速） */
    private _elapsed = 0;

    get speed(): Speed {
        return this._speed;
    }

    get progress(): number {
        return Math.min(1, this._elapsed / Math.max(0.001, this._secondsPerMonth));
    }

    startClock(sim: SimApi): void {
        this._sim = sim;
        this._elapsed = 0;
    }

    setSpeed(speed: Speed): void {
        this._speed = speed;
    }

    /** 配置表读到了再改，没读到就继续用默认值 */
    setSecondsPerMonth(seconds: number): void {
        if (!isFinite(seconds) || seconds <= 0.5) return;
        this._secondsPerMonth = seconds;
    }

    /** 手动推一个月（调试、以及以后「下个月」按钮用） */
    stepNow(): MonthlyReport | null {
        if (!this._sim) return null;
        this._elapsed = 0;
        return this.emitMonth();
    }

    protected update(dt: number): void {
        if (!this._sim || this._speed === 0) return;
        // dt 偶尔会是很大的数（切后台回来、加载卡顿），夹一下防止一口气跳好几个月
        const step = Math.min(dt, 0.5) * this._speed;
        this._elapsed += step;
        // while 而不是 if：两倍速 + 一帧卡顿的时候可能跨过整月
        let guard = 0;
        while (this._elapsed >= this._secondsPerMonth && guard < 4) {
            this._elapsed -= this._secondsPerMonth;
            this.emitMonth();
            guard++;
        }
        if (this._elapsed >= this._secondsPerMonth) this._elapsed = 0;
    }

    private emitMonth(): MonthlyReport | null {
        if (!this._sim) return null;
        const report = this._sim.stepMonth();
        if (this.onMonthStepped) this.onMonthStepped(report);
        return report;
    }
}
