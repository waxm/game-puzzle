#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileAppFilesForTest } from "./testing/compile-core-for-test.mjs";

/** 项目根目录。 */
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** 项目统一的 Cocos 测试模拟模块路径。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 纯配置模块不使用引擎对象，仍复用项目统一的 TypeScript 测试编译入口。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "game/config/PuzzleAlbumCatalog.ts",
]);

try {
  const {
    PUZZLE_FIRST_ALBUM,
    createPuzzleAlbumProgress,
  } = await compiledApp.importModule("game/config/PuzzleAlbumCatalog.ts");

  const empty = createPuzzleAlbumProgress([]);
  assert.equal(empty.album, PUZZLE_FIRST_ALBUM);
  assert.equal(empty.completedPanelCount, 0);
  assert.equal(empty.remainingPanelCount, 5);
  assert.equal(empty.currentPanel.level, 1);
  assert.deepEqual(empty.panelStatuses, [
    "current",
    "locked",
    "locked",
    "locked",
    "locked",
  ]);

  const partial = createPuzzleAlbumProgress([4, 2, 1, 3, 3]);
  assert.equal(partial.completedPanelCount, 4);
  assert.equal(partial.remainingPanelCount, 1);
  assert.equal(partial.currentPanel.level, 5);
  assert.deepEqual(partial.panelStatuses, [
    "completed",
    "completed",
    "completed",
    "completed",
    "current",
  ]);

  const completed = createPuzzleAlbumProgress([1, 2, 3, 4, 5]);
  assert.equal(completed.completed, true);
  assert.equal(completed.currentPanel, null);
  assert.equal(completed.remainingPanelCount, 0);
  assert.deepEqual(
    completed.panelStatuses,
    Array.from({ length: 5 }, () => "completed"),
  );

  const jumped = createPuzzleAlbumProgress([2, -1, Number.NaN]);
  assert.equal(jumped.completedPanelCount, 1);
  assert.equal(jumped.currentPanel.level, 1);
  assert.deepEqual(jumped.panelStatuses, [
    "current",
    "completed",
    "locked",
    "locked",
    "locked",
  ]);

  console.log("画册配置与进度快照测试通过：4 项。");
} finally {
  compiledApp.cleanup();
}
