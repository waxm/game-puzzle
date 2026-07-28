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

/** Cocos 核心模拟模块路径。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 转换控制器状态测试所需的真实业务文件。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "core/utils/Logger.ts",
  "core/event/EventCenter.ts",
  "game/GameEvent.ts",
  "game/model/PuzzleGameState.ts",
  "game/model/PuzzleGroup.ts",
  "game/logic/PuzzleMovePlanner.ts",
  "game/logic/PuzzleBoard.ts",
  "game/controller/PuzzleGameController.ts",
]);

const [
  { Logger, LogLevel },
  { EventCenter },
  { GameEvent },
  { PuzzleGameStatus },
  { PuzzleGameController },
] = await Promise.all([
  compiledApp.importModule("core/utils/Logger.ts"),
  compiledApp.importModule("core/event/EventCenter.ts"),
  compiledApp.importModule("game/GameEvent.ts"),
  compiledApp.importModule("game/model/PuzzleGameState.ts"),
  compiledApp.importModule("game/controller/PuzzleGameController.ts"),
]);

/** 状态测试使用的确定三乘三关卡。 */
const levelConfig = {
  schemaVersion: 1,
  level: 1,
  sourceImagePath:
    "textures/game/levels/level_001/level_001_source/spriteFrame",
  rows: 3,
  columns: 3,
  boardWidth: 448,
  boardHeight: 448,
  timeLimitSeconds: 30,
  pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
};

/** 已通过的具名控制器用例数量。 */
let passedCount = 0;

/** 每个用例前清空全局事件并关闭测试日志。 */
function resetGlobalState() {
  EventCenter.clear();
  Logger.setLevel(LogLevel.None);
}

/** 顺序执行一个控制器状态用例。 */
function test(name, callback) {
  resetGlobalState();
  try {
    callback();
    passedCount += 1;
  } catch (error) {
    throw new Error(`拼图控制器用例失败：${name}`, { cause: error });
  } finally {
    EventCenter.clear();
  }
}

