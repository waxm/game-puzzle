/** 当前拼图关卡的运行状态。 */
export interface PuzzleGameState {
  /** 当前关卡编号。 */
  level: number;

  /** 已正确放置的拼图数量。 */
  placedCount: number;

  /** 本关拼图总数量。 */
  totalCount: number;

  /** 是否已经完成本关。 */
  completed: boolean;

  /** 是否因时间耗尽而失败。 */
  failed: boolean;
}
