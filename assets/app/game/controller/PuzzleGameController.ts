import { EventCenter } from "../../core/event/EventCenter";
import { Logger } from "../../core/utils/Logger";
import type { PuzzleLevelConfig } from "../config/PuzzleLevelConfig";
import { GameEvent } from "../GameEvent";
import { PuzzleBoard } from "../logic/PuzzleBoard";
import type { PuzzleBoardUpdate } from "../logic/PuzzleBoard";
import type { PuzzleMovePlan } from "../logic/PuzzleMovePlanner";
import type { PuzzleGameState } from "../model/PuzzleGameState";
import type { PuzzleGroup } from "../model/PuzzleGroup";

/** 单个拼图关卡的状态控制器。 */
export class PuzzleGameController {
  /** 当前关卡的拼图总数，由行列数计算，避免配置重复。 */
  private readonly _totalPieces: number;

  /** 当前关卡状态。 */
  private _state: PuzzleGameState;

  /** 当前关卡唯一的棋盘规则真相。 */
  private readonly _board: PuzzleBoard;

  /** 是否已经注册关卡业务事件，防止重复启动时重复监听。 */
  private _eventsBound = false;

  /** 使用场景传入的关卡配置创建独立控制器。 */
  public constructor(private readonly _levelConfig: PuzzleLevelConfig) {
    this._totalPieces = _levelConfig.rows * _levelConfig.columns;
    this._board = new PuzzleBoard(
      _levelConfig.rows,
      _levelConfig.columns,
      _levelConfig.pieceOrder,
    );
    this._state = this.createInitialState(this._board.currentUpdate);
  }

  /** 返回当前格子占用的只读规则视图。 */
  public get pieceIdsByCell(): readonly number[] {
    return this._board.pieceIdsByCell;
  }

  /** 返回拼图编号到格子编号的只读规则索引。 */
  public get cellIndexByPieceId(): ReadonlyMap<number, number> {
    return this._board.cellIndexByPieceId;
  }

  /** 返回当前全部真实组合。 */
  public get groups(): readonly PuzzleGroup[] {
    return this._board.groups;
  }

  /** 返回最近一次棋盘规则变化结果。 */
  public get currentBoardUpdate(): PuzzleBoardUpdate {
    return this._board.currentUpdate;
  }

  /** 启动关卡并派发初始状态。 */
  public start(): void {
    this.bindEvents();
    this.restart();
    Logger.info(
      `${this._levelConfig.rows}×${this._levelConfig.columns} 拼图第 ${this._levelConfig.level} 关已启动。`,
    );
  }

  /** 销毁控制器并注销事件。 */
  public destroy(): void {
    this.unbindEvents();
  }

  /** 返回指定拼图当前所在格子。 */
  public getCellIndexByPieceId(pieceId: number): number {
    return this._board.getCellIndexByPieceId(pieceId);
  }

  /** 返回指定格子当前占用的拼图编号。 */
  public getPieceIdAt(cellIndex: number): number {
    return this._board.getPieceIdAt(cellIndex);
  }

  /** 返回指定拼图当前所属组合。 */
  public getGroupByPieceId(pieceId: number): PuzzleGroup | null {
    return this._board.getGroupByPieceId(pieceId);
  }

  /** 根据锚点当前完整组合创建确定的移动计划。 */
  public createMovePlan(
    anchorPieceId: number,
    targetAnchorCellIndex: number,
  ): PuzzleMovePlan {
    return this._board.createMovePlan(anchorPieceId, targetAnchorCellIndex);
  }

  /** 判断两块拼图当前是否按原图方向正确连接。 */
  public arePiecesCorrectlyConnected(
    firstPieceId: number,
    secondPieceId: number,
  ): boolean {
    return this._board.arePiecesCorrectlyConnected(
      firstPieceId,
      secondPieceId,
    );
  }

  /**
   * 提交移动并由规则棋盘重新计算进度与完成状态。
   *
   * 成功或失败后返回 null，保证旧输入不能继续改变棋盘和结算结果。
   */
  public commitMovePlan(plan: PuzzleMovePlan): PuzzleBoardUpdate | null {
    if (this._state.completed || this._state.failed) {
      return null;
    }
    const update = this._board.commitMovePlan(plan);
    this.applyBoardUpdate(update);
    return update;
  }

  /** 自动完成一次严格推进的正确组合，并复用普通移动规划和棋盘提交规则。 */
  public autoMerge(): PuzzleBoardUpdate | null {
    if (this._state.completed || this._state.failed) {
      return null;
    }
    const update = this._board.autoMerge();
    if (!update) {
      return null;
    }
    this.applyBoardUpdate(update);
    return update;
  }

  /** 注销关卡业务事件；允许重复调用。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    EventCenter.off(GameEvent.PuzzleRestart, this.onRestartRequest, this);
    EventCenter.off(
      GameEvent.PuzzleTimeExpired,
      this.onTimeExpiredRequest,
      this,
    );
  }

  /** 响应 UI 的重玩请求。 */
  private onRestartRequest = (): void => this.restart();

  /** 时间耗尽时锁定本关状态并通知场景打开失败弹窗。 */
  private onTimeExpiredRequest = (): void => {
    if (this._state.completed || this._state.failed) {
      return;
    }
    this._state.failed = true;
    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
    EventCenter.emit(GameEvent.PuzzleFailed, this.getState());
  };

  /** 清空完成记录并恢复初始状态。 */
  private restart(): void {
    const update = this._board.reset(this._levelConfig.pieceOrder);
    this._state = this.createInitialState(update);
    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
  }

  /** 注册关卡业务事件。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    EventCenter.on(GameEvent.PuzzleRestart, this.onRestartRequest, this);
    EventCenter.on(
      GameEvent.PuzzleTimeExpired,
      this.onTimeExpiredRequest,
      this,
    );
  }

  /** 创建与当前规则棋盘一致的全新运行状态。 */
  private createInitialState(update: PuzzleBoardUpdate): PuzzleGameState {
    return {
      level: this._levelConfig.level,
      placedCount: update.placedCount,
      totalCount: this._totalPieces,
      completed: update.completed,
      failed: false,
    };
  }

  /** 把棋盘规则结果同步到状态并派发唯一的进度与通关事件。 */
  private applyBoardUpdate(update: PuzzleBoardUpdate): void {
    this._state.placedCount = update.placedCount;
    this._state.completed = update.completed;
    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
    if (update.completed) {
      EventCenter.emit(GameEvent.PuzzleCompleted, this.getState());
    }
  }

  /** 返回状态副本，防止 UI 意外修改控制器内部数据。 */
  private getState(): PuzzleGameState {
    return { ...this._state };
  }
}
