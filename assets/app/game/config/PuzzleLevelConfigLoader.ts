import { ResManager } from "../../core/resource/ResManager";
import { Logger } from "../../core/utils/Logger";
import type { PuzzleLevelConfig } from "./PuzzleLevelConfig";
import {
  getPuzzleLevelConfigPath,
  hasPuzzleLevel,
} from "./PuzzleLevelConfig";

/** 当前运行时支持的单关 JSON 结构版本。 */
const PUZZLE_LEVEL_SCHEMA_VERSION = 1 as const;

/** 单关 JSON 必须且只允许包含的字段。 */
const PUZZLE_LEVEL_FIELDS = [
  "schemaVersion",
  "level",
  "sourceImagePath",
  "rows",
  "columns",
  "boardWidth",
  "boardHeight",
  "timeLimitSeconds",
  "pieceOrder",
] as const;

/** 拼图单关 JSON 的严格加载与校验入口。 */
export class PuzzleLevelConfigLoader {
  /**
   * 通过 ResManager 加载目录登记的单关 JSON，并返回与 JsonAsset 脱离的校验后副本。
   *
   * 关卡不存在、资源加载失败或任一字段无效都会直接抛错，不生成默认配置掩盖问题。
   */
  public static async load(level: number): Promise<PuzzleLevelConfig> {
    if (!Number.isInteger(level) || !hasPuzzleLevel(level)) {
      throw new Error(`拼图关卡目录中不存在第 ${level} 关。`);
    }

    const path = getPuzzleLevelConfigPath(level);
    if (!path) {
      throw new Error(`拼图关卡目录缺少第 ${level} 关的 JSON 路径。`);
    }

    try {
      const source = await ResManager.loadJson<unknown>(path);
      return this.validate(source, level);
    } catch (error) {
      Logger.error(
        `拼图关卡 JSON 加载或校验失败，类型：JsonAsset，路径：${path}`,
        error,
      );
      throw error;
    }
  }

  /**
   * 严格校验单关 JSON 的完整结构，并创建业务可安全持有的独立配置。
   *
   * expectedLevel 用于防止目录文件和 JSON 内关卡编号错配。
   */
  public static validate(
    source: unknown,
    expectedLevel: number,
  ): PuzzleLevelConfig {
    if (
      !Number.isInteger(expectedLevel) ||
      expectedLevel < 1 ||
      expectedLevel > 999
    ) {
      throw new Error("预期关卡编号必须是 1 到 999 的整数。");
    }
    if (!this.isRecord(source)) {
      throw new Error(`第 ${expectedLevel} 关 JSON 根节点必须是对象。`);
    }

    this.assertExactFields(source, expectedLevel);
    if (source.schemaVersion !== PUZZLE_LEVEL_SCHEMA_VERSION) {
      throw new Error(
        `第 ${expectedLevel} 关 schemaVersion 必须为 ${PUZZLE_LEVEL_SCHEMA_VERSION}。`,
      );
    }
    if (!Number.isInteger(source.level) || source.level !== expectedLevel) {
      throw new Error(
        `第 ${expectedLevel} 关 JSON 的 level 与目录编号不一致。`,
      );
    }
    const levelName = `level_${("000" + expectedLevel).slice(-3)}`;
    const expectedSourceImagePath =
      `textures/game/levels/${levelName}/${levelName}_source/spriteFrame`;
    if (source.sourceImagePath !== expectedSourceImagePath) {
      throw new Error(
        `第 ${expectedLevel} 关 sourceImagePath 必须为 ${expectedSourceImagePath}。`,
      );
    }

    const rows = this.readPositiveInteger(source.rows, expectedLevel, "rows");
    const columns = this.readPositiveInteger(
      source.columns,
      expectedLevel,
      "columns",
    );
    const boardWidth = this.readPositiveNumber(
      source.boardWidth,
      expectedLevel,
      "boardWidth",
    );
    const boardHeight = this.readPositiveNumber(
      source.boardHeight,
      expectedLevel,
      "boardHeight",
    );
    const timeLimitSeconds = this.readTimeLimit(
      source.timeLimitSeconds,
      expectedLevel,
    );
    const pieceOrder = this.readPieceOrder(
      source.pieceOrder,
      rows * columns,
      expectedLevel,
    );

    return {
      schemaVersion: PUZZLE_LEVEL_SCHEMA_VERSION,
      level: expectedLevel,
      sourceImagePath: expectedSourceImagePath,
      rows,
      columns,
      boardWidth,
      boardHeight,
      timeLimitSeconds,
      pieceOrder,
    };
  }

  /** 判断未知值是否是可读取字段的普通 JSON 对象。 */
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /** 拒绝缺字段和未知字段，避免拼写错误被静默忽略。 */
  private static assertExactFields(
    source: Record<string, unknown>,
    level: number,
  ): void {
    const actualFields = Object.keys(source);
    const missingFields = PUZZLE_LEVEL_FIELDS.filter(
      (field) => !Object.prototype.hasOwnProperty.call(source, field),
    );
    const unknownFields = actualFields.filter(
      (field) => !PUZZLE_LEVEL_FIELDS.some((allowed) => allowed === field),
    );

    if (missingFields.length > 0) {
      throw new Error(
        `第 ${level} 关 JSON 缺少字段：${missingFields.join("、")}。`,
      );
    }
    if (unknownFields.length > 0) {
      throw new Error(
        `第 ${level} 关 JSON 包含未知字段：${unknownFields.join("、")}。`,
      );
    }
  }

  /** 读取必须大于零的整数规则字段。 */
  private static readPositiveInteger(
    value: unknown,
    level: number,
    field: string,
  ): number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new Error(`第 ${level} 关 ${field} 必须是大于零的整数。`);
    }
    return value as number;
  }

  /** 读取必须大于零的有限尺寸字段。 */
  private static readPositiveNumber(
    value: unknown,
    level: number,
    field: string,
  ): number {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(`第 ${level} 关 ${field} 必须是大于零的有限数值。`);
    }
    return value;
  }

  /** 读取限时秒数；null 代表不限时，其他值必须是正整数。 */
  private static readTimeLimit(value: unknown, level: number): number | null {
    if (value === null) {
      return null;
    }
    if (!Number.isInteger(value) || (value as number) <= 0) {
      throw new Error(
        `第 ${level} 关 timeLimitSeconds 必须是正整数或 null。`,
      );
    }
    return value as number;
  }

  /**
   * 校验拼图块顺序恰好是 0 到总块数减一的完整排列。
   *
   * 使用布尔数组记录重复项，避免 JSON 中重复或遗漏编号导致运行时块数量不一致。
   */
  private static readPieceOrder(
    value: unknown,
    pieceCount: number,
    level: number,
  ): number[] {
    if (!Array.isArray(value) || value.length !== pieceCount) {
      throw new Error(
        `第 ${level} 关 pieceOrder 必须包含 ${pieceCount} 个拼图块编号。`,
      );
    }

    const visited = new Array<boolean>(pieceCount).fill(false);
    const pieceOrder: number[] = [];
    value.forEach((pieceId) => {
      const numericPieceId = pieceId as number;
      if (
        !Number.isInteger(pieceId) ||
        numericPieceId < 0 ||
        numericPieceId >= pieceCount ||
        visited[numericPieceId]
      ) {
        throw new Error(
          `第 ${level} 关 pieceOrder 必须是 0 到 ${pieceCount - 1} 的无重复排列。`,
        );
      }
      visited[numericPieceId] = true;
      pieceOrder.push(numericPieceId);
    });
    return pieceOrder;
  }
}
