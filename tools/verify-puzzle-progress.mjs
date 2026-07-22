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

/** 只转换进度与异步 JSON 加载验证实际依赖的源码文件。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "core/utils/Logger.ts",
  "core/data/StorageManager.ts",
  "core/resource/ResManager.ts",
  "game/config/PuzzleLevelConfig.ts",
  "game/config/PuzzleLevelCatalog.generated.ts",
  "game/config/PuzzleLevelConfigLoader.ts",
  "game/progress/PuzzleProgressManager.ts",
  "game/progress/PuzzleLevelSession.ts",
]);

/** 动态载入与被测模块共用的 Cocos 模拟实例。 */
const cocos = await import(pathToFileURL(cocosMockPath).href);

/** 动态载入进度、资源和关卡配置相关真实业务模块。 */
const [
  { StorageManager },
  { Logger, LogLevel },
  { ResManager },
  levelConfig,
  { PuzzleLevelConfigLoader },
  progressModule,
  sessionModule,
] = await Promise.all([
  compiledApp.importModule("core/data/StorageManager.ts"),
  compiledApp.importModule("core/utils/Logger.ts"),
  compiledApp.importModule("core/resource/ResManager.ts"),
  compiledApp.importModule("game/config/PuzzleLevelConfig.ts"),
  compiledApp.importModule("game/config/PuzzleLevelConfigLoader.ts"),
  compiledApp.importModule("game/progress/PuzzleProgressManager.ts"),
  compiledApp.importModule("game/progress/PuzzleLevelSession.ts"),
]);
const { getPuzzleLevelConfigPath, PuzzleLevelNumbers } = levelConfig;
const { PuzzleProgressManager } = progressModule;
const { PuzzleLevelSession } = sessionModule;

/** 测试专用存档前缀。 */
const storagePrefix = "WorkAI.ProgressTest";

/** 待执行的具名进度测试。 */
const testCases = [];

/** 注册一个顺序执行的异步进度测试。 */
function test(name, callback) {
  testCases.push({ name, callback });
}

/** 在每个用例前恢复资源、存档、缓存和当前关卡状态。 */
function resetTestState() {
  ResManager.reset();
  cocos.__mock.reset();
  Logger.setLevel(LogLevel.None);
  StorageManager.init(storagePrefix);
  PuzzleLevelSession.clear();

  // Session 的配置缓存跨场景保留，测试必须显式清空才能隔离各用例的 JsonAsset。
  PuzzleLevelSession._configCache.clear();
}

/** 创建一份符合 schemaVersion 1 严格规则的三乘三关卡配置。 */
function createValidLevelConfig(level) {
  const levelName = `level_${String(level).padStart(3, "0")}`;
  return {
    schemaVersion: 1,
    level,
    sourceImagePath:
      `textures/game/levels/${levelName}/${levelName}_source/spriteFrame`,
    rows: 3,
    columns: 3,
    boardWidth: 448,
    boardHeight: 448,
    timeLimitSeconds: 30,
    pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
  };
}

/** 返回目录中登记的 JsonAsset 路径，并断言测试编号确实存在。 */
function getRequiredConfigPath(level) {
  const configPath = getPuzzleLevelConfigPath(level);
  assert.notEqual(configPath, null, `测试关卡 ${level} 必须存在 JSON 路径。`);
  return configPath;
}

/** 向 Cocos resources 模拟器注册指定关卡 JSON。 */
function registerLevelJson(level, json) {
  const configPath = getRequiredConfigPath(level);
  const asset = new cocos.JsonAsset(json);
  cocos.resources.register(configPath, asset);
  return { asset, configPath };
}

/** 注册合法 JSON，供必须走真实异步选择链路的用例使用。 */
function registerValidLevel(level) {
  const config = createValidLevelConfig(level);
  return { config, ...registerLevelJson(level, config) };
}

/** 等待异步 ResManager 把指定请求交给延迟加载器。 */
async function waitForPendingResourceLoad(configPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (
      cocos.resources._pendingLoads.some(
        (request) => request.path === configPath,
      )
    ) {
      return;
    }
    await Promise.resolve();
  }
  assert.fail(`异步资源请求未进入等待队列：${configPath}`);
}

test("首次启动至少解锁第一关并通过 JSON 加载进入大厅", async () => {
  const firstLevel = PuzzleLevelNumbers[0];
  const { asset, configPath } = registerValidLevel(firstLevel);
  assert.deepEqual(PuzzleProgressManager.getProgress(), {
    version: 1,
    completedLevels: [],
    unlockedLevels: [firstLevel],
  });
  assert.equal(PuzzleProgressManager.getHighestUnlockedLevel(), firstLevel);

  const selected = await PuzzleLevelSession.selectHighestUnlockedLevel();
  assert.equal(selected.level, firstLevel);
  assert.equal(PuzzleLevelSession.getCurrentLevel(), selected);
  assert.equal(ResManager.getReferenceCount(configPath), 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);
  assert.equal(asset.refCount, 0, "JsonAsset 数据取出后必须立即归还引用。");
});

