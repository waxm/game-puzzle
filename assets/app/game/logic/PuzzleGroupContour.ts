/** 组合轮廓中的一个网格顶点。 */
export interface PuzzleContourPoint {
  /** 顶点所在的网格列边界。 */
  readonly column: number;

  /** 顶点所在的网格行边界。 */
  readonly row: number;
}

/** 一个闭合轮廓环；外轮廓和内部孔洞分别形成独立环。 */
export interface PuzzleContourLoop {
  /** 已移除重复终点和共线中间点的轮廓顶点。 */
  readonly points: readonly PuzzleContourPoint[];
}

/** 轮廓边在从上到下的网格坐标系中的方向。 */
enum PuzzleContourDirection {
  /** 从左向右。 */
  East = 0,

  /** 从上向下。 */
  South = 1,

  /** 从右向左。 */
  West = 2,

  /** 从下向上。 */
  North = 3,
}

/** 轮廓追踪使用的单条有向网格边。 */
interface PuzzleContourEdge {
  /** 边的起点。 */
  readonly start: PuzzleContourPoint;

  /** 边的终点。 */
  readonly end: PuzzleContourPoint;

  /** 当前边方向。 */
  readonly direction: PuzzleContourDirection;

  /** 有向边的唯一键。 */
  readonly key: string;
}

/**
 * 规则网格组合的纯轮廓计算器。
 *
 * 每个格子先贡献四条顺时针边，相邻格子的反向公共边会互相抵消。剩余边只包含
 * 组合真正外露的部分，再按“右转优先”追踪成闭合环，可正确处理 L、T、U 形、
 * 凹角、点接触和内部孔洞，不会把组合内部接缝画出来。
 */
export class PuzzleGroupContour {
  /** 根据当前组合占用的格子编号生成全部闭合轮廓。 */
  public static trace(
    cellIndices: ReadonlySet<number>,
    columns: number,
  ): readonly PuzzleContourLoop[] {
    if (!Number.isInteger(columns) || columns <= 0) {
      throw new Error(`组合轮廓列数无效：${columns}`);
    }
    if (cellIndices.size === 0) {
      return [];
    }

    const boundaryEdges = this.collectBoundaryEdges(cellIndices, columns);
    const outgoingEdges = new Map<string, PuzzleContourEdge[]>();
    boundaryEdges.forEach((edge) => {
      const pointKey = this.createPointKey(edge.start);
      const edges = outgoingEdges.get(pointKey) ?? [];
      edges.push(edge);
      outgoingEdges.set(pointKey, edges);
    });

    const unvisitedEdgeKeys = new Set(boundaryEdges.map((edge) => edge.key));
    const loops: PuzzleContourLoop[] = [];
    for (const firstEdge of boundaryEdges) {
      if (!unvisitedEdgeKeys.has(firstEdge.key)) {
        continue;
      }
      const tracedLoops = this.traceLoop(
        firstEdge,
        outgoingEdges,
        unvisitedEdgeKeys,
        boundaryEdges.length,
      );
      tracedLoops.forEach((points) => loops.push({ points }));
    }

    if (unvisitedEdgeKeys.size !== 0) {
      throw new Error("组合轮廓追踪结束后仍存在未消费的外露边。");
    }
    return loops;
  }

  /**
   * 收集所有外露边。
   *
   * 边按照格子顺时针方向创建，使被填充区域始终位于边的右侧；公共边使用无向键
   * 抵消，因此算法复杂度与组合格子数量线性相关。
   */
  private static collectBoundaryEdges(
    cellIndices: ReadonlySet<number>,
    columns: number,
  ): PuzzleContourEdge[] {
    const edgeByUndirectedKey = new Map<string, PuzzleContourEdge>();
    const orderedCellIndices = Array.from(cellIndices).sort(
      (first, second) => first - second,
    );

    for (const cellIndex of orderedCellIndices) {
      if (!Number.isInteger(cellIndex) || cellIndex < 0) {
        throw new Error(`组合轮廓包含无效格子编号：${cellIndex}`);
      }
      const row = Math.floor(cellIndex / columns);
      const column = cellIndex % columns;
      const topLeft = { column, row };
      const topRight = { column: column + 1, row };
      const bottomRight = { column: column + 1, row: row + 1 };
      const bottomLeft = { column, row: row + 1 };
      const cellEdges = [
        this.createEdge(topLeft, topRight, PuzzleContourDirection.East),
        this.createEdge(topRight, bottomRight, PuzzleContourDirection.South),
        this.createEdge(bottomRight, bottomLeft, PuzzleContourDirection.West),
        this.createEdge(bottomLeft, topLeft, PuzzleContourDirection.North),
      ];

      for (const edge of cellEdges) {
        const undirectedKey = this.createUndirectedEdgeKey(edge);
        if (edgeByUndirectedKey.has(undirectedKey)) {
          edgeByUndirectedKey.delete(undirectedKey);
        } else {
          edgeByUndirectedKey.set(undirectedKey, edge);
        }
      }
    }
    return Array.from(edgeByUndirectedKey.values());
  }

