import { AudioManager } from "../../core/audio/AudioManager";
import { StorageManager } from "../../core/data/StorageManager";
import { EventCenter } from "../../core/event/EventCenter";
import { PuzzleStorageKey } from "../PuzzleGameKey";
import { PuzzleSystemEvent } from "../PuzzleSystemEvent";

/** 当前设置存档版本。 */
const SETTINGS_VERSION = 1;

/** 设置页持久化的数据。 */
export interface PuzzleSettingsData {
  /** 数据结构版本。 */
  version: 1;

  /** 是否允许播放背景音乐和音效。 */
  soundEnabled: boolean;

  /** 是否允许触发设备震动反馈。 */
  vibrationEnabled: boolean;
}

/** 设置模块使用的音频控制接口。 */
export interface PuzzleSettingsAudioPort {
  /** 同步背景音乐开关。 */
  setMusicEnabled(enabled: boolean): void;

  /** 同步音效开关。 */
  setEffectsEnabled(enabled: boolean): void;
}

/** 设置模块使用的震动接口。 */
export interface PuzzleSettingsHapticsPort {
  /** 请求一次短震动；平台不支持时返回 false。 */
  vibrate(durationMs: number): boolean;
}

/** 可由宿主接入的设置页外部动作。 */
export type PuzzleSettingsExternalAction =
  | "help"
  | "rating"
  | "privacy"
  | "terms";

/** 帮助、评分和协议页面的统一扩展接口。 */
export interface PuzzleSettingsExternalPort {
  /** 执行指定外部动作；尚未接入或打开失败时返回 false。 */
  open(action: PuzzleSettingsExternalAction): boolean | Promise<boolean>;
}

/** 默认音频适配器，把开关同步到框架音频服务。 */
const DEFAULT_AUDIO_PORT: PuzzleSettingsAudioPort = {
  setMusicEnabled(enabled: boolean): void {
    AudioManager.setMusicVolume(enabled ? 1 : 0);
  },
  setEffectsEnabled(enabled: boolean): void {
    AudioManager.setEffectVolume(enabled ? 1 : 0);
  },
};

/** 浏览器震动能力的最小边界类型。 */
interface BrowserNavigatorWithVibration {
  /** Web Vibration API。 */
  vibrate?: (pattern: number) => boolean;
}

/** 默认震动适配器；不支持 Vibration API 的平台会安全降级。 */
const DEFAULT_HAPTICS_PORT: PuzzleSettingsHapticsPort = {
  vibrate(durationMs: number): boolean {
    // Cocos 的 TypeScript 运行环境不保证完整 DOM 类型，这里只收窄实际使用的浏览器边界。
    const navigatorValue = (globalThis as {
      navigator?: BrowserNavigatorWithVibration;
    }).navigator;
    return navigatorValue?.vibrate?.(durationMs) ?? false;
  },
};

/** 默认外部动作适配器，明确表示接口尚未接入。 */
const DEFAULT_EXTERNAL_PORT: PuzzleSettingsExternalPort = {
  open(): boolean {
    return false;
  },
};

/** 声音、震动和设置页扩展动作的统一服务。 */
export class PuzzleSettingsManager {
  /** 当前音频实现，可由自动化测试或平台层替换。 */
  private static _audioPort: PuzzleSettingsAudioPort = DEFAULT_AUDIO_PORT;

  /** 当前震动实现，可由原生平台层替换。 */
  private static _hapticsPort: PuzzleSettingsHapticsPort =
    DEFAULT_HAPTICS_PORT;

  /** 帮助、评分和协议动作实现。 */
  private static _externalPort: PuzzleSettingsExternalPort =
    DEFAULT_EXTERNAL_PORT;

  /** 当前内存中的规范化设置。 */
  private static _settings: PuzzleSettingsData =
    this.createDefaultSettings();

  /** 是否已经从存档初始化。 */
  private static _initialized = false;

  /** 从存档加载设置并立即应用音频状态。 */
  public static initialize(): PuzzleSettingsData {
    const stored = StorageManager.get<unknown>(
      PuzzleStorageKey.Settings,
      null,
    );
    this._settings = this.normalize(stored);
    this._initialized = true;
    this.applyAudioSettings();
    StorageManager.set(PuzzleStorageKey.Settings, this._settings);
    return this.getSettings();
  }

