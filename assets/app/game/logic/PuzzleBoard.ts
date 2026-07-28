import {
  PuzzleMoveFailureReason,
  PuzzleMovePlanner,
} from "./PuzzleMovePlanner";
import type { PuzzleMovePlan } from "./PuzzleMovePlanner";
import {
  PuzzleGroupManager,
} from "../model/PuzzleGroup";
import type {
  PuzzleGroup,
  PuzzleGroupConnection,
} from "../model/PuzzleGroup";

/** 棋盘规则变化后提供给控制器和表现层的只读结果。 */
export interface PuzzleBoardUpdate {
  /** 当前全部组合，包含单块组合。 */
  readonly groups: readonly PuzzleGroup[];

  /** 本次提交后成员数量增加的组合。 */
  readonly expandedGroups: readonly PuzzleGroup[];

  /** 当前最大的正确连接组合；没有连接时为 null。 */
  readonly largestConnectedGroup: PuzzleGroup | null;

  /** 当前用于界面展示的最大正确连接数量。 */
  readonly placedCount: number;

  /** 当前棋盘是否已经完全还原。 */
  readonly completed: boolean;
}

/**
 * 拼图棋盘的唯一规则状态。
 *
 * 本类只持有数字、集合和纯规则对象，不依赖 Cocos 节点。View 不再自行维护另一份
 * 可写棋盘，而是读取这里的占用、组合和移动计划来渲染当前状态。
 */
export class PuzzleBoard {
  /** 当前棋盘总格子数。 */
  public readonly totalCount: number;

  /** 按显示格子编号保存当前占用该格子的拼图编号。 */
  private readonly _pieceIdsByCell: number[] = [];

  /** 拼图编号到当前显示格子编号的反向索引。 */
  private readonly _cellIndexByPieceId = new Map<number, number>();

  /** 当前棋盘唯一的正确连接组合管理器。 */
  private readonly _groupManager = new PuzzleGroupManager();

  /** 最近一次棋盘重算产生的稳定规则结果。 */
  private _lastUpdate: PuzzleBoardUpdate = {
    groups: [],
    expandedGroups: [],
    largestConnectedGroup: null,
    placedCount: 0,
    completed: false,
  };

  /** 创建指定行列的棋盘，并载入经过关卡校验的初始排列。 */
  public constructor(
    public readonly rows: number,
    public readonly columns: number,
    initialPieceOrder: readonly number[],
  ) {
    if (
      !Number.isInteger(rows) ||
      rows <= 0 ||
      !Number.isInteger(columns) ||
      columns <= 0
    ) {
      throw new Error(`拼图棋盘尺寸无效：${rows}×${columns}`);
    }
    this.totalCount = rows * columns;
    this.reset(initialPieceOrder);
  }

  /** 返回当前格子占用的只读视图；调用方不得修改内部数组。 */
  public get pieceIdsByCell(): readonly number[] {
    return this._pieceIdsByCell;
  }

  /** 返回拼图到格子的只读反向索引。 */
  public get cellIndexByPieceId(): ReadonlyMap<number, number> {
    return this._cellIndexByPieceId;
  }

  /** 返回当前全部真实组合。 */
  public get groups(): readonly PuzzleGroup[] {
    return this._groupManager.groups;
  }

  /** 返回最近一次棋盘规则重算结果。 */
  public get currentUpdate(): PuzzleBoardUpdate {
    return this._lastUpdate;
  }

  /** 恢复指定初始排列并原子重建反向索引和正确连接组合。 */
  public reset(pieceOrder: readonly number[]): PuzzleBoardUpdate {
    this.assertCompletePermutation(pieceOrder);
    this._pieceIdsByCell.splice(
      0,
      this._pieceIdsByCell.length,
      ...pieceOrder,
    );
    this.rebuildReverseIndex();
    this._groupManager.clear();
    this._lastUpdate = this.rebuildConnectedGroups();
    return this._lastUpdate;
  }

  /** 返回指定格子当前占用的拼图编号。 */
  public getPieceIdAt(cellIndex: number): number {
    this.assertCellIndex(cellIndex);
    return this._pieceIdsByCell[cellIndex];
  }

