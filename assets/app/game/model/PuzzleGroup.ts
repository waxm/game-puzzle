/** 两块拼图在当前棋盘上已经正确连接的关系。 */
export interface PuzzleGroupConnection {
  /** 第一块拼图编号。 */
  readonly firstPieceId: number;

  /** 第二块拼图编号。 */
  readonly secondPieceId: number;
}

/** 一次组合重建后提供给界面层的稳定结果。 */
export interface PuzzleGroupRebuildResult {
  /** 当前棋盘上的全部组合，包含单块组合。 */
  readonly groups: readonly PuzzleGroup[];

  /** 本次重建后成员数量增加的组合。 */
  readonly expandedGroups: readonly PuzzleGroup[];

  /** 当前成员最多的已连接组合；全部为单块时返回 null。 */
  readonly largestConnectedGroup: PuzzleGroup | null;
}

/**
 * 一个真实存在的拼图组合。
 *
 * 组合只保存成员关系，不保存 Cocos 节点。成员集合在对象创建后不再修改，避免
 * 拖拽规划、轮廓渲染和进度统计在同一帧读到不同的组合内容。
 */
export class PuzzleGroup {
  /** 组合的稳定编号，取成员中的最小拼图编号。 */
  public readonly id: number;

  /** 当前组合包含的全部拼图编号。 */
  private readonly _pieceIds: Set<number>;

  /** 使用已经校验且不重复的成员创建组合。 */
  public constructor(id: number, pieceIds: Iterable<number>) {
    this._pieceIds = new Set(pieceIds);
    if (this._pieceIds.size === 0 || !this._pieceIds.has(id)) {
      throw new Error(`拼图组合 ${id} 缺少有效成员。`);
    }
    this.id = id;
  }

  /** 返回组合成员数量。 */
  public get size(): number {
    return this._pieceIds.size;
  }

  /** 以只读集合暴露组合成员，禁止业务层直接改变组合结构。 */
  public get pieceIds(): ReadonlySet<number> {
    return this._pieceIds;
  }

  /** 判断指定拼图是否属于当前组合。 */
  public has(pieceId: number): boolean {
    return this._pieceIds.has(pieceId);
  }
}

/**
 * 拼图组合的唯一状态管理器。
 *
 * 管理器同时维护“组合编号到组合”和“拼图编号到组合”两份索引。每次棋盘变化时
 * 先在临时结构中完成连接图遍历与完整性校验，全部成功后才替换正式状态，避免
 * 异常连接数据留下半更新的组合关系。
 */
export class PuzzleGroupManager {
  /** 组合编号到真实组合对象的索引。 */
  private _groupsById = new Map<number, PuzzleGroup>();

  /** 拼图编号到所属真实组合对象的反向索引。 */
  private _groupByPieceId = new Map<number, PuzzleGroup>();

  /** 返回当前全部组合，并按组合编号保持确定顺序。 */
  public get groups(): readonly PuzzleGroup[] {
    return Array.from(this._groupsById.values());
  }

  /** 返回只读的拼图到组合索引，供移动规划器核对完整组合。 */
  public get groupByPieceId(): ReadonlyMap<number, PuzzleGroup> {
    return this._groupByPieceId;
  }

  /** 根据拼图编号取得所属组合；编号不存在时返回 null。 */
  public getGroupByPieceId(pieceId: number): PuzzleGroup | null {
    return this._groupByPieceId.get(pieceId) ?? null;
  }

  /** 清空全部组合关系；可在重玩、退出和创建失败路径重复调用。 */
  public clear(): void {
    this._groupsById.clear();
    this._groupByPieceId.clear();
  }