  /** 返回不允许外部修改的设置快照。 */
  public static getSettings(): PuzzleSettingsData {
    this.ensureInitialized();
    return { ...this._settings };
  }

  /** 设置声音开关并持久化。 */
  public static setSoundEnabled(enabled: boolean): PuzzleSettingsData {
    this.ensureInitialized();
    if (this._settings.soundEnabled === enabled) {
      return this.getSettings();
    }
    this._settings = { ...this._settings, soundEnabled: enabled };
    this.applyAudioSettings();
    return this.persistAndNotify();
  }

  /** 设置震动开关并持久化；开启时提供一次可感知的预览。 */
  public static setVibrationEnabled(enabled: boolean): PuzzleSettingsData {
    this.ensureInitialized();
    if (this._settings.vibrationEnabled !== enabled) {
      this._settings = { ...this._settings, vibrationEnabled: enabled };
      this.persistAndNotify();
    }
    if (enabled) {
      this.vibrate(35);
    }
    return this.getSettings();
  }

  /** 在震动开启时请求一次反馈。 */
  public static vibrate(durationMs = 20): boolean {
    this.ensureInitialized();
    if (!this._settings.vibrationEnabled) {
      return false;
    }
    return this._hapticsPort.vibrate(Math.max(1, Math.round(durationMs)));
  }

  /** 执行帮助、评分或协议扩展动作。 */
  public static openExternalAction(
    action: PuzzleSettingsExternalAction,
  ): boolean | Promise<boolean> {
    return this._externalPort.open(action);
  }

  /** 注入音频适配器，供平台接入和确定性测试使用。 */
  public static setAudioPort(port: PuzzleSettingsAudioPort): void {
    this._audioPort = port;
    if (this._initialized) {
      this.applyAudioSettings();
    }
  }

  /** 注入震动适配器，供原生平台接入和确定性测试使用。 */
  public static setHapticsPort(port: PuzzleSettingsHapticsPort): void {
    this._hapticsPort = port;
  }

  /** 注入帮助、评分和协议动作实现。 */
  public static setExternalPort(port: PuzzleSettingsExternalPort): void {
    this._externalPort = port;
  }

  /** 测试或完整退出时恢复默认适配器和未初始化状态。 */
  public static reset(): void {
    this._audioPort = DEFAULT_AUDIO_PORT;
    this._hapticsPort = DEFAULT_HAPTICS_PORT;
    this._externalPort = DEFAULT_EXTERNAL_PORT;
    this._settings = this.createDefaultSettings();
    this._initialized = false;
  }

  /** 保证首次访问时也会读取存档。 */
  private static ensureInitialized(): void {
    if (!this._initialized) {
      this.initialize();
    }
  }

  /** 创建新玩家的默认设置。 */
  private static createDefaultSettings(): PuzzleSettingsData {
    return {
      version: SETTINGS_VERSION,
      soundEnabled: true,
      vibrationEnabled: true,
    };
  }

  /** 校验外部存档，损坏或旧结构统一回退到安全默认值。 */
  private static normalize(value: unknown): PuzzleSettingsData {
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      !("soundEnabled" in value) ||
      !("vibrationEnabled" in value)
    ) {
      return this.createDefaultSettings();
    }
    if (
      value.version !== SETTINGS_VERSION ||
      typeof value.soundEnabled !== "boolean" ||
      typeof value.vibrationEnabled !== "boolean"
    ) {
      return this.createDefaultSettings();
    }
    return {
      version: SETTINGS_VERSION,
      soundEnabled: value.soundEnabled,
      vibrationEnabled: value.vibrationEnabled,
    };
  }

  /** 把当前设置同步到框架音频管理器。 */
  private static applyAudioSettings(): void {
    this._audioPort.setMusicEnabled(this._settings.soundEnabled);
    this._audioPort.setEffectsEnabled(this._settings.soundEnabled);
  }

  /** 保存设置并派发不可变快照。 */
  private static persistAndNotify(): PuzzleSettingsData {
    StorageManager.set(PuzzleStorageKey.Settings, this._settings);
    const snapshot = this.getSettings();
    EventCenter.emit(PuzzleSystemEvent.SettingsChanged, snapshot);
    return snapshot;
  }
}