  /** 从指定边开始追踪一个闭合环，并阻止异常连接形成无限循环。 */
  private static traceLoop(
    firstEdge: PuzzleContourEdge,
    outgoingEdges: ReadonlyMap<string, readonly PuzzleContourEdge[]>,
    unvisitedEdgeKeys: Set<string>,
    totalEdgeCount: number,
  ): readonly (readonly PuzzleContourPoint[])[] {
    const points: PuzzleContourPoint[] = [firstEdge.start];
    let currentEdge = firstEdge;

    for (let step = 0; step <= totalEdgeCount; step += 1) {
      if (!unvisitedEdgeKeys.delete(currentEdge.key)) {
        throw new Error(`组合轮廓边被重复访问：${currentEdge.key}`);
      }
      points.push(currentEdge.end);
      if (this.areSamePoint(currentEdge.end, firstEdge.start)) {
        return this.splitClosedPath(points).map((closedLoop) =>
          this.removeCollinearPoints(closedLoop),
        );
      }

      const candidates = (
        outgoingEdges.get(this.createPointKey(currentEdge.end)) ?? []
      ).filter((edge) => unvisitedEdgeKeys.has(edge.key));
      if (candidates.length === 0) {
        throw new Error(
          `组合轮廓在 ${this.createPointKey(currentEdge.end)} 处没有后续边。`,
        );
      }
      currentEdge = this.selectNextEdge(currentEdge.direction, candidates);
    }
    throw new Error("组合轮廓追踪超过外露边数量，可能存在错误环路。");
  }

  /**
   * 把在同一顶点接触的自接触路径拆成多个简单闭合环。
   *
   * 对角格子可能让外边界和孔洞只共享一个顶点。Graphics 虽然可以描画一条
   * 自接触路径，但连接样式在该点不稳定，因此在绘制前按重复顶点递归拆环。
   */
  private static splitClosedPath(
    closedPoints: readonly PuzzleContourPoint[],
  ): readonly (readonly PuzzleContourPoint[])[] {
    for (
      let firstIndex = 1;
      firstIndex < closedPoints.length - 1;
      firstIndex += 1
    ) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < closedPoints.length - 1;
        secondIndex += 1
      ) {
        if (
          !this.areSamePoint(
            closedPoints[firstIndex],
            closedPoints[secondIndex],
          )
        ) {
          continue;
        }

        const innerLoop = closedPoints.slice(firstIndex, secondIndex + 1);
        const outerLoop = [
          ...closedPoints.slice(0, firstIndex + 1),
          ...closedPoints.slice(secondIndex + 1),
        ];
        return [
          ...this.splitClosedPath(innerLoop),
          ...this.splitClosedPath(outerLoop),
        ];
      }
    }
    return [closedPoints];
  }

  /**
   * 在点接触产生多个出口时选择下一条边。
   *
   * 所有有向边都把填充区域保持在右侧，所以按右转、直行、左转、回头排序可以
   * 沿同一块边界继续行走，而不会在对角接触点错误跨到另一条轮廓上。
   */
  private static selectNextEdge(
    currentDirection: PuzzleContourDirection,
    candidates: readonly PuzzleContourEdge[],
  ): PuzzleContourEdge {
    return [...candidates].sort((first, second) => {
      const firstRank = this.getTurnRank(currentDirection, first.direction);
      const secondRank = this.getTurnRank(currentDirection, second.direction);
      return firstRank - secondRank || first.key.localeCompare(second.key);
    })[0];
  }

  /** 把方向变化转换为右转优先的排序权重。 */
  private static getTurnRank(
    currentDirection: PuzzleContourDirection,
    nextDirection: PuzzleContourDirection,
  ): number {
    const turn = (nextDirection - currentDirection + 4) % 4;
    switch (turn) {
      case 1:
        return 0;
      case 0:
        return 1;
      case 3:
        return 2;
      default:
        return 3;
    }
  }

  /** 移除闭合终点副本和直线中间点，减少 Graphics 需要提交的顶点。 */
  private static removeCollinearPoints(
    closedPoints: readonly PuzzleContourPoint[],
  ): readonly PuzzleContourPoint[] {
    const points = [...closedPoints];
    if (
      points.length > 1 &&
      this.areSamePoint(points[0], points[points.length - 1])
    ) {
      points.pop();
    }
    if (points.length < 4) {
      throw new Error("组合轮廓闭合环的有效顶点不足。");
    }

    return points.filter((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const previousDirection = {
        column: point.column - previous.column,
        row: point.row - previous.row,
      };
      const nextDirection = {
        column: next.column - point.column,
        row: next.row - point.row,
      };
      return (
        previousDirection.column !== nextDirection.column ||
        previousDirection.row !== nextDirection.row
      );
    });
  }

  /** 创建包含方向的轮廓边。 */
  private static createEdge(
    start: PuzzleContourPoint,
    end: PuzzleContourPoint,
    direction: PuzzleContourDirection,
  ): PuzzleContourEdge {
    return {
      start,
      end,
      direction,
      key: `${this.createPointKey(start)}>${this.createPointKey(end)}`,
    };
  }

  /** 创建不区分方向的边键，供相邻格子抵消公共边。 */
  private static createUndirectedEdgeKey(edge: PuzzleContourEdge): string {
    const startKey = this.createPointKey(edge.start);
    const endKey = this.createPointKey(edge.end);
    return startKey < endKey
      ? `${startKey}|${endKey}`
      : `${endKey}|${startKey}`;
  }

  /** 创建网格顶点的稳定字符串键。 */
  private static createPointKey(point: PuzzleContourPoint): string {
    return `${point.column},${point.row}`;
  }

  /** 判断两个网格顶点坐标是否一致。 */
  private static areSamePoint(
    first: PuzzleContourPoint,
    second: PuzzleContourPoint,
  ): boolean {
    return first.column === second.column && first.row === second.row;
  }
}
