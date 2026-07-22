/** 拼图关卡配置。 */
export interface PuzzleLevelConfig {
  /** 单关 JSON 结构版本，用于在格式升级时拒绝误读旧数据。 */
  schemaVersion: 1;

  /** 关卡编号。 */
  level: number;

  /** 原图 SpriteFrame 子资源在 resources 中的加载路径。 */
  sourceImagePath: string;

  /** 纵向切分数量。 */
  rows: number;

  /** 横向切分数量。 */
  columns: number;

  /** 完整拼图在游戏界面中的显示宽度。 */
  boardWidth: number;

  /** 完整拼图在游戏界面中的显示高度。 */
  boardHeight: number;

  /** 进入正式拼图阶段后的限时秒数；null 表示本关不限时。 */
  timeLimitSeconds: number | null;

  /** 生成时的拼图块展示顺序。 */
  pieceOrder: number[];
}

/**
 * 导出自动生成的关卡资源目录。
 *
 * 新增或删除关卡图片后运行 tools/generate-puzzle-level-configs.mjs，
 * 目录只负责说明关卡是否存在以及 JSON 的加载位置，玩法参数由单关 JSON 提供。
 */
export {
  getPuzzleLevelConfigPath,
  getNextPuzzleLevelNumber,
  hasPuzzleLevel,
  PuzzleLevelNumbers,
} from "./PuzzleLevelCatalog.generated";
