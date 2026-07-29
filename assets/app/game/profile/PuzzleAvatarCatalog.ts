/** 头像背景色的 RGB 三元组。 */
export type PuzzleAvatarColor = readonly [number, number, number];

/** 可选择头像的稳定定义。 */
export interface PuzzleAvatarDefinition {
  /** 写入存档的稳定头像编号。 */
  id: string;

  /** 图形头像中央显示的符号。 */
  symbol: string;

  /** 选择列表中的可读名称。 */
  displayName: string;

  /** 头像背景色。 */
  color: PuzzleAvatarColor;
}

/** 当前内置头像目录；新增项不得修改已有 id。 */
export const PUZZLE_AVATAR_CATALOG: readonly PuzzleAvatarDefinition[] = [
  { id: "light", symbol: "光", displayName: "晨光", color: [242, 174, 61] },
  { id: "moon", symbol: "月", displayName: "弦月", color: [75, 116, 217] },
  { id: "star", symbol: "星", displayName: "星芒", color: [137, 86, 214] },
  { id: "leaf", symbol: "叶", displayName: "青叶", color: [57, 157, 104] },
  { id: "flame", symbol: "焰", displayName: "暖焰", color: [219, 87, 72] },
  { id: "cloud", symbol: "云", displayName: "流云", color: [66, 158, 190] },
] as const;

/** 默认头像编号。 */
export const DEFAULT_PUZZLE_AVATAR_ID = PUZZLE_AVATAR_CATALOG[0].id;

/** 按稳定编号取得头像；不存在时返回默认头像。 */
export function getPuzzleAvatar(
  avatarId: string,
): PuzzleAvatarDefinition {
  return (
    PUZZLE_AVATAR_CATALOG.find((avatar) => avatar.id === avatarId) ??
    PUZZLE_AVATAR_CATALOG[0]
  );
}

/** 判断指定编号是否属于正式头像目录。 */
export function isPuzzleAvatarId(avatarId: string): boolean {
  return PUZZLE_AVATAR_CATALOG.some((avatar) => avatar.id === avatarId);
}