try {
  test("开始与重复开始保持监听和初始状态幂等", () => {
    const controller = new PuzzleGameController(levelConfig);
    const states = [];
    const observer = {};
    EventCenter.on(
      GameEvent.PuzzleStateChanged,
      (state) => states.push(state),
      observer,
    );

    assert.equal(controller.getState().status, PuzzleGameStatus.Idle);
    assert.equal(EventCenter.listenerCount(GameEvent.PuzzleRestart), 0);
    controller.start();
    controller.start();

    assert.equal(controller.getState().status, PuzzleGameStatus.Running);
    assert.equal(states.length, 1);
    assert.equal(EventCenter.listenerCount(GameEvent.PuzzleRestart), 1);
    assert.equal(EventCenter.listenerCount(GameEvent.PuzzleTimeExpired), 1);
    controller.destroy();
  });

  test("暂停期间拒绝输入和失败请求且只能恢复一次", () => {
    const controller = new PuzzleGameController(levelConfig);
    controller.start();
    const orderBeforePause = [...controller.pieceIdsByCell];
    const plan = controller.createMovePlan(0, 0);

    assert.equal(controller.pause(), true);
    assert.equal(controller.pause(), false);
    assert.equal(controller.getState().status, PuzzleGameStatus.Paused);
    assert.equal(controller.commitMovePlan(plan), null);
    assert.equal(controller.autoMerge(), null);
    EventCenter.emit(GameEvent.PuzzleTimeExpired);
    assert.equal(controller.getState().status, PuzzleGameStatus.Paused);
    assert.deepEqual([...controller.pieceIdsByCell], orderBeforePause);

    assert.equal(controller.resume(), true);
    assert.equal(controller.resume(), false);
    assert.equal(controller.getState().status, PuzzleGameStatus.Running);
    assert.ok(controller.commitMovePlan(plan));
    controller.destroy();
  });

  test("成功只结算一次且成功后所有旧输入失效", () => {
    const controller = new PuzzleGameController(levelConfig);
    let completionCount = 0;
    const observer = {};
    EventCenter.on(
      GameEvent.PuzzleCompleted,
      () => {
        completionCount += 1;
      },
      observer,
    );
    controller.start();

    while (controller.status === PuzzleGameStatus.Running) {
      assert.ok(controller.autoMerge());
    }
    const successOrder = [...controller.pieceIdsByCell];
    const stalePlan = controller.createMovePlan(0, 0);

    assert.equal(controller.status, PuzzleGameStatus.Success);
    assert.equal(controller.getState().completed, true);
    assert.equal(completionCount, 1);
    assert.equal(controller.autoMerge(), null);
    assert.equal(controller.commitMovePlan(stalePlan), null);
    EventCenter.emit(GameEvent.PuzzleTimeExpired);
    assert.equal(controller.status, PuzzleGameStatus.Success);
    assert.deepEqual([...controller.pieceIdsByCell], successOrder);
    assert.equal(completionCount, 1);
    controller.destroy();
  });

  test("失败锁定棋盘且重复失败请求不会重复结算", () => {
    const controller = new PuzzleGameController(levelConfig);
    let failureCount = 0;
    const observer = {};
    EventCenter.on(
      GameEvent.PuzzleFailed,
      () => {
        failureCount += 1;
      },
      observer,
    );
    controller.start();
    const plan = controller.createMovePlan(0, 0);
    const failedOrder = [...controller.pieceIdsByCell];

    EventCenter.emit(GameEvent.PuzzleTimeExpired);
    EventCenter.emit(GameEvent.PuzzleTimeExpired);
    assert.equal(controller.status, PuzzleGameStatus.Failure);
    assert.equal(controller.getState().failed, true);
    assert.equal(failureCount, 1);
    assert.equal(controller.commitMovePlan(plan), null);
    assert.equal(controller.autoMerge(), null);
    assert.deepEqual([...controller.pieceIdsByCell], failedOrder);
    controller.destroy();
  });

  test("成功和失败后重复重开均恢复同一初始运行态", () => {
    const controller = new PuzzleGameController(levelConfig);
    controller.start();
    EventCenter.emit(GameEvent.PuzzleTimeExpired);
    EventCenter.emit(GameEvent.PuzzleRestart);
    EventCenter.emit(GameEvent.PuzzleRestart);

    assert.equal(controller.status, PuzzleGameStatus.Running);
    assert.deepEqual([...controller.pieceIdsByCell], levelConfig.pieceOrder);
    assert.equal(controller.getState().placedCount, 0);
    assert.equal(EventCenter.listenerCount(GameEvent.PuzzleRestart), 1);

    while (controller.status === PuzzleGameStatus.Running) {
      controller.autoMerge();
    }
    assert.equal(controller.restart(), true);
    assert.equal(controller.status, PuzzleGameStatus.Running);
    assert.deepEqual([...controller.pieceIdsByCell], levelConfig.pieceOrder);
    controller.destroy();
  });

  test("销毁清理监听并永久拒绝恢复、重开和输入", () => {
    const controller = new PuzzleGameController(levelConfig);
    const states = [];
    const observer = {};
    EventCenter.on(
      GameEvent.PuzzleStateChanged,
      (state) => states.push(state),
      observer,
    );
    controller.start();
    const plan = controller.createMovePlan(0, 0);
    const orderBeforeDispose = [...controller.pieceIdsByCell];
    const stateCountBeforeDispose = states.length;

    controller.destroy();
    controller.destroy();
    controller.start();
    assert.equal(controller.pause(), false);
    assert.equal(controller.resume(), false);
    assert.equal(controller.restart(), false);
    assert.equal(controller.commitMovePlan(plan), null);
    assert.equal(controller.autoMerge(), null);

    assert.equal(controller.status, PuzzleGameStatus.Disposed);
    assert.equal(states.length, stateCountBeforeDispose + 1);
    assert.equal(EventCenter.listenerCount(GameEvent.PuzzleRestart), 0);
    assert.equal(EventCenter.listenerCount(GameEvent.PuzzleTimeExpired), 0);
    assert.deepEqual([...controller.pieceIdsByCell], orderBeforeDispose);
  });

  console.log(`拼图控制器状态验证通过：${passedCount} 个用例。`);
} finally {
  compiledApp.cleanup();
}