  /** 返回指定拼图当前所在格子；编号无效时立即阻止后续移动。 */
  public getCellIndexByPieceId(pieceId: number): number {
    const cellIndex = this._cellIndexByPieceId.get(pieceId);
    if (cellIndex === undefined) {
      throw new Error(`拼图 ${pieceId} 不属于当前棋盘。`);
    }
    return cellIndex;
  }

  /** 返回指定拼图当前所属的真实组合。 */
  public getGroupByPieceId(pieceId: number): PuzzleGroup | null {
    return this._groupManager.getGroupByPieceId(pieceId);
  }

  /**
   * 根据锚点当前完整组合创建移动计划。
   *
   * 移动成员和来源格全部由棋盘内部状态生成，View 不能提交缺少成员的伪造组合。
   */
  public createMovePlan(
    anchorPieceId: number,
    targetAnchorCellIndex: number,
  ): PuzzleMovePlan {
    const movingGroup = this.getGroupByPieceId(anchorPieceId);
    if (!movingGroup) {
      return {
        valid: false,
        reason: PuzzleMoveFailureReason.InvalidMovingGroup,
        rowOffset: 0,
        columnOffset: 0,
        moves: [],
      };
    }
    const sourceCellByPieceId = new Map<number, number>();
    movingGroup.pieceIds.forEach((pieceId) => {
      sourceCellByPieceId.set(
        pieceId,
        this.getCellIndexByPieceId(pieceId),
      );
    });
    return PuzzleMovePlanner.createPlan({
      rows: this.rows,
      columns: this.columns,
      pieceIdsByCell: this._pieceIdsByCell,
      movingPieceIds: movingGroup.pieceIds,
      sourceCellByPieceId,
      groupByPieceId: this._groupManager.groupByPieceId,
      anchorPieceId,
      targetAnchorCellIndex,
    });
  }

  /**
   * 生成并提交一次必定推进最大正确组合的自动操作。
   *
   * 先把当前最大组合对齐到原图绝对位置，再吸收一个原图相邻的外部组合。两个步骤
   * 都复用玩家拖拽的移动规划器；正式棋盘提交前会在副本中完整演算，确保本次使用
   * 后最大组合严格增长且不会留下只完成一半的准备动作。
   */
  public autoMerge(): PuzzleBoardUpdate | null {
    if (this._lastUpdate.completed) {
      return null;
    }

    const initialPlacedCount = this._lastUpdate.placedCount;
    const simulation = new PuzzleBoard(
      this.rows,
      this.columns,
      this._pieceIdsByCell,
    );
    const plans = simulation.createAndApplyAutoMergePlans();
    if (
      plans.length === 0 ||
      simulation.currentUpdate.placedCount <= initialPlacedCount
    ) {
      throw new Error("自动组合没有严格推进最大正确组合。");
    }

    plans.forEach((plan) => {
      this.commitMovePlan(plan);
    });
    if (
      this._lastUpdate.placedCount !==
        simulation.currentUpdate.placedCount ||
      this._pieceIdsByCell.some(
        (pieceId, cellIndex) =>
          pieceId !== simulation.pieceIdsByCell[cellIndex],
      )
    ) {
      throw new Error("自动组合正式提交结果与预演结果不一致。");
    }
    return this._lastUpdate;
  }

  /**
   * 原子提交经过规划器校验的完整移动。
   *
   * 提交前重新核对全部来源、目标和双射关系，避免旧计划或重复输入覆盖新棋盘。
   */
  public commitMovePlan(plan: PuzzleMovePlan): PuzzleBoardUpdate {
    if (!plan.valid) {
      throw new Error("不能向拼图棋盘提交无效移动计划。");
    }

    const sourceCells = new Set<number>();
    const targetCells = new Set<number>();
    const nextPieceIdsByCell = [...this._pieceIdsByCell];
    for (const move of plan.moves) {
      if (
        this._pieceIdsByCell[move.sourceCellIndex] !== move.pieceId ||
        this._cellIndexByPieceId.get(move.pieceId) !== move.sourceCellIndex ||
        !this.isCellIndex(move.targetCellIndex) ||
        sourceCells.has(move.sourceCellIndex) ||
        targetCells.has(move.targetCellIndex)
      ) {
        throw new Error(
          `拼图移动计划已经过期：piece=${move.pieceId}，` +
            `source=${move.sourceCellIndex}，target=${move.targetCellIndex}`,
        );
      }
      sourceCells.add(move.sourceCellIndex);
      targetCells.add(move.targetCellIndex);
    }
    if (
      sourceCells.size !== targetCells.size ||
      Array.from(sourceCells).some((cellIndex) => !targetCells.has(cellIndex))
    ) {
      throw new Error("拼图移动计划没有形成完整格子双射。");
    }

    plan.moves.forEach((move) => {
      nextPieceIdsByCell[move.targetCellIndex] = move.pieceId;
    });
    this.assertCompletePermutation(nextPieceIdsByCell);

    this._pieceIdsByCell.splice(
      0,
      this._pieceIdsByCell.length,
      ...nextPieceIdsByCell,
    );
    this.rebuildReverseIndex();
    this._lastUpdate = this.rebuildConnectedGroups();
    return this._lastUpdate;
  }

