import { StorageManager } from "../../core/data/StorageManager";
import {
  getNextPuzzleLevelNumber,
  hasPuzzleLevel,
  PuzzleLevelNumbers,
} from "../config/PuzzleLevelConfig";

/** 拼图进度存档结构。 */
export interface PuzzleProgressData {
  /** 存档结构版本，后续升级字段时用于迁移。 */
  version: 1;

  /** 已经完成的关卡编号。 */
  completedLevels: number[];

  /** 当前已经解锁的关卡编号。 */
  unlockedLevels: number[];
}

/** 单次通关后返回给场景的结算结果。 */
export interface PuzzleCompletionResult {
  /** 本次完成的关卡编号。 */
  completedLevel: number;

  /** 下一关编号；全部关卡完成时为 null。 */
  nextLevel: number | null;

  /** 本次通关后是否已经完成全部关卡。 */
  allCompleted: boolean;
}

/** 拼图关卡解锁与本地进度管理器。 */
export class PuzzleProgressManager {
  /** 拼图进度使用的本地存档键。 */
  private static readonly STORAGE_KEY = "puzzleProgress";

  /** 当前存档结构版本。 */
  private static readonly SAVE_VERSION = 1 as const;

  /** 读取并修正本地存档，保证至少解锁资源目录中的第一关。 */
  public static getProgress(): PuzzleProgressData {
    const defaultProgress = this.createDefaultProgress();
    const stored = StorageManager.get<Partial<PuzzleProgressData>>(
      this.STORAGE_KEY,
      defaultProgress,
    );
    const progress = this.normalizeProgress(stored);

    // 旧存档或异常数据修正后立即回写，后续业务始终读取统一结构。
    if (JSON.stringify(stored) !== JSON.stringify(progress)) {
      this.save(progress);
    }
    return this.cloneProgress(progress);
  }

  /** 返回当前进度中顺序最靠后的已解锁关卡。 */
  public static getHighestUnlockedLevel(): number {
    const unlocked = new Set(this.getProgress().unlockedLevels);
    for (let index = PuzzleLevelNumbers.length - 1; index >= 0; index -= 1) {
      const level = PuzzleLevelNumbers[index];
      if (unlocked.has(level)) {
        return level;
      }
    }
    return PuzzleLevelNumbers[0];
  }

  /** 判断指定关卡是否已经解锁且已登记 JSON 资源。 */
  public static isUnlocked(level: number): boolean {
    return (
      hasPuzzleLevel(level) &&
      this.getProgress().unlockedLevels.indexOf(level) >= 0
    );
  }

  /** 记录通关并解锁资源目录中的下一关。 */
  public static completeLevel(level: number): PuzzleCompletionResult {
    if (!this.isUnlocked(level)) {
      throw new Error(`不能结算尚未解锁或不存在的拼图关卡：${level}`);
    }

    const progress = this.getProgress();
    const completedLevels = new Set(progress.completedLevels);
    const unlockedLevels = new Set(progress.unlockedLevels);
    const nextLevel = getNextPuzzleLevelNumber(level);

    completedLevels.add(level);
    if (nextLevel !== null) {
      unlockedLevels.add(nextLevel);
    }

    this.save(
      this.normalizeProgress({
        version: this.SAVE_VERSION,
        completedLevels: Array.from(completedLevels),
        unlockedLevels: Array.from(unlockedLevels),
      }),
    );

    return {
      completedLevel: level,
      nextLevel,
      allCompleted: nextLevel === null,
    };
  }

  /** 创建首次启动游戏时使用的默认进度。 */
  private static createDefaultProgress(): PuzzleProgressData {
    return {
      version: this.SAVE_VERSION,
      completedLevels: [],
      unlockedLevels: [PuzzleLevelNumbers[0]],
    };
  }

  /** 清除无效编号，并根据已完成关卡补齐应当解锁的下一关。 */
  private static normalizeProgress(
    source: Partial<PuzzleProgressData> | null | undefined,
  ): PuzzleProgressData {
    const existingLevels = new Set<number>(PuzzleLevelNumbers);
    const completedLevels = this.normalizeLevelList(
      source?.completedLevels,
      existingLevels,
    );
    const unlockedLevels = new Set(
      this.normalizeLevelList(source?.unlockedLevels, existingLevels),
    );

    unlockedLevels.add(PuzzleLevelNumbers[0]);
    completedLevels.forEach((level) => {
      unlockedLevels.add(level);
      const nextLevel = getNextPuzzleLevelNumber(level);
      if (nextLevel !== null) {
        unlockedLevels.add(nextLevel);
      }
    });

    return {
      version: this.SAVE_VERSION,
      completedLevels: this.sortByCatalog(completedLevels),
      unlockedLevels: this.sortByCatalog(Array.from(unlockedLevels)),
    };
  }

  /** 把未知存档值转换为去重后的有效关卡编号列表。 */
  private static normalizeLevelList(
    value: unknown,
    existingLevels: ReadonlySet<number>,
  ): number[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(
      new Set(
        value.filter(
          (level): level is number =>
            typeof level === "number" && existingLevels.has(level),
        ),
      ),
    );
  }

  /** 按关卡资源目录的实际顺序排序，兼容编号不连续的情况。 */
  private static sortByCatalog(levels: readonly number[]): number[] {
    const levelSet = new Set(levels);
    return PuzzleLevelNumbers.filter((level) => levelSet.has(level));
  }

  /** 保存独立副本，避免调用方后续修改数组影响本次写入语义。 */
  private static save(progress: PuzzleProgressData): void {
    StorageManager.set(this.STORAGE_KEY, this.cloneProgress(progress));
  }

  /** 返回进度深拷贝，防止外部直接修改管理器内部数据。 */
  private static cloneProgress(
    progress: PuzzleProgressData,
  ): PuzzleProgressData {
    return {
      version: progress.version,
      completedLevels: [...progress.completedLevels],
      unlockedLevels: [...progress.unlockedLevels],
    };
  }
}
