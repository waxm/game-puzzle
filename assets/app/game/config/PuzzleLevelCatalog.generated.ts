// 本文件由 tools/generate-puzzle-level-configs.mjs 自动生成，请勿手工维护。

/** 当前配置与纹理目录中一一对应的关卡编号。 */
export const PuzzleLevelNumbers = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 100,
] as const;

/** 判断指定编号是否存在可加载的关卡 JSON。 */
export function hasPuzzleLevel(level: number): boolean {
  return PuzzleLevelNumbers.some((candidate) => candidate === level);
}

/** 根据关卡编号返回 JsonAsset 的 resources 路径，不存在时返回 null。 */
export function getPuzzleLevelConfigPath(level: number): string | null {
  if (!hasPuzzleLevel(level)) {
    return null;
  }
  const levelName = "level_" + ("000" + level).slice(-3);
  return `configs/game/levels/${levelName}`;
}

/** 返回当前关卡在目录中的下一关编号，最后一关返回 null。 */
export function getNextPuzzleLevelNumber(level: number): number | null {
  const currentIndex = PuzzleLevelNumbers.findIndex(
    (candidate) => candidate === level,
  );
  if (currentIndex < 0 || currentIndex >= PuzzleLevelNumbers.length - 1) {
    return null;
  }
  return PuzzleLevelNumbers[currentIndex + 1];
}