  /** 判断两块拼图在当前格子中的方向是否与完整原图一致。 */
  public arePiecesCorrectlyConnected(
    firstPieceId: number,
    secondPieceId: number,
  ): boolean {
    return this.areCellsCorrectlyConnected(
      firstPieceId,
      this.getCellIndexByPieceId(firstPieceId),
      secondPieceId,
      this.getCellIndexByPieceId(secondPieceId),
    );
  }

  /** 校验排列恰好包含 0 到总数减一，防止重复占格或拼图丢失。 */
  private assertCompletePermutation(pieceIds: readonly number[]): void {
    if (pieceIds.length !== this.totalCount) {
      throw new Error(
        `拼图棋盘必须包含 ${this.totalCount} 块，实际为 ${pieceIds.length} 块。`,
      );
    }
    const uniquePieceIds = new Set<number>();
    pieceIds.forEach((pieceId) => {
      if (
        !Number.isInteger(pieceId) ||
        pieceId < 0 ||
        pieceId >= this.totalCount ||
        uniquePieceIds.has(pieceId)
      ) {
        throw new Error(`拼图棋盘包含无效或重复编号：${pieceId}`);
      }
      uniquePieceIds.add(pieceId);
    });
  }

  /** 根据正式格子占用重建拼图到格子的反向索引。 */
  private rebuildReverseIndex(): void {
    this._cellIndexByPieceId.clear();
    this._pieceIdsByCell.forEach((pieceId, cellIndex) => {
      this._cellIndexByPieceId.set(pieceId, cellIndex);
    });
  }

  /** 重算正确邻接边、真实组合、显示进度和完成状态。 */
  private rebuildConnectedGroups(): PuzzleBoardUpdate {
    const connections: PuzzleGroupConnection[] = [];
    this._pieceIdsByCell.forEach((pieceId, cellIndex) => {
      const row = Math.floor(cellIndex / this.columns);
      const column = cellIndex % this.columns;
      const neighborIndices = [
        column + 1 < this.columns ? cellIndex + 1 : null,
        row + 1 < this.rows ? cellIndex + this.columns : null,
      ];
      neighborIndices.forEach((neighborIndex) => {
        if (neighborIndex === null) {
          return;
        }
        const neighborPieceId = this._pieceIdsByCell[neighborIndex];
        if (
          this.areCellsCorrectlyConnected(
            pieceId,
            cellIndex,
            neighborPieceId,
            neighborIndex,
          )
        ) {
          connections.push({
            firstPieceId: pieceId,
            secondPieceId: neighborPieceId,
          });
        }
      });
    });

    const rebuildResult = this._groupManager.rebuild(
      this._pieceIdsByCell,
      connections,
    );
    const completed = this._pieceIdsByCell.every(
      (pieceId, cellIndex) => pieceId === cellIndex,
    );
    const placedCount = completed
      ? this.totalCount
      : rebuildResult.largestConnectedGroup?.size ?? 0;
    return {
      ...rebuildResult,
      placedCount,
      completed,
    };
  }

