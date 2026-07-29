import { StorageManager } from "../../core/data/StorageManager";
import { EventCenter } from "../../core/event/EventCenter";
import { PuzzleStorageKey } from "../PuzzleGameKey";
import { PuzzleSystemEvent } from "../PuzzleSystemEvent";
import {
  DEFAULT_PUZZLE_AVATAR_ID,
  isPuzzleAvatarId,
} from "./PuzzleAvatarCatalog";

/** 当前玩家资料存档版本。 */
const PROFILE_VERSION = 1;

/** 玩家名称允许的最大 Unicode 字符数。 */
export const PUZZLE_PROFILE_NAME_MAX_LENGTH = 12;

/** 默认玩家名称。 */
const DEFAULT_PLAYER_NAME = "拼图玩家";

/** 本地玩家资料。 */
export interface PuzzleProfileData {
  /** 数据结构版本。 */
  version: 1;

  /** 玩家显示名称。 */
  name: string;

  /** 当前头像稳定编号。 */
  avatarId: string;
}

/** 玩家名称或头像的版本化存档服务。 */
export class PuzzleProfileManager {
  /** 当前内存快照。 */
  private static _profile: PuzzleProfileData = this.createDefaultProfile();

  /** 是否已经读取过本地存档。 */
  private static _initialized = false;

  /** 读取、校验并回写规范化玩家资料。 */
  public static initialize(): PuzzleProfileData {
    const stored = StorageManager.get<unknown>(
      PuzzleStorageKey.Profile,
      null,
    );
    this._profile = this.normalize(stored);
    this._initialized = true;
    StorageManager.set(PuzzleStorageKey.Profile, this._profile);
    return this.getProfile();
  }

  /** 返回不可由调用方修改的玩家资料快照。 */
  public static getProfile(): PuzzleProfileData {
    this.ensureInitialized();
    return { ...this._profile };
  }

  /** 更新玩家名称；空名称会被拒绝。 */
  public static setName(name: string): PuzzleProfileData {
    this.ensureInitialized();
    const normalizedName = this.normalizeName(name);
    if (normalizedName.length === 0) {
      throw new Error("玩家名称不能为空。");
    }
    if (this._profile.name === normalizedName) {
      return this.getProfile();
    }
    this._profile = { ...this._profile, name: normalizedName };
    return this.persistAndNotify();
  }

  /** 选择正式头像目录中的头像。 */
  public static selectAvatar(avatarId: string): PuzzleProfileData {
    this.ensureInitialized();
    if (!isPuzzleAvatarId(avatarId)) {
      throw new Error(`头像编号不存在：${avatarId}`);
    }
    if (this._profile.avatarId === avatarId) {
      return this.getProfile();
    }
    this._profile = { ...this._profile, avatarId };
    return this.persistAndNotify();
  }

  /** 测试或完整退出时清空内存状态。 */
  public static reset(): void {
    this._profile = this.createDefaultProfile();
    this._initialized = false;
  }

  /** 首次读取时完成存档初始化。 */
  private static ensureInitialized(): void {
    if (!this._initialized) {
      this.initialize();
    }
  }

  /** 创建新玩家默认资料。 */
  private static createDefaultProfile(): PuzzleProfileData {
    return {
      version: PROFILE_VERSION,
      name: DEFAULT_PLAYER_NAME,
      avatarId: DEFAULT_PUZZLE_AVATAR_ID,
    };
  }

  /** 校验外部存档并迁移到当前安全结构。 */
  private static normalize(value: unknown): PuzzleProfileData {
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      !("name" in value) ||
      !("avatarId" in value) ||
      value.version !== PROFILE_VERSION ||
      typeof value.name !== "string" ||
      typeof value.avatarId !== "string"
    ) {
      return this.createDefaultProfile();
    }
    const name = this.normalizeName(value.name);
    return {
      version: PROFILE_VERSION,
      name: name.length > 0 ? name : DEFAULT_PLAYER_NAME,
      avatarId: isPuzzleAvatarId(value.avatarId)
        ? value.avatarId
        : DEFAULT_PUZZLE_AVATAR_ID,
    };
  }

  /** 去除首尾空白并按 Unicode 字符截断名称。 */
  private static normalizeName(name: string): string {
    return Array.from(name.trim())
      .slice(0, PUZZLE_PROFILE_NAME_MAX_LENGTH)
      .join("");
  }

  /** 保存玩家资料并通知大厅刷新头像。 */
  private static persistAndNotify(): PuzzleProfileData {
    StorageManager.set(PuzzleStorageKey.Profile, this._profile);
    const snapshot = this.getProfile();
    EventCenter.emit(PuzzleSystemEvent.ProfileChanged, snapshot);
    return snapshot;
  }
}
