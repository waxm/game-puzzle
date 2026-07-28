/** 大厅请求开始拼图关卡时携带的数据。 */
export interface GameStartRequest {
  /** 需要进入的已解锁关卡编号。 */
  level: number;
}

/**
 * 游戏事件名。
 *
 * 游戏层通过这些统一事件和 UI、场景通信，避免散落的字符串事件名。
 */
export enum GameEvent {
  /** 携带目标关卡编号开始游戏。 */
  GameStart = "GameStart",

  /** 拼图状态变化。 */
  PuzzleStateChanged = "PuzzleStateChanged",

  /** 当前拼图关卡完成。 */
  PuzzleCompleted = "PuzzleCompleted",

  /** 通关结算后请求进入已经解锁的下一关。 */
  PuzzleNextLevel = "PuzzleNextLevel",

  /** 拼图面板通知控制器本关时间已经耗尽。 */
  PuzzleTimeExpired = "PuzzleTimeExpired",

  /** 控制器确认本关失败。 */
  PuzzleFailed = "PuzzleFailed",

  /** 请求重新开始本关。 */
  PuzzleRestart = "PuzzleRestart",

  /** 返回大厅。 */
  BackToLobby = "BackToLobby",
}