  /**
   * 根据当前正确连接边原子重建全部组合。
   *
   * 组合编号固定取成员最小值；成员完全不变时复用原对象，合并或拆分时才创建
   * 新对象。这样渲染层可以稳定比较对象，同时不会让旧对象被原地篡改。
   */
  public rebuild(
    pieceIds: Iterable<number>,
    connections: readonly PuzzleGroupConnection[],
  ): PuzzleGroupRebuildResult {
    const orderedPieceIds = Array.from(pieceIds).sort(
      (first, second) => first - second,
    );
    this.assertPieceIds(orderedPieceIds);

    const pieceIdSet = new Set(orderedPieceIds);
    const adjacency = new Map<number, Set<number>>(
      orderedPieceIds.map((pieceId) => [pieceId, new Set<number>()]),
    );
    for (const connection of connections) {
      const { firstPieceId, secondPieceId } = connection;
      if (
        firstPieceId === secondPieceId ||
        !pieceIdSet.has(firstPieceId) ||
        !pieceIdSet.has(secondPieceId)
      ) {
        throw new Error(
          `拼图组合连接无效：${firstPieceId} <-> ${secondPieceId}`,
        );
      }
      adjacency.get(firstPieceId)!.add(secondPieceId);
      adjacency.get(secondPieceId)!.add(firstPieceId);
    }

    const previousGroupSizeByPieceId = new Map<number, number>();
    this._groupByPieceId.forEach((group, pieceId) => {
      previousGroupSizeByPieceId.set(pieceId, group.size);
    });

    const nextGroupsById = new Map<number, PuzzleGroup>();
    const nextGroupByPieceId = new Map<number, PuzzleGroup>();
    const expandedGroups: PuzzleGroup[] = [];
    const visited = new Set<number>();

    for (const pieceId of orderedPieceIds) {
      if (visited.has(pieceId)) {
        continue;
      }
      const component = this.collectComponent(pieceId, adjacency, visited);
      const groupId = component[0];
      const previousGroup = this._groupsById.get(groupId);
      const group =
        previousGroup && this.areSameMembers(previousGroup.pieceIds, component)
          ? previousGroup
          : new PuzzleGroup(groupId, component);

      nextGroupsById.set(group.id, group);
      component.forEach((memberPieceId) => {
        if (nextGroupByPieceId.has(memberPieceId)) {
          throw new Error(`拼图 ${memberPieceId} 被分配到了多个组合。`);
        }
        nextGroupByPieceId.set(memberPieceId, group);
      });

      if (
        group.size > 1 &&
        component.some(
          (memberPieceId) =>
            group.size > (previousGroupSizeByPieceId.get(memberPieceId) ?? 1),
        )
      ) {
        expandedGroups.push(group);
      }
    }

    if (nextGroupByPieceId.size !== orderedPieceIds.length) {
      throw new Error("拼图组合重建后存在未归属的拼图。");
    }

    this._groupsById = nextGroupsById;
    this._groupByPieceId = nextGroupByPieceId;

    const largestConnectedGroup = this.findLargestConnectedGroup(
      nextGroupsById.values(),
    );
    return {
      groups: Array.from(nextGroupsById.values()),
      expandedGroups,
      largestConnectedGroup,
    };
  }

  /** 校验拼图编号是唯一的非负整数，防止错误占用进入连接图。 */
  private assertPieceIds(pieceIds: readonly number[]): void {
    const uniquePieceIds = new Set<number>();
    for (const pieceId of pieceIds) {
      if (
        !Number.isInteger(pieceId) ||
        pieceId < 0 ||
        uniquePieceIds.has(pieceId)
      ) {
        throw new Error(`拼图组合包含无效或重复编号：${pieceId}`);
      }
      uniquePieceIds.add(pieceId);
    }
  }

  /** 从指定成员开始遍历一个连通分量，并按拼图编号排序。 */
  private collectComponent(
    firstPieceId: number,
    adjacency: ReadonlyMap<number, ReadonlySet<number>>,
    visited: Set<number>,
  ): number[] {
    const component: number[] = [];
    const pending = [firstPieceId];
    while (pending.length > 0) {
      const pieceId = pending.pop()!;
      if (visited.has(pieceId)) {
        continue;
      }
      visited.add(pieceId);
      component.push(pieceId);
      adjacency.get(pieceId)!.forEach((neighborPieceId) => {
        if (!visited.has(neighborPieceId)) {
          pending.push(neighborPieceId);
        }
      });
    }
    return component.sort((first, second) => first - second);
  }

  /** 返回两个成员集合是否完全一致。 */
  private areSameMembers(
    first: ReadonlySet<number>,
    second: readonly number[],
  ): boolean {
    return (
      first.size === second.length &&
      second.every((pieceId) => first.has(pieceId))
    );
  }

  /** 取得成员最多的非单块组合；同样大小时选择编号更小的组合。 */
  private findLargestConnectedGroup(
    groups: Iterable<PuzzleGroup>,
  ): PuzzleGroup | null {
    let largestGroup: PuzzleGroup | null = null;
    for (const group of groups) {
      if (group.size < 2) {
        continue;
      }
      if (
        !largestGroup ||
        group.size > largestGroup.size ||
        (group.size === largestGroup.size && group.id < largestGroup.id)
      ) {
        largestGroup = group;
      }
    }
    return largestGroup;
  }
}
