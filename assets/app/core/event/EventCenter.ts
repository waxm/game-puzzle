import { Logger } from "../utils/Logger";

/**
 * 事件回调函数类型。
 *
 * T 表示事件携带的数据类型，不传时默认 unknown。
 */
export type EventCallback<T = unknown> = (data?: T) => void;

/**
 * 单个事件监听对象。
 */
interface EventListener {
    /** 事件触发时调用的函数。 */
    callback: EventCallback;

    /** 监听归属对象，通常传 this，方便销毁时批量注销。 */
    target?: unknown;

    /** 是否只监听一次。 */
    once: boolean;
}

/**
 * 全局事件中心。
 *
 * 用于模块之间解耦通信，例如金币变化、游戏开始、游戏结束等。
 */
export class EventCenter {
    /** 事件名到监听列表的映射。 */
    private static readonly _listeners: Map<string, EventListener[]> = new Map();

    /**
     * 注册一个普通事件监听。
     *
     * @param eventName 事件名
     * @param callback 事件回调
     * @param target 监听归属对象，建议传当前类的 this
     */
    public static on<T = unknown>(eventName: string, callback: EventCallback<T>, target?: unknown): void {
        this.addListener(eventName, callback as EventCallback, target, false);
    }

    /**
     * 注册一个只触发一次的事件监听。
     *
     * 回调执行后会自动注销。
     */
    public static once<T = unknown>(eventName: string, callback: EventCallback<T>, target?: unknown): void {
        this.addListener(eventName, callback as EventCallback, target, true);
    }

    /**
     * 注销事件监听。
     *
     * 不传 callback 和 target 时，会移除这个事件名下的全部监听。
     */
    public static off<T = unknown>(
        eventName: string,
        callback?: EventCallback<T>,
        target?: unknown,
    ): void {
        const listeners = this._listeners.get(eventName);

        if (!listeners) {
            return;
        }

        if (!callback && target === undefined) {
            this._listeners.delete(eventName);
            return;
        }

        // 同时支持按回调、按归属对象、或两者组合进行删除。
        const nextListeners = listeners.filter((listener) => {
            const callbackMatched = callback ? listener.callback === callback : true;
            const targetMatched = target !== undefined ? listener.target === target : true;
            return !(callbackMatched && targetMatched);
        });

        if (nextListeners.length > 0) {
            this._listeners.set(eventName, nextListeners);
        } else {
            this._listeners.delete(eventName);
        }
    }

    /**
     * 派发事件。
     *
     * @param eventName 事件名
     * @param data 事件携带的数据
     */
    public static emit<T = unknown>(eventName: string, data?: T): void {
        const listeners = this._listeners.get(eventName);

        if (!listeners || listeners.length === 0) {
            return;
        }

        // 复制一份监听列表，避免回调里新增或删除监听导致遍历混乱。
        const currentListeners = listeners.slice();

        for (const listener of currentListeners) {
            // 前一个回调可能已经注销后续监听；已不在正式列表中的快照项不得继续执行。
            if ((this._listeners.get(eventName)?.indexOf(listener) ?? -1) < 0) {
                continue;
            }

            if (listener.once) {
                // 必须在执行回调前移除，避免回调内部再次 emit 时一次性监听被触发第二次。
                this.removeListener(eventName, listener);
            }

            try {
                listener.callback(data);
            } catch (error) {
                // 单个模块的监听异常不能阻断其他模块接收同一事件。
                Logger.error(`事件监听执行失败：${eventName}`, error);
            }
        }
    }

    /**
     * 清理事件监听。
     *
     * 不传 target 时会清空所有事件，传 target 时只清理这个对象注册的监听。
     */
    public static clear(target?: unknown): void {
        if (target === undefined) {
            this._listeners.clear();
            return;
        }

        // 删除 Map 项时使用键快照，避免不同 JavaScript 运行环境的迭代行为差异。
        for (const eventName of Array.from(this._listeners.keys())) {
            this.off(eventName, undefined, target);
        }
    }

    /**
     * 获取某个事件当前的监听数量。
     *
     * 主要用于调试事件是否被重复注册。
     */
    public static listenerCount(eventName: string): number {
        return this._listeners.get(eventName)?.length ?? 0;
    }

    /**
     * 统一添加监听的内部方法。
     */
    private static addListener(eventName: string, callback: EventCallback, target: unknown, once: boolean): void {
        const listeners = this._listeners.get(eventName) ?? [];

        // 同一归属对象重复执行生命周期注册时保持幂等，避免一次事件响应多次。
        const duplicated = listeners.some(
            (listener) =>
                listener.callback === callback &&
                listener.target === target &&
                listener.once === once,
        );
        if (duplicated) {
            return;
        }

        listeners.push({
            callback,
            target,
            once,
        });

        this._listeners.set(eventName, listeners);
    }

    /** 按监听对象身份精确移除一项，避免 once 误删后来重新注册的同回调监听。 */
    private static removeListener(eventName: string, listenerToRemove: EventListener): void {
        const listeners = this._listeners.get(eventName);
        if (!listeners) {
            return;
        }

        const nextListeners = listeners.filter((listener) => listener !== listenerToRemove);
        if (nextListeners.length > 0) {
            this._listeners.set(eventName, nextListeners);
        } else {
            this._listeners.delete(eventName);
        }
    }
}
