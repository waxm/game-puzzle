#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
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

/** 转换对象池和真实拼图块生命周期所需源码。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "core/utils/Logger.ts",
  "core/resource/ResManager.ts",
  "core/pool/PoolManager.ts",
  "core/ui/UIBase.ts",
  "ui/game/PuzzlePiece.ts",
]);

const cocos = await import(pathToFileURL(cocosMockPath).href);
const [
  { Logger, LogLevel },
  { ResManager },
  { PoolManager },
  { PuzzlePiece },
] = await Promise.all([
  compiledApp.importModule("core/utils/Logger.ts"),
  compiledApp.importModule("core/resource/ResManager.ts"),
  compiledApp.importModule("core/pool/PoolManager.ts"),
  compiledApp.importModule("ui/game/PuzzlePiece.ts"),
]);

/** 拼图对象池测试使用的业务名称。 */
const poolName = "puzzle.piece.lifecycle-test";

/** 创建带完整 Inspector 等价绑定的拼图块测试节点。 */
function createPuzzlePieceNode() {
  const node = new cocos.Node("PuzzlePiece");
  const piece = node.addComponent(new PuzzlePiece());
  piece.pieceTransform = node.addComponent(new cocos.UITransform());
  piece.imageSprite = node.addComponent(new cocos.Sprite());
  const labelNode = new cocos.Node("NumberLabel");
  node.addChild(labelNode);
  piece.numberLabel = labelNode.addComponent(new cocos.Label());
  piece.onLoad();
  return node;
}

try {
  Logger.setLevel(LogLevel.None);
  ResManager.reset();
  PoolManager.clearAll();
  cocos.__mock.reset();

  const prefab = new cocos.Prefab(createPuzzlePieceNode);
  cocos.resources.register("prefabs/game/PuzzlePiece", prefab);
  assert.equal(
    await PoolManager.create(poolName, {
      prefabPath: "prefabs/game/PuzzlePiece",
      maxSize: 2,
      lifecycleComponent: PuzzlePiece,
    }),
    true,
  );

  const firstFrame = new cocos.SpriteFrame();
  const firstParams = {
    id: 3,
    spriteFrame: firstFrame,
    onDragStart: () => true,
    onDragMove: () => undefined,
    onDrop: () => undefined,
  };
  const firstNode = PoolManager.get(poolName, firstParams);
  assert.ok(firstNode);
  const firstPiece = firstNode.getComponent(PuzzlePiece);
  assert.equal(firstPiece.imageSprite.spriteFrame, firstFrame);
  assert.equal(firstPiece.numberLabel.string, "4");
  assert.equal(firstNode.listenerCount(cocos.Node.EventType.TOUCH_START), 1);
  assert.equal(firstNode.listenerCount(cocos.Node.EventType.TOUCH_MOVE), 1);
  assert.equal(firstNode.listenerCount(cocos.Node.EventType.TOUCH_END), 1);
  assert.equal(firstNode.listenerCount(cocos.Node.EventType.TOUCH_CANCEL), 1);

  assert.equal(PoolManager.put(poolName, firstNode), true);
  assert.equal(firstPiece.imageSprite.spriteFrame, null);
  assert.equal(firstPiece.numberLabel.string, "");
  assert.equal(firstNode.listenerCount(cocos.Node.EventType.TOUCH_START), 0);
  assert.deepEqual(PoolManager.getStats(poolName), {
    available: 1,
    inUse: 0,
    total: 1,
    maxSize: 2,
  });

  const secondFrame = new cocos.SpriteFrame();
  const reusedNode = PoolManager.get(poolName, {
    ...firstParams,
    id: 7,
    spriteFrame: secondFrame,
  });
  assert.equal(reusedNode, firstNode);
  assert.equal(firstPiece.imageSprite.spriteFrame, secondFrame);
  assert.equal(firstPiece.numberLabel.string, "8");
  assert.equal(reusedNode.listenerCount(cocos.Node.EventType.TOUCH_START), 1);
  assert.equal(PoolManager.put(poolName, reusedNode), true);
  assert.equal(PoolManager.clear(poolName), true);
  assert.equal(PoolManager.getStats(poolName), null);
  assert.equal(prefab.refCount, 0);

  const destroyingNode = createPuzzlePieceNode();
  const destroyingPiece = destroyingNode.getComponent(PuzzlePiece);
  // Creator 销毁父节点时 Inspector 子组件引用可能已被置空，销毁兜底不得再访问它们。
  destroyingPiece.pieceTransform = null;
  destroyingPiece.imageSprite = null;
  destroyingPiece.numberLabel = null;
  assert.doesNotThrow(() => destroyingPiece.onDestroy());

  // 结构检查防止后续改动重新绕过对象池或创建无 owner 的面板计时器。
  const panelSource = fs.readFileSync(
    path.join(projectRoot, "assets/app/ui/game/UIGamePanel.ts"),
    "utf8",
  );
  const sceneSource = fs.readFileSync(
    path.join(projectRoot, "assets/app/scenes/GameScene.ts"),
    "utf8",
  );
  assert.doesNotMatch(panelSource, /\binstantiate\s*\(/);
  assert.match(panelSource, /PoolManager\.create\(/);
  assert.match(panelSource, /PoolManager\.get\(/);
  assert.match(panelSource, /PoolManager\.put\(/);
  assert.match(sceneSource, /PoolManager\.clear\(PuzzlePoolName\.Piece,\s*true\)/);
  assert.match(
    panelSource,
    /TimerManager\.delay\(\s*countDown,\s*1,\s*this,\s*\)/,
  );
  assert.match(
    panelSource,
    /TimerManager\.delay\(\(\)\s*=>\s*sourceHandle\.release\(\),\s*0,\s*sourceHandle\)/,
  );

  console.log("拼图生命周期验证通过：对象池复用、回收清理、场景释放和计时器 owner。");
} finally {
  PoolManager.clearAll();
  ResManager.reset();
  cocos.__mock.reset();
  compiledApp.cleanup();
}
