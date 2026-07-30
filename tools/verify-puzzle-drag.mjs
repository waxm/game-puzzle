#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** 当前项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 纯移动规划器源码路径。 */
const plannerPath = path.join(
  projectRoot,
  "assets/app/game/logic/PuzzleMovePlanner.ts",
);

/** 动态载入从 TypeScript 转换后的纯逻辑模块，避免测试依赖 Cocos 运行时。 */
async function loadPlannerModule() {
  const source = fs.readFileSync(plannerPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: plannerPath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.equal(errors.length, 0, "PuzzleMovePlanner.ts 转换失败。");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(
    transpiled.outputText,
  ).toString("base64")}`;
  return import(moduleUrl);
}

const { PuzzleMoveFailureReason, PuzzleMovePlanner } =
  await loadPlannerModule();

/** 已执行的具名规则用例数量。 */
let namedCaseCount = 0;

/** 9×9 中系统遍历的形状落点数量。 */
let boundarySimulationCount = 0;

/** 连续拖拽模拟次数。 */
let sequentialSimulationCount = 0;

/** 使用实际连接图执行的随机组合拖拽次数。 */
let connectedGroupSimulationCount = 0;

/** 已检查不存在规则死局的棋盘状态数量。 */
let deadlockAuditCount = 0;

/** 统计乱序棋盘中已经按原图方向正确相邻的边数量。 */
function countCorrectAdjacentEdges(rows, columns, pieceIdsByCell) {
  let edgeCount = 0;
  for (let cellIndex = 0; cellIndex < pieceIdsByCell.length; cellIndex += 1) {
    const row = Math.floor(cellIndex / columns);
    const column = cellIndex % columns;
    const pieceId = pieceIdsByCell[cellIndex];
    const pieceRow = Math.floor(pieceId / columns);
    const pieceColumn = pieceId % columns;
    const neighborCellIndices = [
      column + 1 < columns ? cellIndex + 1 : null,
      row + 1 < rows ? cellIndex + columns : null,
    ];
    for (const neighborCellIndex of neighborCellIndices) {
      if (neighborCellIndex === null) {
        continue;
      }
      const neighborPieceId = pieceIdsByCell[neighborCellIndex];
      const neighborPieceRow = Math.floor(neighborPieceId / columns);
      const neighborPieceColumn = neighborPieceId % columns;
      const cellRowOffset = Math.floor(neighborCellIndex / columns) - row;
      const cellColumnOffset = neighborCellIndex % columns - column;
      if (
        neighborPieceRow - pieceRow === cellRowOffset &&
        neighborPieceColumn - pieceColumn === cellColumnOffset
      ) {
        edgeCount += 1;
      }
    }
  }
  return edgeCount;
}

// 第 5 关必须保持本次需求指定的 9×9、300 秒和无初始连接状态。
{
  const level5 = JSON.parse(
    fs.readFileSync(
      path.join(
        projectRoot,
        "assets/resources/configs/game/levels/level_005.json",
      ),
      "utf8",
    ),
  );
  assert.equal(level5.schemaVersion, 1, "第 5 关配置版本必须为 1。");
  assert.equal(level5.level, 5, "第 5 关配置编号必须为 5。");
  assert.equal(level5.rows, 9, "第 5 关行数必须为 9。");
  assert.equal(level5.columns, 9, "第 5 关列数必须为 9。");
  assert.equal(level5.timeLimitSeconds, 300, "第 5 关限时必须为 300 秒。");
  assert.deepEqual(
    [...level5.pieceOrder].sort((first, second) => first - second),
    Array.from({ length: 81 }, (_value, index) => index),
    "第 5 关乱序必须完整包含 81 块且不能重复。",
  );
  assert.equal(
    countCorrectAdjacentEdges(9, 9, level5.pieceOrder),
    0,
    "第 5 关开局不能预先形成正确连接组。",
  );
  namedCaseCount += 1;
}

/** 为棋盘建立默认单块组，并覆盖测试指定的完整连接组。 */
function createConnectedGroups(pieceCount, connectedGroups) {
  const result = new Map();
  for (let pieceId = 0; pieceId < pieceCount; pieceId += 1) {
    result.set(pieceId, createGroup([pieceId]));
  }
  for (const pieceIds of connectedGroups) {
    const group = createGroup(pieceIds);
    for (const pieceId of group.pieceIds) {
      result.set(pieceId, group);
    }
  }
  return result;
}

/** 创建符合正式规划器结构的只读组合测试对象。 */
function createGroup(pieceIds) {
  const members = new Set(pieceIds);
  return {
    id: Math.min(...members),
    pieceIds: members,
  };
}

/** 根据测试棋盘和拖拽参数生成一次移动计划。 */
function planDrag({
  rows,
  columns,
  pieceIdsByCell,
  movingPieceIds,
  targetAnchorCellIndex,
  targetConnectedGroups = [],
  anchorPieceId = movingPieceIds[0],
}) {
  const movingSet = new Set(movingPieceIds);
  const sourceCellByPieceId = new Map();
  for (const pieceId of movingSet) {
    sourceCellByPieceId.set(pieceId, pieceIdsByCell.indexOf(pieceId));
  }
  return PuzzleMovePlanner.createPlan({
    rows,
    columns,
    pieceIdsByCell,
    movingPieceIds: movingSet,
    sourceCellByPieceId,
    groupByPieceId: createConnectedGroups(
      rows * columns,
      [movingPieceIds, ...targetConnectedGroups],
    ),
    anchorPieceId,
    targetAnchorCellIndex,
  });
}

/** 应用有效计划，并校验移动前后始终是完整、不重复的拼图排列。 */
function applyAndValidatePlan(pieceIdsByCell, plan) {
  assert.equal(plan.valid, true, `计划应有效，实际原因：${plan.reason}`);
  const sourceCells = new Set(plan.moves.map((move) => move.sourceCellIndex));
  const targetCells = new Set(plan.moves.map((move) => move.targetCellIndex));
  assert.equal(sourceCells.size, plan.moves.length, "移动来源格发生重复。");
  assert.equal(targetCells.size, plan.moves.length, "移动目标格发生重复。");
  assert.deepEqual(
    [...sourceCells].sort((first, second) => first - second),
    [...targetCells].sort((first, second) => first - second),
    "受影响的来源格和目标格没有形成完整置换。",
  );

  const next = [...pieceIdsByCell];
  for (const move of plan.moves) {
    assert.equal(
      pieceIdsByCell[move.sourceCellIndex],
      move.pieceId,
      "移动步骤来源格中的拼图编号不一致。",
    );
    next[move.targetCellIndex] = move.pieceId;
  }
  assert.deepEqual(
    [...next].sort((first, second) => first - second),
    Array.from({ length: next.length }, (_value, index) => index),
    "拖拽后出现重复拼图或拼图丢失。",
  );
  return next;
}

/** 按正式玩法的上下左右正确邻接规则重算当前棋盘连接组。 */
function createActualConnectedGroups(rows, columns, pieceIdsByCell) {
  const adjacency = new Map(
    pieceIdsByCell.map((pieceId) => [pieceId, new Set()]),
  );
  for (let cellIndex = 0; cellIndex < pieceIdsByCell.length; cellIndex += 1) {
    const row = Math.floor(cellIndex / columns);
    const column = cellIndex % columns;
    const pieceId = pieceIdsByCell[cellIndex];
    const neighborCellIndices = [
      column + 1 < columns ? cellIndex + 1 : null,
      row + 1 < rows ? cellIndex + columns : null,
    ];
    for (const neighborCellIndex of neighborCellIndices) {
      if (neighborCellIndex === null) {
        continue;
      }
      const neighborPieceId = pieceIdsByCell[neighborCellIndex];
      const pieceRow = Math.floor(pieceId / columns);
      const pieceColumn = pieceId % columns;
      const neighborPieceRow = Math.floor(neighborPieceId / columns);
      const neighborPieceColumn = neighborPieceId % columns;
      const cellRowOffset = Math.floor(neighborCellIndex / columns) - row;
      const cellColumnOffset = neighborCellIndex % columns - column;
      if (
        neighborPieceRow - pieceRow === cellRowOffset &&
        neighborPieceColumn - pieceColumn === cellColumnOffset
      ) {
        adjacency.get(pieceId).add(neighborPieceId);
        adjacency.get(neighborPieceId).add(pieceId);
      }
    }
  }

  const result = new Map();
  const visited = new Set();
  for (const pieceId of pieceIdsByCell) {
    if (visited.has(pieceId)) {
      continue;
    }
    const memberPieceIds = new Set();
    const pending = [pieceId];
    while (pending.length > 0) {
      const currentPieceId = pending.pop();
      if (visited.has(currentPieceId)) {
        continue;
      }
      visited.add(currentPieceId);
      memberPieceIds.add(currentPieceId);
      for (const neighborPieceId of adjacency.get(currentPieceId)) {
        if (!visited.has(neighborPieceId)) {
          pending.push(neighborPieceId);
        }
      }
    }
    const group = createGroup(memberPieceIds);
    for (const groupPieceId of group.pieceIds) {
      result.set(groupPieceId, group);
    }
  }
  return result;
}

/**
 * 在当前真实组合状态中寻找一次非原地的合法移动。
 *
 * 每个源组合都必须整体参与规划；目标组合不参与合法性限制。若所有源组合的全部
 * 落点都无效，说明当前棋盘已经产生规则死局，测试应立即失败并保留棋盘快照。
 */
function findFirstLegalMove(rows, columns, pieceIdsByCell, groupByPieceId) {
  const checkedGroupIds = new Set();
  for (const pieceId of pieceIdsByCell) {
    const movingGroup = groupByPieceId.get(pieceId);
    assert.ok(movingGroup, `拼图 ${pieceId} 缺少真实组合。`);
    if (checkedGroupIds.has(movingGroup.id)) {
      continue;
    }
    checkedGroupIds.add(movingGroup.id);

    const anchorPieceId = pieceId;
    const sourceAnchorCellIndex = pieceIdsByCell.indexOf(anchorPieceId);
    const sourceCellByPieceId = new Map(
      [...movingGroup.pieceIds].map((movingPieceId) => [
        movingPieceId,
        pieceIdsByCell.indexOf(movingPieceId),
      ]),
    );
    for (
      let targetAnchorCellIndex = 0;
      targetAnchorCellIndex < pieceIdsByCell.length;
      targetAnchorCellIndex += 1
    ) {
      if (targetAnchorCellIndex === sourceAnchorCellIndex) {
        continue;
      }
      const plan = PuzzleMovePlanner.createPlan({
        rows,
        columns,
        pieceIdsByCell,
        movingPieceIds: movingGroup.pieceIds,
        sourceCellByPieceId,
        groupByPieceId,
        anchorPieceId,
        targetAnchorCellIndex,
      });
      if (plan.valid) {
        return { plan, movingPieceIds: movingGroup.pieceIds };
      }
      assert.equal(
        plan.reason,
        PuzzleMoveFailureReason.TargetOutOfBounds,
        "有效棋盘寻找可移动组合时出现了非边界失败。",
      );
    }
  }
  return null;
}

/** 依次生成数组的全部排列，用于穷举小棋盘的每一种可能状态。 */
function visitPermutations(values, startIndex, visitor) {
  if (startIndex === values.length) {
    visitor(values);
    return;
  }
  for (let index = startIndex; index < values.length; index += 1) {
    [values[startIndex], values[index]] = [values[index], values[startIndex]];
    visitPermutations(values, startIndex + 1, visitor);
    [values[startIndex], values[index]] = [values[index], values[startIndex]];
  }
}

/** 校验玩家拿起的源组合全部参与移动，并始终使用同一个刚性位移。 */
function validateMovingGroupPreservation(columns, movingPieceIds, plan) {
  const stepByPieceId = new Map(plan.moves.map((move) => [move.pieceId, move]));
  const movedSteps = [...movingPieceIds].map((pieceId) =>
    stepByPieceId.get(pieceId),
  );
  assert.ok(
    movedSteps.every(Boolean),
    "有效计划没有完整移动玩家拿起的源组合。",
  );

  const firstStep = movedSteps[0];
  const firstRowOffset =
    Math.floor(firstStep.targetCellIndex / columns) -
    Math.floor(firstStep.sourceCellIndex / columns);
  const firstColumnOffset =
    firstStep.targetCellIndex % columns -
    (firstStep.sourceCellIndex % columns);
  for (const step of movedSteps) {
    assert.equal(
      Math.floor(step.targetCellIndex / columns) -
        Math.floor(step.sourceCellIndex / columns),
      firstRowOffset,
      "有效计划改变了源组合成员的行间距。",
    );
    assert.equal(
      step.targetCellIndex % columns - (step.sourceCellIndex % columns),
      firstColumnOffset,
      "有效计划改变了源组合成员的列间距。",
    );
  }
}

/** 执行一个应成功的具名拖拽，并可校验精确棋盘结果。 */
function expectValid(name, options, expectedPieceIdsByCell) {
  const plan = planDrag(options);
  const next = applyAndValidatePlan(options.pieceIdsByCell, plan);
  if (expectedPieceIdsByCell) {
    assert.deepEqual(next, expectedPieceIdsByCell, `${name} 的置换结果不正确。`);
  }
  namedCaseCount += 1;
}

/** 执行一个应被拒绝的具名拖拽，并校验棋盘快照没有被规划器修改。 */
function expectFailure(name, options, expectedReason) {
  const before = [...options.pieceIdsByCell];
  const plan = planDrag(options);
  assert.equal(plan.valid, false, `${name} 应被拒绝。`);
  assert.equal(plan.reason, expectedReason, `${name} 的失败原因不正确。`);
  assert.deepEqual(options.pieceIdsByCell, before, `${name} 修改了输入棋盘。`);
  assert.equal(plan.moves.length, 0, `${name} 不应返回可提交步骤。`);
  namedCaseCount += 1;
}

// 基础单块交换、原地吸附及横纵移动。
expectValid(
  "原地松手",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0],
    targetAnchorCellIndex: 0,
  },
  [0, 1, 2, 3],
);
expectValid(
  "单块横向交换",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0],
    targetAnchorCellIndex: 1,
  },
  [1, 0, 2, 3],
);
expectValid(
  "单块纵向交换",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0],
    targetAnchorCellIndex: 2,
  },
  [2, 1, 0, 3],
);

// 重叠平移必须沿移动链回填，不能按格子排序后随意配对。
expectValid(
  "三格横向重叠平移",
  {
    rows: 1,
    columns: 4,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0, 1, 2],
    targetAnchorCellIndex: 1,
  },
  [3, 0, 1, 2],
);
expectValid(
  "三格纵向整体平移",
  {
    rows: 3,
    columns: 2,
    pieceIdsByCell: [0, 3, 1, 4, 2, 5],
    movingPieceIds: [0, 1, 2],
    targetAnchorCellIndex: 1,
  },
  [3, 0, 4, 1, 5, 2],
);

// 用户讨论的三格组合与“两格连接组加一单格”应允许完整平换。
expectValid(
  "三格与两格加单格完整互换",
  {
    rows: 2,
    columns: 3,
    pieceIdsByCell: [3, 4, 5, 0, 1, 2],
    movingPieceIds: [0, 1, 2],
    targetConnectedGroups: [[3, 4]],
    targetAnchorCellIndex: 0,
  },
  [0, 1, 2, 3, 4, 5],
);
expectValid(
  "两格源组合拆开目标三格组",
  {
    rows: 2,
    columns: 3,
    pieceIdsByCell: [0, 1, 2, 3, 4, 5],
    movingPieceIds: [0, 1],
    targetConnectedGroups: [[3, 4, 5]],
    targetAnchorCellIndex: 3,
  },
  [3, 4, 2, 0, 1, 5],
);

// 目标旧组合只负责让位，允许被不同长度的移动链拆开并在落点后重新计算连接。
expectValid(
  "不同链长允许拆开目标连接组",
  {
    rows: 2,
    columns: 4,
    pieceIdsByCell: [0, 1, 3, 5, 6, 2, 4, 7],
    movingPieceIds: [0, 1, 2],
    targetConnectedGroups: [[3, 4]],
    targetAnchorCellIndex: 1,
  },
  [3, 0, 1, 5, 6, 4, 2, 7],
);
expectValid(
  "纵向源组合拆开横向目标组",
  {
    rows: 3,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3, 4, 5],
    movingPieceIds: [0, 2],
    targetConnectedGroups: [[4, 5]],
    targetAnchorCellIndex: 2,
  },
  [4, 1, 0, 3, 2, 5],
);
expectValid(
  "单块源组合拆开 T 形目标组",
  {
    rows: 3,
    columns: 3,
    pieceIdsByCell: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    movingPieceIds: [8],
    targetConnectedGroups: [[0, 1, 2, 4]],
    targetAnchorCellIndex: 1,
  },
  [0, 8, 2, 3, 4, 5, 6, 7, 1],
);
expectValid(
  "相同链长下目标连接组保持形状",
  {
    rows: 2,
    columns: 4,
    pieceIdsByCell: [0, 1, 2, 3, 4, 5, 6, 7],
    movingPieceIds: [0, 1, 4, 5],
    targetConnectedGroups: [[2, 6]],
    targetAnchorCellIndex: 1,
  },
  [2, 0, 1, 3, 6, 4, 5, 7],
);
expectValid(
  "同时完整回填两个目标连接组",
  {
    rows: 2,
    columns: 4,
    pieceIdsByCell: [4, 5, 6, 7, 0, 1, 2, 3],
    movingPieceIds: [0, 1, 2, 3],
    targetConnectedGroups: [
      [4, 5],
      [6, 7],
    ],
    targetAnchorCellIndex: 0,
  },
  [0, 1, 2, 3, 4, 5, 6, 7],
);

// 四条边、无效目标和移动组快照损坏都必须在提交前拒绝。
expectFailure(
  "左边界越界",
  {
    rows: 1,
    columns: 4,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0, 1],
    anchorPieceId: 1,
    targetAnchorCellIndex: 0,
  },
  PuzzleMoveFailureReason.TargetOutOfBounds,
);
expectFailure(
  "右边界越界",
  {
    rows: 1,
    columns: 4,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0, 1],
    targetAnchorCellIndex: 3,
  },
  PuzzleMoveFailureReason.TargetOutOfBounds,
);
expectFailure(
  "上边界越界",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0, 2],
    anchorPieceId: 2,
    targetAnchorCellIndex: 0,
  },
  PuzzleMoveFailureReason.TargetOutOfBounds,
);
expectFailure(
  "下边界越界",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0, 2],
    targetAnchorCellIndex: 2,
  },
  PuzzleMoveFailureReason.TargetOutOfBounds,
);
expectFailure(
  "落点不属于棋盘",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: [0],
    targetAnchorCellIndex: -1,
  },
  PuzzleMoveFailureReason.InvalidAnchor,
);

// 内部快照异常必须显式拒绝，不能继续生成一个看似可用的局部计划。
expectFailure(
  "格子占用包含重复拼图",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 0, 2, 3],
    movingPieceIds: [0],
    targetAnchorCellIndex: 1,
  },
  PuzzleMoveFailureReason.InvalidOccupancy,
);
expectFailure(
  "格子占用数量与棋盘不一致",
  {
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2],
    movingPieceIds: [0],
    targetAnchorCellIndex: 1,
  },
  PuzzleMoveFailureReason.InvalidBoard,
);

{
  const corruptedPlan = PuzzleMovePlanner.createPlan({
    rows: 2,
    columns: 2,
    pieceIdsByCell: [0, 1, 2, 3],
    movingPieceIds: new Set([0]),
    sourceCellByPieceId: new Map([[0, 0]]),
    groupByPieceId: createConnectedGroups(4, [[0, 1]]),
    anchorPieceId: 0,
    targetAnchorCellIndex: 2,
  });
  assert.equal(corruptedPlan.valid, false, "不完整移动组应被拒绝。");
  assert.equal(
    corruptedPlan.reason,
    PuzzleMoveFailureReason.InvalidMovingGroup,
    "不完整移动组返回了错误原因。",
  );
  namedCaseCount += 1;
}

// 对角线平移同样是刚性位移，L 形连接组不能被限制为只横移或只纵移。
expectValid("L 形组合对角线平移", {
  rows: 4,
  columns: 4,
  pieceIdsByCell: Array.from({ length: 16 }, (_value, index) => index),
  movingPieceIds: [0, 1, 4],
  targetAnchorCellIndex: 10,
});

// 穷举 2×3 的 720 种排列：除完整成图外，每一种状态都必须至少存在一次合法移动。
visitPermutations([0, 1, 2, 3, 4, 5], 0, (pieceIdsByCell) => {
  const groupByPieceId = createActualConnectedGroups(2, 3, pieceIdsByCell);
  const firstGroup = groupByPieceId.get(pieceIdsByCell[0]);
  assert.ok(firstGroup, "2×3 死局检查缺少首块组合。");
  if (firstGroup.pieceIds.size === pieceIdsByCell.length) {
    assert.deepEqual(
      pieceIdsByCell,
      [0, 1, 2, 3, 4, 5],
      "全棋盘单一连接组必须就是完成状态。",
    );
  } else {
    const legalMove = findFirstLegalMove(
      2,
      3,
      pieceIdsByCell,
      groupByPieceId,
    );
    assert.ok(
      legalMove,
      `2×3 出现规则死局：${pieceIdsByCell.join(",")}`,
    );
    applyAndValidatePlan(pieceIdsByCell, legalMove.plan);
    validateMovingGroupPreservation(
      3,
      legalMove.movingPieceIds,
      legalMove.plan,
    );
  }
  deadlockAuditCount += 1;
});

/**
 * 系统遍历 9×9 上多种矩形连接组与全部锚点落格。
 *
 * 期望值仅由几何边界计算：只要整组未越界且目标都是单块，规划必须成功；越过
 * 任意一条边则必须返回 TargetOutOfBounds。每个成功结果继续校验完整排列。
 */
const boardSize = 9;
const boardPieceIds = Array.from(
  { length: boardSize * boardSize },
  (_value, index) => index,
);
const groupShapes = [
  [1, 1],
  [1, 3],
  [3, 1],
  [2, 2],
  [2, 3],
  [3, 2],
];
for (const [groupRows, groupColumns] of groupShapes) {
  for (let startRow = 0; startRow <= boardSize - groupRows; startRow += 1) {
    for (
      let startColumn = 0;
      startColumn <= boardSize - groupColumns;
      startColumn += 1
    ) {
      const movingPieceIds = [];
      for (let row = 0; row < groupRows; row += 1) {
        for (let column = 0; column < groupColumns; column += 1) {
          movingPieceIds.push(
            (startRow + row) * boardSize + startColumn + column,
          );
        }
      }
      const anchorPieceId = movingPieceIds[0];
      for (
        let targetAnchorCellIndex = 0;
        targetAnchorCellIndex < boardPieceIds.length;
        targetAnchorCellIndex += 1
      ) {
        const targetRow = Math.floor(targetAnchorCellIndex / boardSize);
        const targetColumn = targetAnchorCellIndex % boardSize;
        const shouldFit =
          targetRow + groupRows <= boardSize &&
          targetColumn + groupColumns <= boardSize;
        const plan = planDrag({
          rows: boardSize,
          columns: boardSize,
          pieceIdsByCell: boardPieceIds,
          movingPieceIds,
          anchorPieceId,
          targetAnchorCellIndex,
        });
        assert.equal(
          plan.valid,
          shouldFit,
          `9×9 边界判定错误：${groupRows}×${groupColumns}，` +
            `source=${startRow},${startColumn}，target=${targetRow},${targetColumn}`,
        );
        if (shouldFit) {
          applyAndValidatePlan(boardPieceIds, plan);
        } else {
          assert.equal(
            plan.reason,
            PuzzleMoveFailureReason.TargetOutOfBounds,
            "越界组合返回了错误原因。",
          );
        }
        boundarySimulationCount += 1;
      }
    }
  }
}

/** 使用固定种子的伪随机数，保证连续拖拽模拟可重复。 */
let randomState = 0x5f3759df;
function nextRandomIndex(maximum) {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState % maximum;
}

/** 使用固定种子产生完整随机排列，便于稳定复现压力测试失败。 */
function createShuffledBoard(pieceCount) {
  const pieceIds = Array.from({ length: pieceCount }, (_value, index) => index);
  for (let index = pieceIds.length - 1; index > 0; index -= 1) {
    const targetIndex = nextRandomIndex(index + 1);
    [pieceIds[index], pieceIds[targetIndex]] = [
      pieceIds[targetIndex],
      pieceIds[index],
    ];
  }
  return pieceIds;
}

/**
 * 使用实际连接图执行随机组合拖拽。
 *
 * 随机棋盘会自然产生单块、横条、竖条和不规则小组；9×9 与 10×10 同时覆盖，
 * 用来确认关卡规模增长后源组合始终保持形状，同时目标组合可以让位且棋盘不会
 * 重复占格或丢失拼图。
 */
for (const [rows, columns, simulationCount] of [
  [9, 9, 3000],
  [10, 10, 2000],
]) {
  for (
    let simulationIndex = 0;
    simulationIndex < simulationCount;
    simulationIndex += 1
  ) {
    const pieceIdsByCell = createShuffledBoard(rows * columns);
    const groupByPieceId = createActualConnectedGroups(
      rows,
      columns,
      pieceIdsByCell,
    );
    const firstGroup = groupByPieceId.get(pieceIdsByCell[0]);
    assert.ok(firstGroup, `${rows}×${columns} 随机棋盘缺少首块组合。`);
    if (firstGroup.pieceIds.size !== pieceIdsByCell.length) {
      const legalMove = findFirstLegalMove(
        rows,
        columns,
        pieceIdsByCell,
        groupByPieceId,
      );
      assert.ok(
        legalMove,
        `${rows}×${columns} 随机真实组合棋盘出现规则死局。`,
      );
    }
    deadlockAuditCount += 1;

    const anchorPieceId = pieceIdsByCell[nextRandomIndex(pieceIdsByCell.length)];
    const movingGroup = groupByPieceId.get(anchorPieceId);
    const movingPieceIds = movingGroup.pieceIds;
    const sourceCellByPieceId = new Map(
      [...movingPieceIds].map((pieceId) => [
        pieceId,
        pieceIdsByCell.indexOf(pieceId),
      ]),
    );
    const plan = PuzzleMovePlanner.createPlan({
      rows,
      columns,
      pieceIdsByCell,
      movingPieceIds,
      sourceCellByPieceId,
      groupByPieceId,
      anchorPieceId,
      targetAnchorCellIndex: nextRandomIndex(pieceIdsByCell.length),
    });
    if (plan.valid) {
      applyAndValidatePlan(pieceIdsByCell, plan);
      validateMovingGroupPreservation(columns, movingPieceIds, plan);
    } else {
      assert.equal(plan.moves.length, 0, "失败计划不应暴露局部移动步骤。");
      assert.equal(
        plan.reason,
        PuzzleMoveFailureReason.TargetOutOfBounds,
        "有效棋盘上的随机拖拽只能因源组合越界失败。",
      );
    }
    connectedGroupSimulationCount += 1;
  }
}

// 连续执行 2000 次单块拖拽，验证反复置换后反向查找和排列不发生累积损坏。
let sequentialBoard = [...boardPieceIds];
for (let index = 0; index < 2000; index += 1) {
  const sourceCellIndex = nextRandomIndex(sequentialBoard.length);
  const targetCellIndex = nextRandomIndex(sequentialBoard.length);
  const movingPieceId = sequentialBoard[sourceCellIndex];
  const plan = planDrag({
    rows: boardSize,
    columns: boardSize,
    pieceIdsByCell: sequentialBoard,
    movingPieceIds: [movingPieceId],
    targetAnchorCellIndex: targetCellIndex,
  });
  sequentialBoard = applyAndValidatePlan(sequentialBoard, plan);
  sequentialSimulationCount += 1;
}

console.log(
  `拼图拖拽模拟通过：${namedCaseCount} 个规则用例，` +
    `${boundarySimulationCount} 次 9×9 边界落点，` +
    `${connectedGroupSimulationCount} 次真实连接组压力拖拽，` +
    `${deadlockAuditCount} 个棋盘死局检查，` +
    `${sequentialSimulationCount} 次连续拖拽。`,
);
