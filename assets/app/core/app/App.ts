import { EventCenter } from "../event/EventCenter";
import { AudioManager } from "../audio/AudioManager";
import { PoolManager } from "../pool/PoolManager";
import { ResManager } from "../resource/ResManager";
import { SceneManager } from "../scene/SceneManager";
import { StorageManager } from "../data/StorageManager";
import { TimerManager } from "../timer/TimerManager";
import { UIManager } from "../ui/UIManager";
import { Logger } from "../utils/Logger";

/** 框架初始化时由独立游戏提供的项目配置。 */
export interface AppInitOptions {
    /** 当前游戏独立的存档命名空间，避免同域名下多个游戏共享数据。 */
    storagePrefix?: string;

    /** 当前游戏独立的日志前缀，便于区分不同项目的运行输出。 */
    logPrefix?: string;
}

/**
 * 框架总入口。
 *
 * BootScene 启动时优先调用 App.init()，后续所有核心管理器都可以在这里统一注册。
 */
export class App {
    /** 当前框架版本号，后续框架升级时同步维护。 */
    public static readonly version = "0.0.1";

    /** 框架是否已经初始化。 */
    private static _inited = false;

    /** 简单服务注册表，用来保存全局管理器实例或配置对象。 */
    private static readonly _services: Map<string, unknown> = new Map();

    /** 获取框架初始化状态。 */
    public static get inited(): boolean {
        return this._inited;
    }

    /**
     * 初始化框架。
     *
     * 第一版只做基础状态标记，后续可以在这里串起配置、存档、音频、UI 等模块。
     */
    public static init(options: AppInitOptions = {}): void {
        if (this._inited) {
            Logger.warn("框架已经初始化过，跳过重复初始化。");
            return;
        }

        if (options.logPrefix) {
            Logger.setPrefix(options.logPrefix);
        }
        Logger.info("框架初始化开始。");

        StorageManager.init(options.storagePrefix);
        AudioManager.init();
        // 音频节点跨场景常驻，因此用户音量也必须在框架启动时统一恢复。
        AudioManager.setMusicVolume(StorageManager.get("musicVolume", 0.8));
        AudioManager.setEffectVolume(StorageManager.get("effectVolume", 1));
        UIManager.init();
        SceneManager.syncCurrentScene();

        this.register("StorageManager", StorageManager, true);
        this.register("AudioManager", AudioManager, true);
        this.register("UIManager", UIManager, true);
        this.register("SceneManager", SceneManager, true);

        this._inited = true;
        Logger.info("框架初始化完成。");
    }

    /**
     * 注册一个全局服务。
     *
     * @param name 服务名，例如 AudioManager
     * @param service 服务对象
     * @param force 是否允许覆盖同名服务
     */
    public static register<T>(name: string, service: T, force = false): void {
        if (this._services.has(name) && !force) {
            Logger.warn(`服务已经注册：${name}`);
            return;
        }

        this._services.set(name, service);
    }

    /**
     * 获取一个已经注册的全局服务。
     */
    public static get<T>(name: string): T | null {
        return (this._services.get(name) as T) ?? null;
    }

    /**
     * 移除一个全局服务。
     */
    public static remove(name: string): void {
        this._services.delete(name);
    }

    /**
     * 重置框架状态。
     *
     * 通常用于测试、重新进入游戏，或以后做热重载时清理全局状态。
     */
    public static reset(): void {
        // UI 关闭会触发面板清理逻辑，因此必须在清空全局事件之前执行。
        UIManager.clear();
        TimerManager.clearAll();
        PoolManager.clearAll();
        AudioManager.reset();
        ResManager.reset();
        SceneManager.reset();
        EventCenter.clear();
        this._services.clear();
        this._inited = false;
        Logger.info("框架状态已重置。");
    }
}
