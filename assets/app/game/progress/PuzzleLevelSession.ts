import type { PuzzleLevelConfig } from "../config/PuzzleLevelConfig";
import { hasPuzzleLevel } from "../config/PuzzleLevelConfig";
import { PuzzleLevelConfigLoader } from "../config/PuzzleLevelConfigLoader";
import { PuzzleProgressManager } from "./PuzzleProgressManager";

/** 当前进程内正在挑战的拼图关卡。 */
export class PuzzleLevelSession {
  /** 当前已经加载并通过严格校验的关卡配置。 */
  private static _currentConfig: PuzzleLevelConfig | null = null;

  /** 已通过严格校验的配置缓存，重复进入同关时无需再次读取 JsonAsset。 */
  private static readonly _configCache = new Map<number, PuzzleLevelConfig>();

  /** 关卡选择请求编号；后发选择、取消或清理会使旧异步结果失效。 */
  private static _selectionRequestId = 0;

  /**
   * 异步选择一个已经解锁的关卡，JSON 加载和严格校验完成后才更新当前配置。
   *
   * 同一时刻只有最后一次选择可以写入 Session，旧请求完成后会抛出失效错误。
   */
  public static async selectLevel(level: number): Promise<PuzzleLevelConfig> {
    const requestId = ++this._selectionRequestId;
    if (!Number.isInteger(level) || !hasPuzzleLevel(level)) {
      throw new Error(`拼图关卡资源不存在：${level}`);
    }
    if (!PuzzleProgressManager.isUnlocked(level)) {
      throw new Error(`拼图关卡尚未解锁：${level}`);
    }

    const config =
      this._configCache.get(level) ??
      (await PuzzleLevelConfigLoader.load(level));
    if (requestId !== this._selectionRequestId) {
      throw new Error(`拼图关卡选择请求已失效：${level}`);
    }

    // 加载期间本地进度可能被重置，写入当前配置前再次确认选择仍然有效。
    if (!PuzzleProgressManager.isUnlocked(level)) {
      throw new Error(`拼图关卡在加载完成前已被锁定：${level}`);
    }

    this._configCache.set(level, config);
    this._currentConfig = config;
    return config;
  }

  /** 异步选择本地进度中顺序最靠后的已解锁关卡。 */
  public static selectHighestUnlockedLevel(): Promise<PuzzleLevelConfig> {
    return this.selectLevel(PuzzleProgressManager.getHighestUnlockedLevel());
  }

  /** 返回进入 Game 场景前已经准备好的配置；未准备时直接阻止场景启动。 */
  public static getCurrentLevel(): PuzzleLevelConfig {
    if (!this._currentConfig) {
      throw new Error("进入拼图游戏前必须先加载并校验关卡 JSON。");
    }
    if (!PuzzleProgressManager.isUnlocked(this._currentConfig.level)) {
      throw new Error(`当前拼图关卡已经失效：${this._currentConfig.level}`);
    }
    return this._currentConfig;
  }

  /** 使正在加载的旧选择失效，但保留当前已准备配置供现有游戏继续使用。 */
  public static cancelPendingSelection(): void {
    this._selectionRequestId += 1;
  }

  /** 清除当前进程中的关卡选择，不影响本地通关进度。 */
  public static clear(): void {
    this.cancelPendingSelection();
    this._currentConfig = null;
  }
}
