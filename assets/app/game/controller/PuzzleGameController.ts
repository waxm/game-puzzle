import { EventCenter } from "../../core/event/EventCenter";
import { Logger } from "../../core/utils/Logger";
import type { PuzzleLevelConfig } from "../config/PuzzleLevelConfig";
import { GameEvent } from "../GameEvent";
import { PuzzleBoard } from "../logic/PuzzleBoard";
import type { PuzzleBoardUpdate } from "../logic/PuzzleBoard";
import type { PuzzleMovePlan } from "../logic/PuzzleMovePlanner";
import {
  PuzzleGameStatus,
} from "../model/PuzzleGameState";
import type { PuzzleGameState } from "../model/PuzzleGameState";
import type { PuzzleGroup } from "../model/PuzzleGroup";

/** 单个拼图关卡的状态控制器。 */
export class PuzzleGameController {
  /** 当前关卡的拼图总数，由行列数计算，避免配置重复。 */
  private readonly _totalPieces: number;

  /** 当前关卡显式生命周期状态。 */
  private _status = PuzzleGameStatus.Idle;

  /** 当前由规则棋盘确认的显示进度。 */
  private _placedCount: number;

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
    this._placedCount = this._board.currentUpdate.placedCount;
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

  /** 返回当前显式生命周期状态。 */
  public get status(): PuzzleGameStatus {
    return this._status;
  }

  /** 返回创建本控制器时使用的只读关卡配置。 */
  public get levelConfig(): PuzzleLevelConfig {
    return this._levelConfig;
  }

  /** 启动关卡并派发初始状态；重复启动不会重置正在运行的棋盘。 */
  public start(): void {
    if (this._status !== PuzzleGameStatus.Idle) {
      return;
    }
    this.bindEvents();
    this.restart();
    Logger.info(
      `${this._levelConfig.rows}×${this._levelConfig.columns} 拼图第 ${this._levelConfig.level} 关已启动。`,
    );
  }

  /** 销毁控制器并注销事件；销毁状态不可再启动或重开。 */
  public destroy(): void {
    if (this._status === PuzzleGameStatus.Disposed) {
      return;
    }
    this.unbindEvents();
    this._status = PuzzleGameStatus.Disposed;
    this.emitStateChanged();
  }

  /** 仅把正在运行的关卡切换到暂停状态。 */
  public pause(): boolean {
    if (this._status !== PuzzleGameStatus.Running) {
      return false;
    }
    this._status = PuzzleGameStatus.Paused;
    this.emitStateChanged();
    return true;
  }

  /** 仅恢复此前处于暂停状态的关卡。 */
  public resume(): boolean {
    if (this._status !== PuzzleGameStatus.Paused) {
      return false;
    }
    this._status = PuzzleGameStatus.Running;
    this.emitStateChanged();
    return true;
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
    if (this._status !== PuzzleGameStatus.Running) {
      return null;
    }
    const update = this._board.commitMovePlan(plan);
    this.applyBoardUpdate(update);
    return update;
  }

  /** 自动完成一次严格推进的正确组合，并复用普通移动规划和棋盘提交规则。 */
  public autoMerge(): PuzzleBoardUpdate | null {
    if (this._status !== PuzzleGameStatus.Running) {
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
  private onRestartRequest = (): void => {
    this.restart();
  };

  /** 时间耗尽时锁定本关状态并通知场景打开失败弹窗。 */
  private onTimeExpiredRequest = (): void => {
    if (this._status !== PuzzleGameStatus.Running) {
      return;
    }
    this._status = PuzzleGameStatus.Failure;
    this.emitStateChanged();
    EventCenter.emit(GameEvent.PuzzleFailed, this.getState());
  };

  /** 清空完成记录并恢复运行状态；销毁后拒绝重新激活。 */
  public restart(): boolean {
    if (this._status === PuzzleGameStatus.Disposed) {
      return false;
    }
    const update = this._board.reset(this._levelConfig.pieceOrder);
    this._placedCount = update.placedCount;
    this._status = PuzzleGameStatus.Running;
    this.emitStateChanged();
    return true;
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

  /** 把棋盘规则结果同步到状态并派发唯一的进度与通关事件。 */
  private applyBoardUpdate(update: PuzzleBoardUpdate): void {
    this._placedCount = update.placedCount;
    if (update.completed) {
      this._status = PuzzleGameStatus.Success;
    }
    this.emitStateChanged();
    if (update.completed) {
      EventCenter.emit(GameEvent.PuzzleCompleted, this.getState());
    }
  }

  /** 派发一份只读状态快照，防止界面修改控制器内部字段。 */
  private emitStateChanged(): void {
    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
  }

  /** 返回当前状态快照，供场景、界面和自动化验证读取。 */
  public getState(): PuzzleGameState {
    return {
      status: this._status,
      level: this._levelConfig.level,
      placedCount: this._placedCount,
      totalCount: this._totalPieces,
      completed: this._status === PuzzleGameStatus.Success,
      failed: this._status === PuzzleGameStatus.Failure,
    };
  }
}
