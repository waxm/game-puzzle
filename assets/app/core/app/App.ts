import { ResolutionPolicy, view } from "cc";
import { EventCenter } from "../event/EventCenter";
import { AudioManager } from "../audio/AudioManager";
import { PoolManager } from "../pool/PoolManager";
import { ResManager } from "../resource/ResManager";
import { SceneManager } from "../scene/SceneManager";
import { StorageManager } from "../data/StorageManager";
import { TimerManager } from "../timer/TimerManager";
import { UIManager } from "../ui/UIManager";
import { Logger } from "../utils/Logger";

/** 框架支持的设计分辨率适配策略。 */
export enum AppResolutionPolicy {
    /** 完整显示设计区域，设备比例不一致时允许留边。 */
    ShowAll = "show-all",

    /** 固定设计宽度，按设备比例扩展或裁切内部高度。 */
    FixedWidth = "fixed-width",

    /** 固定设计高度，按设备比例扩展或裁切内部宽度。 */
    FixedHeight = "fixed-height",

    /** 拉伸设计区域以完全填满屏幕。 */
    ExactFit = "exact-fit",

    /** 保持比例并填满屏幕，允许裁切超出区域。 */
    NoBorder = "no-border",
}

/** 游戏启动时使用的设计分辨率配置。 */
export interface AppDisplayOptions {
    /** 设计分辨率宽度。 */
    width?: number;

    /** 设计分辨率高度。 */
    height?: number;

    /** 设计区域适配策略，默认完整显示。 */
    policy?: AppResolutionPolicy;
}

/** 框架初始化时由独立游戏提供的项目配置。 */
export interface AppInitOptions {
    /** 当前游戏独立的存档命名空间，避免同域名下多个游戏共享数据。 */
    storagePrefix?: string;

    /** 当前游戏独立的日志前缀，便于区分不同项目的运行输出。 */
    logPrefix?: string;

    /** 当前游戏的设计分辨率和屏幕适配策略。 */
    display?: Readonly<AppDisplayOptions>;
}

/**
 * 框架总入口。
 *
 * BootScene 启动时优先调用 App.init()，后续所有核心管理器都可以在这里统一注册。
 */
export class App {
    /** 当前框架版本号，后续框架升级时同步维护。 */
    public static readonly version = "0.0.1";

    /** 框架默认设计宽度。 */
    private static readonly _defaultDesignWidth = 640;

    /** 框架默认设计高度。 */
    private static readonly _defaultDesignHeight = 1136;

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

        this.applyDisplayOptions(options.display);
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

    /** 在任何业务 UI 初始化前统一应用设计分辨率和适配策略。 */
    private static applyDisplayOptions(options: Readonly<AppDisplayOptions> = {}): void {
        const width = options.width ?? this._defaultDesignWidth;
        const height = options.height ?? this._defaultDesignHeight;
        if (!Number.isFinite(width) || width <= 0) {
            throw new RangeError(`设计分辨率宽度必须是正数：${String(width)}`);
        }
        if (!Number.isFinite(height) || height <= 0) {
            throw new RangeError(`设计分辨率高度必须是正数：${String(height)}`);
        }

        const policy = options.policy ?? AppResolutionPolicy.ShowAll;
        view.setDesignResolutionSize(
            width,
            height,
            this.resolveResolutionPolicy(policy),
        );
    }

    /** 把框架公开策略转换为 Creator 的运行时策略常量。 */
    private static resolveResolutionPolicy(policy: AppResolutionPolicy): number {
        switch (policy) {
            case AppResolutionPolicy.ShowAll:
                return ResolutionPolicy.SHOW_ALL;
            case AppResolutionPolicy.FixedWidth:
                return ResolutionPolicy.FIXED_WIDTH;
            case AppResolutionPolicy.FixedHeight:
                return ResolutionPolicy.FIXED_HEIGHT;
            case AppResolutionPolicy.ExactFit:
                return ResolutionPolicy.EXACT_FIT;
            case AppResolutionPolicy.NoBorder:
                return ResolutionPolicy.NO_BORDER;
            default: {
                const unsupportedPolicy: never = policy;
                throw new Error(
                    `不支持的设计分辨率适配策略：${String(unsupportedPolicy)}`,
                );
            }
        }
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
