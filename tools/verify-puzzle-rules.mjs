#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileAppFilesForTest } from "./testing/compile-core-for-test.mjs";

/** 当前工具所在项目根目录。 */
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Cocos 核心模拟模块路径；纯规则不依赖引擎，但复用统一转换工具。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 转换棋盘规则及其全部运行时依赖。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "game/model/PuzzleGroup.ts",
  "game/logic/PuzzleMovePlanner.ts",
  "game/logic/PuzzleBoard.ts",
]);

const { PuzzleBoard } = await compiledApp.importModule(
  "game/logic/PuzzleBoard.ts",
);

/** 已完成的具名规则用例数量。 */
let passedCount = 0;

/** 顺序执行一个纯规则用例并统一记录结果。 */
function test(name, callback) {
  try {
    callback();
    passedCount += 1;
  } catch (error) {
    throw new Error(`拼图棋盘规则用例失败：${name}`, { cause: error });
  }
}

try {
  test("拒绝尺寸不完整、重复或越界的棋盘排列", () => {
    assert.throws(() => new PuzzleBoard(0, 3, []), /尺寸无效/);
    assert.throws(
      () => new PuzzleBoard(2, 2, [0, 1, 2]),
      /必须包含 4 块/,
    );
    assert.throws(
      () => new PuzzleBoard(2, 2, [0, 1, 1, 3]),
      /无效或重复编号/,
    );
    assert.throws(
      () => new PuzzleBoard(2, 2, [0, 1, 2, 4]),
      /无效或重复编号/,
    );
  });

  test("乱序开局由规则棋盘独立计算组合、进度和完成状态", () => {
    const board = new PuzzleBoard(3, 3, [4, 0, 7, 2, 8, 3, 6, 1, 5]);
    assert.equal(board.currentUpdate.completed, false);
    assert.equal(board.currentUpdate.placedCount, 0);
    assert.equal(board.currentUpdate.largestConnectedGroup, null);
    assert.equal(board.groups.length, 9);
    assert.deepEqual([...board.pieceIdsByCell], [4, 0, 7, 2, 8, 3, 6, 1, 5]);
  });

  test("有效移动原子更新排列、双向索引和正确连接组", () => {
    const board = new PuzzleBoard(3, 3, [4, 0, 7, 2, 8, 3, 6, 1, 5]);
    const plan = board.createMovePlan(0, 0);
    assert.equal(plan.valid, true);
    const update = board.commitMovePlan(plan);

    assert.deepEqual([...board.pieceIdsByCell], [0, 4, 7, 2, 8, 3, 6, 1, 5]);
    board.pieceIdsByCell.forEach((pieceId, cellIndex) => {
      assert.equal(board.getCellIndexByPieceId(pieceId), cellIndex);
      assert.equal(board.getPieceIdAt(cellIndex), pieceId);
    });
    assert.equal(update.completed, false);
  });

  test("过期计划在写入前被拒绝且不会破坏当前排列", () => {
    const board = new PuzzleBoard(3, 3, [4, 0, 7, 2, 8, 3, 6, 1, 5]);
    const expiredPlan = board.createMovePlan(0, 0);
    const firstUpdate = board.commitMovePlan(board.createMovePlan(4, 8));
    const stableOrder = [...board.pieceIdsByCell];

    assert.equal(firstUpdate.completed, false);
    assert.throws(() => board.commitMovePlan(expiredPlan), /已经过期/);
    assert.deepEqual([...board.pieceIdsByCell], stableOrder);
  });

  test("只有完整还原排列才能由规则棋盘确认通关", () => {
    const board = new PuzzleBoard(3, 3, [4, 0, 7, 2, 8, 3, 6, 1, 5]);
    const targetCells = [4, 8, 5, 3, 2, 7, 1];

    targetCells.forEach((targetCellIndex, index) => {
      const anchorPieceId = board.getPieceIdAt(0);
      const update = board.commitMovePlan(
        board.createMovePlan(anchorPieceId, targetCellIndex),
      );
      assert.equal(
        update.completed,
        index === targetCells.length - 1,
        `第 ${index + 1} 次移动的完成状态错误。`,
      );
    });

    assert.deepEqual(
      [...board.pieceIdsByCell],
      Array.from({ length: 9 }, (_value, index) => index),
    );
    assert.equal(board.currentUpdate.placedCount, 9);
    assert.equal(board.currentUpdate.largestConnectedGroup?.size, 9);
  });

  test("重置恢复关卡初始排列并清除上一局完成结果", () => {
    const initialOrder = [1, 0, 2, 3];
    const board = new PuzzleBoard(2, 2, [0, 1, 2, 3]);
    assert.equal(board.currentUpdate.completed, true);

    const update = board.reset(initialOrder);
    assert.equal(update.completed, false);
    assert.equal(update.placedCount, 2);
    assert.deepEqual([...board.pieceIdsByCell], initialOrder);
  });

  console.log(`拼图棋盘规则验证通过：${passedCount} 个用例。`);
} finally {
  compiledApp.cleanup();
}
