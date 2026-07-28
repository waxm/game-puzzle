/** 拼图关卡的显式生命周期状态。 */
export enum PuzzleGameStatus {
  /** 控制器已创建但尚未开始。 */
  Idle = "idle",

  /** 关卡正在接受输入并推进时间。 */
  Running = "running",

  /** 关卡暂时停止输入和时间推进，允许恢复。 */
  Paused = "paused",

  /** 规则棋盘已经确认完整还原。 */
  Success = "success",

  /** 限时关卡已经耗尽时间。 */
  Failure = "failure",

  /** 控制器已经退出并完成业务事件清理。 */
  Disposed = "disposed",
}

/** 当前拼图关卡的运行状态。 */
export interface PuzzleGameState {
  /** 当前显式生命周期状态。 */
  readonly status: PuzzleGameStatus;

  /** 当前关卡编号。 */
  readonly level: number;

  /** 已正确放置的拼图数量。 */
  readonly placedCount: number;

  /** 本关拼图总数量。 */
  readonly totalCount: number;

  /** 是否已经完成本关；由 success 状态派生，保留给现有结算边界读取。 */
  readonly completed: boolean;

  /** 是否因时间耗尽而失败；由 failure 状态派生。 */
  readonly failed: boolean;
}
