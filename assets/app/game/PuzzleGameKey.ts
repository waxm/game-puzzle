/** 拼图业务使用的具名对象池，集中定义以避免散落匿名字符串。 */
export const PuzzlePoolName = {
  /** 运行中的单块拼图节点池。 */
  Piece: "puzzle.piece",
} as const;

/** 拼图业务通过资源管理器动态加载的稳定路径。 */
export const PuzzleResourcePath = {
  /** 单块拼图 Prefab，不带扩展名。 */
  PiecePrefab: "prefabs/game/PuzzlePiece",
} as const;
