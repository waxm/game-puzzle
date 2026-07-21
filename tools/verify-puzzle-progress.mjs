#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

/** 只转换进度验证实际依赖的源码文件。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "core/utils/Logger.ts",
  "core/data/StorageManager.ts",
  "game/config/PuzzleLevelConfig.ts",
  "game/config/PuzzleLevelCatalog.generated.ts",
  "game/progress/PuzzleProgressManager.ts",
  "game/progress/PuzzleLevelSession.ts",
]);

/** 动态载入与被测模块共用的 Cocos 模拟实例。 */
const cocos = await import(pathToFileURL(cocosMockPath).href);

/** 动态载入进度相关真实业务模块。 */
const [
  { StorageManager },
  { Logger, LogLevel },
  levelConfig,
  progressModule,
  sessionModule,
] = await Promise.all([
    compiledApp.importModule("core/data/StorageManager.ts"),
    compiledApp.importModule("core/utils/Logger.ts"),
    compiledApp.importModule("game/config/PuzzleLevelConfig.ts"),
    compiledApp.importModule("game/progress/PuzzleProgressManager.ts"),
    compiledApp.importModule("game/progress/PuzzleLevelSession.ts"),
  ]);
const { PuzzleLevelNumbers } = levelConfig;
const { PuzzleProgressManager } = progressModule;
const { PuzzleLevelSession } = sessionModule;

/** 测试专用存档前缀。 */
const storagePrefix = "WorkAI.ProgressTest";

/** 待执行的具名进度测试。 */
const testCases = [];

/** 注册一个顺序执行的进度测试。 */
function test(name, callback) {
  testCases.push({ name, callback });
}

/** 在每个用例前恢复存档和当前关卡状态。 */
function resetTestState() {
  cocos.__mock.reset();
  Logger.setLevel(LogLevel.None);
  StorageManager.init(storagePrefix);
  PuzzleLevelSession.clear();
}

test("首次启动至少解锁第一关并可进入大厅", () => {
  const firstLevel = PuzzleLevelNumbers[0];
  assert.deepEqual(PuzzleProgressManager.getProgress(), {
    version: 1,
    completedLevels: [],
    unlockedLevels: [firstLevel],
  });
  assert.equal(PuzzleProgressManager.getHighestUnlockedLevel(), firstLevel);
  assert.equal(PuzzleLevelSession.selectHighestUnlockedLevel().level, firstLevel);
});

test("旧发布包写入的空解锁存档会自动修复并回写", () => {
  const firstLevel = PuzzleLevelNumbers[0];
  StorageManager.set("puzzleProgress", {
    version: 1,
    completedLevels: [],
    unlockedLevels: [],
  });

  const repaired = PuzzleProgressManager.getProgress();
  assert.deepEqual(repaired.unlockedLevels, [firstLevel]);
  assert.deepEqual(StorageManager.get("puzzleProgress", null), repaired);
  assert.equal(PuzzleLevelSession.selectHighestUnlockedLevel().level, firstLevel);
});

test("异常、重复和乱序编号会归一化并补齐连续解锁", () => {
  const [firstLevel, secondLevel, thirdLevel] = PuzzleLevelNumbers;
  StorageManager.set("puzzleProgress", {
    version: 99,
    completedLevels: [secondLevel, firstLevel, firstLevel, -1, "1"],
    unlockedLevels: [thirdLevel, secondLevel, secondLevel, 999999],
  });

  const normalized = PuzzleProgressManager.getProgress();
  assert.deepEqual(normalized, {
    version: 1,
    completedLevels: [firstLevel, secondLevel],
    unlockedLevels: [firstLevel, secondLevel, thirdLevel],
  });
  assert.deepEqual(StorageManager.get("puzzleProgress", null), normalized);
});

test("通关后解锁下一关，重复结算和重载不会产生重复记录", () => {
  const [firstLevel, secondLevel] = PuzzleLevelNumbers;
  assert.deepEqual(PuzzleProgressManager.completeLevel(firstLevel), {
    completedLevel: firstLevel,
    nextLevel: secondLevel,
    allCompleted: false,
  });
  PuzzleProgressManager.completeLevel(firstLevel);

  assert.deepEqual(PuzzleProgressManager.getProgress(), {
    version: 1,
    completedLevels: [firstLevel],
    unlockedLevels: [firstLevel, secondLevel],
  });
  PuzzleLevelSession.clear();
  assert.equal(PuzzleLevelSession.selectHighestUnlockedLevel().level, secondLevel);
});

test("非连续关卡编号和最后一关结算保持目录顺序", () => {
  const penultimateLevel = PuzzleLevelNumbers.at(-2);
  const lastLevel = PuzzleLevelNumbers.at(-1);
  assert.notEqual(penultimateLevel, undefined);
  assert.notEqual(lastLevel, undefined);
  StorageManager.set("puzzleProgress", {
    version: 1,
    completedLevels: [],
    unlockedLevels: [penultimateLevel],
  });

  assert.deepEqual(PuzzleProgressManager.completeLevel(penultimateLevel), {
    completedLevel: penultimateLevel,
    nextLevel: lastLevel,
    allCompleted: false,
  });
  assert.deepEqual(PuzzleProgressManager.completeLevel(lastLevel), {
    completedLevel: lastLevel,
    nextLevel: null,
    allCompleted: true,
  });
  assert.deepEqual(PuzzleProgressManager.getProgress().completedLevels, [
    penultimateLevel,
    lastLevel,
  ]);
});

test("仍然拒绝选择未解锁或不存在的关卡", () => {
  const [, lockedLevel] = PuzzleLevelNumbers;
  assert.throws(
    () => PuzzleLevelSession.selectLevel(lockedLevel),
    /拼图关卡尚未解锁/,
  );
  assert.throws(
    () => PuzzleLevelSession.selectLevel(999999),
    /拼图关卡资源不存在/,
  );
});

/** 顺序执行全部用例，失败时保留具名上下文并始终清理临时文件。 */
let passedCount = 0;
try {
  for (const testCase of testCases) {
    resetTestState();
    try {
      testCase.callback();
      passedCount += 1;
    } catch (error) {
      throw new Error(`拼图进度用例失败：${testCase.name}`, { cause: error });
    }
  }
  console.log(`拼图进度验证通过：${passedCount} 个用例。`);
} finally {
  compiledApp.cleanup();
}