  /** 在预演棋盘上生成并立即应用本次自动组合所需的一到两个普通移动计划。 */
  private createAndApplyAutoMergePlans(): PuzzleMovePlan[] {
    const plans: PuzzleMovePlan[] = [];
    const initialPlacedCount = this._lastUpdate.placedCount;
    const anchorGroup =
      this._lastUpdate.largestConnectedGroup ??
      this._groupManager.getGroupByPieceId(0);
    if (!anchorGroup) {
      throw new Error("自动组合找不到可作为基准的拼图组合。");
    }

    const anchorPieceId = Math.min(...anchorGroup.pieceIds);
    if (this.getCellIndexByPieceId(anchorPieceId) !== anchorPieceId) {
      this.applyRequiredAutoPlan(
        this.createMovePlan(anchorPieceId, anchorPieceId),
        plans,
      );
    }

    if (this._lastUpdate.placedCount > initialPlacedCount) {
      return plans;
    }

    const alignedAnchorGroup =
      this._groupManager.getGroupByPieceId(anchorPieceId);
    if (!alignedAnchorGroup || alignedAnchorGroup.size === this.totalCount) {
      return plans;
    }
    const neighborPieceId =
      this.findExternalOriginalNeighbor(alignedAnchorGroup);
    this.applyRequiredAutoPlan(
      this.createMovePlan(neighborPieceId, neighborPieceId),
      plans,
    );
    return plans;
  }

  /** 提交自动组合所需的普通计划；任何规划失败都立即终止正式棋盘写入。 */
  private applyRequiredAutoPlan(
    plan: PuzzleMovePlan,
    plans: PuzzleMovePlan[],
  ): void {
    if (!plan.valid) {
      throw new Error(`自动组合移动规划失败：${plan.reason}`);
    }
    this.commitMovePlan(plan);
    plans.push(plan);
  }

  /**
   * 查找基准组合在完整原图中的一个外部相邻拼图。
   *
   * 完整拼图网格是连通图，只要组合尚未覆盖全部拼图，就必然存在至少一条跨组合
   * 边。按成员编号及上、右、下、左顺序扫描可保证所有平台得到相同选择。
   */
  private findExternalOriginalNeighbor(group: PuzzleGroup): number {
    const orderedPieceIds = Array.from(group.pieceIds).sort(
      (first, second) => first - second,
    );
    for (const pieceId of orderedPieceIds) {
      const row = Math.floor(pieceId / this.columns);
      const column = pieceId % this.columns;
      const neighborPieceIds = [
        row > 0 ? pieceId - this.columns : null,
        column + 1 < this.columns ? pieceId + 1 : null,
        row + 1 < this.rows ? pieceId + this.columns : null,
        column > 0 ? pieceId - 1 : null,
      ];
      for (const neighborPieceId of neighborPieceIds) {
        if (neighborPieceId !== null && !group.has(neighborPieceId)) {
          return neighborPieceId;
        }
      }
    }
    throw new Error(`拼图组合 ${group.id} 尚未完成但不存在外部相邻拼图。`);
  }

  /** 使用原图行列差和当前行列差判断一条连接边。 */
  private areCellsCorrectlyConnected(
    firstPieceId: number,
    firstCellIndex: number,
    secondPieceId: number,
    secondCellIndex: number,
  ): boolean {
    const firstOriginalRow = Math.floor(firstPieceId / this.columns);
    const firstOriginalColumn = firstPieceId % this.columns;
    const secondOriginalRow = Math.floor(secondPieceId / this.columns);
    const secondOriginalColumn = secondPieceId % this.columns;
    const firstCurrentRow = Math.floor(firstCellIndex / this.columns);
    const firstCurrentColumn = firstCellIndex % this.columns;
    const secondCurrentRow = Math.floor(secondCellIndex / this.columns);
    const secondCurrentColumn = secondCellIndex % this.columns;
    return (
      secondOriginalRow - firstOriginalRow ===
        secondCurrentRow - firstCurrentRow &&
      secondOriginalColumn - firstOriginalColumn ===
        secondCurrentColumn - firstCurrentColumn
    );
  }

  /** 校验格子编号属于当前棋盘。 */
  private assertCellIndex(cellIndex: number): void {
    if (!this.isCellIndex(cellIndex)) {
      throw new Error(`拼图格子 ${cellIndex} 不属于当前棋盘。`);
    }
  }

  /** 判断格子编号是否为当前棋盘内的整数。 */
  private isCellIndex(cellIndex: number): boolean {
    return (
      Number.isInteger(cellIndex) &&
      cellIndex >= 0 &&
      cellIndex < this.totalCount
    );
  }
}
