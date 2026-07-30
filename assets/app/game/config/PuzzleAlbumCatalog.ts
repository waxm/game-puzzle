/** 画册中单个可由关卡点亮的画格。 */
export interface PuzzleAlbumPanelDefinition {
  /** 对应的正式关卡编号。 */
  level: number;

  /** 大厅中展示的场景名称。 */
  title: string;

  /** 关卡原图 SpriteFrame 在 resources 中的完整加载路径。 */
  sourceImagePath: string;
}

/** 一卷年代画册的稳定内容定义。 */
export interface PuzzleAlbumDefinition {
  /** 画册发布后不可修改的稳定编号。 */
  id: string;

  /** 画册所属年代或文化主题。 */
  eraTitle: string;

  /** 当前长卷名称。 */
  scrollTitle: string;

  /** 大厅使用的情绪文案。 */
  subtitle: string;

  /** 按通关顺序排列的全部画格。 */
  panels: readonly PuzzleAlbumPanelDefinition[];
}

/** 单个画格在当前存档中的展示状态。 */
export type PuzzleAlbumPanelStatus = "completed" | "current" | "locked";

/** 大厅渲染一卷画册所需的只读进度快照。 */
export interface PuzzleAlbumProgressSnapshot {
  /** 当前画册的稳定内容定义。 */
  album: PuzzleAlbumDefinition;

  /** 每个画格按原始顺序对应的展示状态。 */
  panelStatuses: readonly PuzzleAlbumPanelStatus[];

  /** 已经点亮的画格数量。 */
  completedPanelCount: number;

  /** 尚未点亮的画格数量。 */
  remainingPanelCount: number;

  /** 当前应当继续修复的画格；整卷完成后为 null。 */
  currentPanel: PuzzleAlbumPanelDefinition | null;

  /** 是否已经完整修复当前长卷。 */
  completed: boolean;
}

/**
 * 首次发布的宋韵画册。
 *
 * 五个画格直接复用前五关原图，避免大厅与玩法分别维护两套素材。
 */
export const PUZZLE_FIRST_ALBUM: PuzzleAlbumDefinition = {
  id: "song-bianjing-day",
  eraTitle: "宋韵人间",
  scrollTitle: "汴京一日",
  subtitle: "循着一日光影，拼回汴京人间",
  panels: [
    {
      level: 1,
      title: "城门晨曦",
      sourceImagePath:
        "textures/game/levels/level_001/level_001_source/spriteFrame",
    },
    {
      level: 2,
      title: "街巷早市",
      sourceImagePath:
        "textures/game/levels/level_002/level_002_source/spriteFrame",
    },
    {
      level: 3,
      title: "茶坊雅集",
      sourceImagePath:
        "textures/game/levels/level_003/level_003_source/spriteFrame",
    },
    {
      level: 4,
      title: "河畔舟行",
      sourceImagePath:
        "textures/game/levels/level_004/level_004_source/spriteFrame",
    },
    {
      level: 5,
      title: "上元灯夜",
      sourceImagePath:
        "textures/game/levels/level_005/level_005_source/spriteFrame",
    },
  ],
};

/**
 * 根据唯一的玩法通关存档生成画册进度。
 *
 * 即使外部存档出现跳关或乱序，也只将真实完成的画格点亮，并把第一个未完成
 * 画格标记为当前目标，避免展示层反向修改玩法进度。
 */
export function createPuzzleAlbumProgress(
  completedLevels: readonly number[],
  album: PuzzleAlbumDefinition = PUZZLE_FIRST_ALBUM,
): PuzzleAlbumProgressSnapshot {
  if (album.panels.length === 0) {
    throw new Error(`画册 ${album.id} 必须至少包含一个画格。`);
  }

  const completedLevelSet = new Set(
    completedLevels.filter(
      (level) => Number.isInteger(level) && level > 0,
    ),
  );
  const currentPanelIndex = album.panels.findIndex(
    (panel) => !completedLevelSet.has(panel.level),
  );
  const completed = currentPanelIndex < 0;
  const panelStatuses = album.panels.map(
    (panel, index): PuzzleAlbumPanelStatus => {
      if (completedLevelSet.has(panel.level)) {
        return "completed";
      }
      return index === currentPanelIndex ? "current" : "locked";
    },
  );
  const completedPanelCount = panelStatuses.filter(
    (status) => status === "completed",
  ).length;

  return {
    album,
    panelStatuses,
    completedPanelCount,
    remainingPanelCount: album.panels.length - completedPanelCount,
    currentPanel: completed ? null : album.panels[currentPanelIndex],
    completed,
  };
}