test("旧发布包写入的空解锁存档会自动修复并回写", async () => {
  const firstLevel = PuzzleLevelNumbers[0];
  registerValidLevel(firstLevel);
  StorageManager.set("puzzleProgress", {
    version: 1,
    completedLevels: [],
    unlockedLevels: [],
  });

  const repaired = PuzzleProgressManager.getProgress();
  assert.deepEqual(repaired.unlockedLevels, [firstLevel]);
  assert.deepEqual(StorageManager.get("puzzleProgress", null), repaired);
  assert.equal(
    (await PuzzleLevelSession.selectHighestUnlockedLevel()).level,
    firstLevel,
  );
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

test("通关后解锁下一关，重复结算和重载不会产生重复记录", async () => {
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
  registerValidLevel(secondLevel);
  assert.equal(
    (await PuzzleLevelSession.selectHighestUnlockedLevel()).level,
    secondLevel,
  );
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

test("严格加载器拒绝未知字段和重复拼图编号且不泄漏引用", async () => {
  const firstLevel = PuzzleLevelNumbers[0];
  const configWithUnknownField = {
    ...createValidLevelConfig(firstLevel),
    unexpected: true,
  };
  const firstAsset = registerLevelJson(
    firstLevel,
    configWithUnknownField,
  ).asset;
  await assert.rejects(
    PuzzleLevelConfigLoader.load(firstLevel),
    /包含未知字段：unexpected/,
  );
  assert.equal(firstAsset.refCount, 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);

  const configWithDuplicatePiece = {
    ...createValidLevelConfig(firstLevel),
    pieceOrder: [0, 0, 2, 3, 4, 5, 6, 7, 8],
  };
  const { asset: secondAsset, configPath } = registerLevelJson(
    firstLevel,
    configWithDuplicatePiece,
  );
  await assert.rejects(
    PuzzleLevelConfigLoader.load(firstLevel),
    /无重复排列/,
  );
  assert.equal(secondAsset.refCount, 0);
  assert.equal(ResManager.getReferenceCount(configPath), 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);
});

test("仍然拒绝选择未解锁或不存在的关卡", async () => {
  const [, lockedLevel] = PuzzleLevelNumbers;
  await assert.rejects(
    PuzzleLevelSession.selectLevel(lockedLevel),
    /拼图关卡尚未解锁/,
  );
  await assert.rejects(
    PuzzleLevelSession.selectLevel(999999),
    /拼图关卡资源不存在/,
  );
});

test("后发选择生效后延迟完成的旧选择会失效并释放 JsonAsset", async () => {
  const penultimateLevel = PuzzleLevelNumbers.at(-2);
  const lastLevel = PuzzleLevelNumbers.at(-1);
  assert.notEqual(penultimateLevel, undefined);
  assert.notEqual(lastLevel, undefined);
  StorageManager.set("puzzleProgress", {
    version: 1,
    completedLevels: [],
    unlockedLevels: [penultimateLevel, lastLevel],
  });

  const oldLevel = registerValidLevel(penultimateLevel);
  const latestLevel = registerValidLevel(lastLevel);
  cocos.resources.deferNextLoad(oldLevel.configPath);

  const oldSelection = PuzzleLevelSession.selectLevel(penultimateLevel);
  await waitForPendingResourceLoad(oldLevel.configPath);
  const latestSelection = await PuzzleLevelSession.selectLevel(lastLevel);
  assert.equal(latestSelection.level, lastLevel);

  cocos.resources.completeNextLoad(oldLevel.configPath);
  await assert.rejects(oldSelection, /拼图关卡选择请求已失效/);
  assert.equal(PuzzleLevelSession.getCurrentLevel().level, lastLevel);
  assert.equal(oldLevel.asset.refCount, 0);
  assert.equal(latestLevel.asset.refCount, 0);
  assert.equal(ResManager.getReferenceCount(oldLevel.configPath), 0);
  assert.equal(ResManager.getReferenceCount(latestLevel.configPath), 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);
});

/** 顺序执行全部用例，失败时保留具名上下文并始终清理临时文件。 */
let passedCount = 0;
try {
  for (const testCase of testCases) {
    resetTestState();
    try {
      await testCase.callback();
      passedCount += 1;
    } catch (error) {
      throw new Error(`拼图进度用例失败：${testCase.name}`, { cause: error });
    }
  }
  console.log(`拼图进度验证通过：${passedCount} 个用例。`);
} finally {
  ResManager.reset();
  compiledApp.cleanup();
}
