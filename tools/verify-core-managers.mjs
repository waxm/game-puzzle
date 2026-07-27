#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileCoreForTest } from "./testing/compile-core-for-test.mjs";

/** 当前工具所在项目根目录。 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Cocos 核心模拟模块路径。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 临时转换核心 TypeScript，保持测试直接读取项目真实源码。 */
const compiledCore = compileCoreForTest(projectRoot, cocosMockPath);

/** 动态载入与被测模块共用的 Cocos 模拟实例。 */
const cocos = await import(pathToFileURL(cocosMockPath).href);

/** 动态载入全部核心模块。 */
const [{ App }, { AudioManager }, { StorageManager }, { EventCenter }] =
  await Promise.all([
    compiledCore.importModule("app/App.ts"),
    compiledCore.importModule("audio/AudioManager.ts"),
    compiledCore.importModule("data/StorageManager.ts"),
    compiledCore.importModule("event/EventCenter.ts"),
  ]);
const [
  { PoolManager },
  { ResManager },
  { SceneBase },
  { SceneManager },
  { TimerManager },
] = await Promise.all([
  compiledCore.importModule("pool/PoolManager.ts"),
  compiledCore.importModule("resource/ResManager.ts"),
  compiledCore.importModule("scene/SceneBase.ts"),
  compiledCore.importModule("scene/SceneManager.ts"),
  compiledCore.importModule("timer/TimerManager.ts"),
]);
const [{ UIBase }, { UIManager }, { Logger, LogLevel }] = await Promise.all([
  compiledCore.importModule("ui/UIBase.ts"),
  compiledCore.importModule("ui/UIManager.ts"),
  compiledCore.importModule("utils/Logger.ts"),
]);

/** 待执行的具名核心测试。 */
const testCases = [];

/** 注册一个顺序执行的核心测试。 */
function test(name, callback) {
  testCases.push({ name, callback });
}

/** 推进 Promise continuation，让异步管理器真正进入底层模拟加载队列。 */
async function flushMicrotasks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

/**
 * 捕获指定 console 方法。
 *
 * 部分测试会主动制造错误回调，用捕获替代真实控制台输出，既验证 Logger 收到错误，
 * 又避免把预期异常混入验证结果。
 */
async function captureConsole(methodNames, callback) {
  const calls = [];
  const originals = new Map();
  for (const methodName of methodNames) {
    originals.set(methodName, console[methodName]);
    console[methodName] = (...args) => calls.push({ methodName, args });
  }
  try {
    const result = await callback();
    return { calls, result };
  } finally {
    for (const [methodName, original] of originals) {
      console[methodName] = original;
    }
  }
}

/** 在每个用例前恢复全部框架和模拟引擎状态。 */
function resetTestState() {
  Logger.setLevel(LogLevel.None);
  if (App.inited) {
    App.reset();
  } else {
    UIManager.clear();
    AudioManager.reset();
    TimerManager.clearAll();
    PoolManager.clearAll();
    ResManager.reset();
    SceneManager.reset();
    EventCenter.clear();
  }
  cocos.__mock.reset();
  StorageManager.init("WorkAI.CoreTest");
  Logger.setPrefix("[WorkAI.CoreTest]");
  Logger.setLevel(LogLevel.None);
}

/**
 * 在指定模拟场景中初始化全局音频服务，并返回常驻节点上的两个独立音源。
 *
 * 测试通过公开的场景层级观察运行结果，不读取 AudioManager 私有字段，避免测试和实现细节
 * 形成不必要的耦合。
 */
function initializeAudioService(sceneName = "Boot") {
  cocos.director.setSceneName(sceneName);
  AudioManager.init();
  const persistRoots = cocos.director.getPersistRootNodes();
  assert.equal(persistRoots.length, 1);
  const audioRoot = persistRoots[0];
  assert.equal(audioRoot.name, "AudioRoot");

  const musicNode = audioRoot.children.find(
    (child) => child.name === "MusicSource",
  );
  const effectNode = audioRoot.children.find(
    (child) => child.name === "EffectSource",
  );
  assert.ok(musicNode);
  assert.ok(effectNode);
  const musicSource = musicNode.getComponent(cocos.AudioSource);
  const effectSource = effectNode.getComponent(cocos.AudioSource);
  assert.ok(musicSource);
  assert.ok(effectSource);
  assert.notEqual(musicSource, effectSource);
  return { audioRoot, musicSource, effectSource };
}

/** 用于验证 UI 生命周期、打开参数和复用次数的测试面板。 */
class RecordingPanel extends UIBase {
  /** 打开次数。 */
  openCount = 0;

  /** 关闭次数。 */
  closeCount = 0;

  /** 显示次数。 */
  showCount = 0;

  /** 隐藏次数。 */
  hideCount = 0;

  /** 最近一次打开参数。 */
  lastParams = null;

  /** 记录打开。 */
  onOpen(params) {
    this.openCount += 1;
    this.lastParams = params ?? null;
  }

  /** 记录关闭。 */
  onClose() {
    this.closeCount += 1;
  }

  /** 记录显示。 */
  onShow() {
    this.showCount += 1;
  }

  /** 记录隐藏。 */
  onHide() {
    this.hideCount += 1;
  }
}

/** 创建带指定面板组件的 Prefab，并记录所有实例。 */
function createPanelPrefab(PanelType = RecordingPanel) {
  const instances = [];
  const prefab = new cocos.Prefab(() => {
    const node = new cocos.Node(PanelType.name);
    const panel = node.addComponent(new PanelType());
    instances.push({ node, panel });
    return node;
  });
  return { instances, prefab };
}

test("Logger 按等级过滤并保留统一前缀", async () => {
  const { calls } = await captureConsole(
    ["debug", "info", "warn", "error"],
    async () => {
      Logger.setPrefix("[LoggerTest]");
      Logger.setLevel(LogLevel.Warn);
      Logger.debug("debug");
      Logger.info("info");
      Logger.warn("warn");
      Logger.error("error");
    },
  );

  assert.deepEqual(
    calls.map((call) => call.methodName),
    ["warn", "error"],
  );
  assert.equal(calls[0].args[0], "[LoggerTest]");
});

test("EventCenter 防重复注册并正确处理 once 重入", () => {
  let normalCount = 0;
  const callback = () => {
    normalCount += 1;
  };
  EventCenter.on("normal", callback, callback);
  EventCenter.on("normal", callback, callback);
  EventCenter.emit("normal");
  assert.equal(normalCount, 1);
  assert.equal(EventCenter.listenerCount("normal"), 1);

  let onceCount = 0;
  EventCenter.once("once", () => {
    onceCount += 1;
    EventCenter.emit("once");
  });
  EventCenter.emit("once");
  assert.equal(onceCount, 1);
  assert.equal(EventCenter.listenerCount("once"), 0);
});

test("EventCenter 在派发期间跳过已注销监听并隔离回调错误", async () => {
  const called = [];
  const second = () => called.push("second");
  EventCenter.on("remove-during-emit", () => {
    called.push("first");
    EventCenter.off("remove-during-emit", second);
  });
  EventCenter.on("remove-during-emit", second);
  EventCenter.emit("remove-during-emit");
  assert.deepEqual(called, ["first"]);

  let safeListenerCount = 0;
  Logger.setLevel(LogLevel.Error);
  const { calls } = await captureConsole(["error"], async () => {
    EventCenter.on("safe-emit", () => {
      throw new Error("预期监听错误");
    });
    EventCenter.on("safe-emit", () => {
      safeListenerCount += 1;
    });
    EventCenter.emit("safe-emit");
  });
  assert.equal(safeListenerCount, 1);
  assert.equal(calls.length, 1);
});

test("EventCenter 支持按归属对象批量清理", () => {
  const firstTarget = {};
  const secondTarget = {};
  let firstCount = 0;
  let secondCount = 0;
  EventCenter.on("owned", () => (firstCount += 1), firstTarget);
  EventCenter.on("owned", () => (secondCount += 1), secondTarget);
  EventCenter.clear(firstTarget);
  EventCenter.emit("owned");
  assert.equal(firstCount, 0);
  assert.equal(secondCount, 1);
});

test("StorageManager 隔离项目前缀并修复损坏 JSON", async () => {
  StorageManager.init("GameA");
  StorageManager.set("progress", { level: 3 });
  StorageManager.setString("token", "A-Token");
  assert.deepEqual(StorageManager.get("progress", null), { level: 3 });
  assert.equal(StorageManager.getString("token"), "A-Token");

  StorageManager.init("GameB");
  assert.equal(StorageManager.get("progress", 0), 0);
  StorageManager.set("progress", 8);
  StorageManager.clear();
  assert.equal(StorageManager.has("progress"), false);

  StorageManager.init("GameA");
  assert.deepEqual(StorageManager.get("progress", null), { level: 3 });
  cocos.sys.localStorage.setItem("GameA:broken", "{");
  Logger.setLevel(LogLevel.Error);
  const { calls } = await captureConsole(["error"], async () => {
    assert.equal(StorageManager.get("broken", 99), 99);
  });
  assert.equal(calls.length, 1);
});

test("TimerManager 执行单次与循环任务并支持暂停恢复", () => {
  let delayCount = 0;
  const delayId = TimerManager.delay(() => (delayCount += 1), 0);
  assert.equal(TimerManager.count(), 1);
  cocos.director.scheduler.runAllOnce();
  assert.equal(delayCount, 1);
  assert.equal(TimerManager.count(), 0);
  TimerManager.clear(delayId);

  let loopCount = 0;
  const loopId = TimerManager.loop(() => (loopCount += 1), 1);
  cocos.director.scheduler.runAllOnce();
  assert.equal(loopCount, 1);
  TimerManager.pause(loopId);
  assert.equal(TimerManager.isPaused(loopId), true);
  cocos.director.scheduler.runAllOnce();
  assert.equal(loopCount, 1);
  TimerManager.resume(loopId);
  cocos.director.scheduler.runAllOnce();
  assert.equal(loopCount, 2);
  TimerManager.clear(loopId);
  assert.equal(TimerManager.count(), 0);
});

test("TimerManager 按 owner 清理并在循环回调异常后停表", async () => {
  const owner = {};
  TimerManager.delay(() => undefined, 1, owner);
  TimerManager.loop(() => undefined, 1, owner);
  TimerManager.delay(() => undefined, 1);
  assert.equal(TimerManager.count(owner), 2);
  TimerManager.clearByOwner(owner);
  assert.equal(TimerManager.count(owner), 0);
  assert.equal(TimerManager.count(), 1);

  Logger.setLevel(LogLevel.Error);
  TimerManager.loop(() => {
    throw new Error("预期计时器错误");
  }, 1);
  const { calls } = await captureConsole(["error"], async () => {
    cocos.director.scheduler.runAllOnce();
  });
  assert.equal(calls.length, 1);
  assert.equal(TimerManager.count(), 0);
  assert.throws(() => TimerManager.delay(() => undefined, -1), RangeError);
  assert.throws(() => TimerManager.loop(() => undefined, 0), RangeError);
});

test("SceneManager 返回明确成功、失败和回调错误结果", async () => {
  cocos.director.setSceneName("Boot");
  SceneManager.syncCurrentScene();
  assert.equal(SceneManager.currentSceneName, "Boot");

  const loaded = await SceneManager.load("SceneA");
  assert.equal(loaded.status, "loaded");
  assert.equal(SceneManager.currentSceneName, "SceneA");

  cocos.director.failNextLoad(new Error("预期场景失败"));
  const failed = await SceneManager.load("Broken");
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "load-scene");
  assert.equal(SceneManager.loading, false);

  const callbackFailed = await SceneManager.load("SceneB", () => {
    throw new Error("预期场景回调错误");
  });
  assert.equal(callbackFailed.status, "failed");
  assert.equal(callbackFailed.reason, "loaded-callback");
  assert.equal(SceneManager.currentSceneName, "SceneB");
});

test("SceneManager 忽略并发请求并取消 reset 前的旧回调", async () => {
  cocos.director.deferNextLoad();
  const firstRequest = SceneManager.load("SceneBusy");
  const ignored = await SceneManager.load("SceneIgnored");
  assert.equal(ignored.status, "ignored");
  assert.equal(ignored.reason, "busy");
  assert.equal(ignored.activeSceneName, "SceneBusy");
  cocos.director.completeNextLoad();
  assert.equal((await firstRequest).status, "loaded");

  cocos.director.deferNextLoad();
  const staleRequest = SceneManager.load("SceneStale");
  SceneManager.reset();
  cocos.director.completeNextLoad();
  const cancelled = await staleRequest;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.reason, "reset");
  assert.equal(SceneManager.currentSceneName, "");
});

test("SceneBase 固定生命周期顺序并执行统一兜底清理", async () => {
  class RecordingScene extends SceneBase {
    calls = [];

    eventCount = 0;

    nodeEventCount = 0;

    onEnter() {
      this.calls.push("enter");
    }

    bindEvents() {
      this.calls.push("bind");
      EventCenter.on(
        "scene-fallback-event",
        () => (this.eventCount += 1),
        this,
      );
      TimerManager.loop(() => undefined, 1, this);
      this.node.on(
        "scene-node-event",
        () => (this.nodeEventCount += 1),
        this,
      );
    }

    unbindEvents() {
      this.calls.push("unbind");
    }

    onExit() {
      this.calls.push("exit");
    }

    loadForTest() {
      this.onLoad();
    }

    destroyForTest() {
      this.onDestroy();
    }

    validateForTest(bindings) {
      this.assertRequiredBindings(bindings);
    }

    acquireForTest(path) {
      return this.acquireResource(path, cocos.Asset);
    }
  }

  const node = new cocos.Node("Scene");
  const scene = node.addComponent(new RecordingScene());
  scene.loadForTest();
  assert.deepEqual(scene.calls, ["bind", "enter"]);
  assert.throws(
    () => scene.validateForTest({ uiRoot: null }),
    /Scene 节点未绑定：Scene\.uiRoot/,
  );

  const sceneAsset = new cocos.Asset();
  cocos.resources.register("scene/scoped", sceneAsset);
  const handle = await scene.acquireForTest("scene/scoped");
  assert.equal(sceneAsset.refCount, 1);
  assert.equal(handle.released, false);

  scene.destroyForTest();
  assert.deepEqual(scene.calls, ["bind", "enter", "unbind", "exit"]);
  assert.equal(EventCenter.listenerCount("scene-fallback-event"), 0);
  assert.equal(TimerManager.count(scene), 0);
  assert.equal(scene.unscheduleAllCount, 1);
  assert.deepEqual(cocos.Tween.stoppedTargets, [scene, node]);
  assert.equal(sceneAsset.refCount, 0);
  assert.equal(handle.released, true);

  EventCenter.emit("scene-fallback-event");
  node.emit("scene-node-event");
  assert.equal(scene.eventCount, 0);
  assert.equal(scene.nodeEventCount, 0);
  node.destroy();
  assert.deepEqual(scene.calls, ["bind", "enter", "unbind", "exit"]);
  assert.equal(scene.unscheduleAllCount, 1);
});

test("SceneBase 进入失败时隔离清理错误并完成回滚", async () => {
  class FailingScene extends SceneBase {
    calls = [];

    bindEvents() {
      this.calls.push("bind");
      EventCenter.on("failing-scene-event", () => undefined, this);
      TimerManager.loop(() => undefined, 1, this);
    }

    onEnter() {
      this.calls.push("enter");
      throw new Error("预期场景进入错误");
    }

    unbindEvents() {
      this.calls.push("unbind");
      throw new Error("预期事件注销错误");
    }

    onExit() {
      this.calls.push("exit");
      throw new Error("预期场景退出错误");
    }

    loadForTest() {
      this.onLoad();
    }
  }

  const node = new cocos.Node("FailingScene");
  const scene = node.addComponent(new FailingScene());
  Logger.setLevel(LogLevel.Error);
  const { calls } = await captureConsole(["error"], async () => {
    assert.throws(() => scene.loadForTest(), /预期场景进入错误/);
  });
  assert.ok(calls.length >= 3);
  assert.deepEqual(scene.calls, ["bind", "enter", "unbind", "exit"]);
  assert.equal(EventCenter.listenerCount("failing-scene-event"), 0);
  assert.equal(TimerManager.count(scene), 0);
  assert.equal(scene.unscheduleAllCount, 1);

  node.destroy();
  assert.deepEqual(scene.calls, ["bind", "enter", "unbind", "exit"]);
  assert.equal(scene.unscheduleAllCount, 1);
});

test("SceneBase 释放退出后才完成加载的场景资源", async () => {
  class AsyncResourceScene extends SceneBase {
    loadForTest() {
      this.onLoad();
    }

    acquireForTest(path) {
      return this.acquireResource(path, cocos.Asset);
    }
  }

  const node = new cocos.Node("AsyncResourceScene");
  const scene = node.addComponent(new AsyncResourceScene());
  scene.loadForTest();
  const asset = new cocos.Asset();
  cocos.resources.register("scene/deferred", asset);
  cocos.resources.deferNextLoad("scene/deferred");

  const request = scene.acquireForTest("scene/deferred");
  await flushMicrotasks();
  node.destroy();
  cocos.resources.completeNextLoad("scene/deferred");
  await assert.rejects(request, /场景已经退出，资源结果已释放/);
  assert.equal(asset.refCount, 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);
});

test("ResManager 保持单资源、目录、JSON 和 Prefab 引用成对", async () => {
  const asset = new cocos.Asset();
  cocos.resources.register("images/icon", asset);
  const handle = await ResManager.acquire("images/icon", cocos.Asset);
  assert.equal(asset.refCount, 1);
  assert.equal(ResManager.getReferenceCount("images/icon"), 1);
  assert.equal(ResManager.getActiveHandleCount(), 1);
  handle.release();
  handle.release();
  assert.equal(asset.refCount, 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);

  const firstDirectoryAsset = new cocos.Asset();
  const secondDirectoryAsset = new cocos.Asset();
  cocos.resources.registerDir("images/list", [
    firstDirectoryAsset,
    secondDirectoryAsset,
  ]);
  const directoryHandles = await ResManager.acquireDir(
    "images/list",
    cocos.Asset,
  );
  assert.equal(directoryHandles.length, 2);
  directoryHandles.forEach((item) => item.release());
  assert.equal(firstDirectoryAsset.refCount, 0);
  assert.equal(secondDirectoryAsset.refCount, 0);

  const jsonAsset = new cocos.JsonAsset({ duration: 30 });
  cocos.resources.register("config/game", jsonAsset);
  assert.deepEqual(await ResManager.loadJson("config/game"), { duration: 30 });
  assert.equal(jsonAsset.refCount, 0);

  const prefab = new cocos.Prefab(() => new cocos.Node("PrefabInstance"));
  cocos.resources.register("prefabs/test", prefab);
  const prefabInstance = await ResManager.instantiatePrefab("prefabs/test");
  assert.equal(prefab.refCount, 1);
  prefabInstance.node.destroy();
  prefabInstance.release();
  assert.equal(prefab.refCount, 0);
});

test("ResManager 合并分包请求并阻止释放仍被持有的分包", async () => {
  const bundle = new cocos.Bundle("chapter1");
  const bundleAsset = new cocos.Asset();
  bundle.register("icons/reward", bundleAsset);
  cocos.assetManager.registerBundle("chapter1", bundle);
  cocos.assetManager.deferNextBundle("chapter1");

  const firstLoad = ResManager.loadBundle("chapter1");
  const secondLoad = ResManager.loadBundle("chapter1");
  assert.equal(firstLoad, secondLoad);
  assert.equal(cocos.assetManager.loadBundleCount, 1);
  cocos.assetManager.completeNextBundle("chapter1");
  assert.equal(await firstLoad, bundle);

  const handle = await ResManager.acquire("icons/reward", cocos.Asset, {
    bundleName: "chapter1",
  });
  assert.equal(ResManager.removeBundle("chapter1"), false);
  assert.equal(cocos.assetManager.removedBundles.length, 0);
  handle.release();
  assert.equal(ResManager.removeBundle("chapter1"), true);
  assert.deepEqual(cocos.assetManager.removedBundles, [bundle]);
});

test("ResManager reset 使尚未完成的旧资源请求失效", async () => {
  const asset = new cocos.Asset();
  cocos.resources.register("images/deferred", asset);
  cocos.resources.deferNextLoad("images/deferred");
  const request = ResManager.acquire("images/deferred", cocos.Asset);
  await flushMicrotasks();
  ResManager.reset();
  cocos.resources.completeNextLoad("images/deferred");
  await assert.rejects(request, /资源加载已因管理器重置而失效/);
  assert.equal(asset.refCount, 0);
  assert.equal(ResManager.getActiveHandleCount(), 0);
});

test("UIBase 保持打开、显示、隐藏和关闭生命周期幂等", () => {
  const node = new cocos.Node("Panel");
  const panel = node.addComponent(new RecordingPanel());
  panel.open({ page: 1 });
  assert.equal(panel.isOpened, true);
  assert.deepEqual(panel.openParams, { page: 1 });
  assert.equal(panel.openCount, 1);
  assert.equal(panel.showCount, 1);

  panel.hide();
  panel.hide();
  panel.show();
  panel.show();
  assert.equal(panel.hideCount, 1);
  assert.equal(panel.showCount, 2);

  panel.close();
  panel.close();
  assert.equal(panel.isOpened, false);
  assert.equal(panel.openParams, null);
  assert.equal(panel.closeCount, 1);
  assert.equal(panel.hideCount, 2);
});

test("UIBase 即使隐藏回调失败也会继续执行关闭清理", () => {
  class FailingClosePanel extends UIBase {
    closeCount = 0;

    onHide() {
      throw new Error("预期隐藏错误");
    }

    onClose() {
      this.closeCount += 1;
    }
  }

  const node = new cocos.Node("FailingClosePanel");
  const panel = node.addComponent(new FailingClosePanel());
  panel.open();
  assert.throws(() => panel.close(), /预期隐藏错误/);
  assert.equal(panel.closeCount, 1);
  assert.equal(panel.isOpened, false);
});

test("UIManager 拒绝重复打开并正确复用缓存面板", async () => {
  const root = new cocos.Node("UIRoot");
  const { instances, prefab } = createPanelPrefab();
  cocos.resources.register("prefabs/recording", prefab);
  UIManager.setRoot(root);
  UIManager.register({
    name: "RecordingPanel",
    path: "prefabs/recording",
    cache: true,
  });

  const firstResult = await UIManager.open("RecordingPanel", { value: 1 });
  assert.equal(firstResult.status, "opened");
  assert.equal(firstResult.panel.openCount, 1);
  assert.deepEqual(firstResult.panel.lastParams, { value: 1 });
  assert.equal(prefab.refCount, 1);

  const repeatedResult = await UIManager.open("RecordingPanel", { value: 2 });
  assert.equal(repeatedResult.panel, firstResult.panel);
  assert.equal(firstResult.panel.openCount, 1);
  assert.deepEqual(firstResult.panel.lastParams, { value: 1 });

  UIManager.close("RecordingPanel");
  assert.equal(firstResult.panel.node.active, false);
  const reopenedResult = await UIManager.open("RecordingPanel", { value: 3 });
  assert.equal(reopenedResult.panel, firstResult.panel);
  assert.equal(reopenedResult.panel.openCount, 2);
  assert.deepEqual(reopenedResult.panel.lastParams, { value: 3 });
  assert.equal(instances.length, 1);

  UIManager.close("RecordingPanel", true);
  assert.equal(prefab.refCount, 0);
  assert.equal(instances[0].node.isValid, false);
});

test("UIManager 合并并发打开并取消关闭后的旧资源结果", async () => {
  const root = new cocos.Node("UIRoot");
  const { instances, prefab } = createPanelPrefab();
  cocos.resources.register("prefabs/deferred", prefab);
  UIManager.setRoot(root);
  UIManager.register({
    name: "DeferredPanel",
    path: "prefabs/deferred",
    cache: false,
  });

  cocos.resources.deferNextLoad("prefabs/deferred");
  const firstRequest = UIManager.open("DeferredPanel", { request: 1 });
  const secondRequest = UIManager.open("DeferredPanel", { request: 2 });
  await flushMicrotasks();
  assert.equal(cocos.resources.loadCount, 1);
  cocos.resources.completeNextLoad("prefabs/deferred");
  const [firstResult, secondResult] = await Promise.all([
    firstRequest,
    secondRequest,
  ]);
  assert.equal(firstResult.status, "opened");
  assert.equal(secondResult.panel, firstResult.panel);
  assert.equal(firstResult.panel.openCount, 1);
  assert.deepEqual(firstResult.panel.lastParams, { request: 1 });
  UIManager.close("DeferredPanel", true);

  cocos.resources.deferNextLoad("prefabs/deferred");
  const staleRequest = UIManager.open("DeferredPanel");
  await flushMicrotasks();
  UIManager.close("DeferredPanel", true);
  cocos.resources.completeNextLoad("prefabs/deferred");
  const staleResult = await staleRequest;
  assert.equal(staleResult.status, "cancelled");
  assert.equal(prefab.refCount, 0);
  assert.equal(instances.at(-1).node.isValid, false);
});

test("UIManager 销毁缺少组件或打开失败的不可信实例", async () => {
  const root = new cocos.Node("UIRoot");
  UIManager.setRoot(root);

  const missingComponentPrefab = new cocos.Prefab(
    () => new cocos.Node("MissingComponent"),
  );
  cocos.resources.register("prefabs/missing", missingComponentPrefab);
  UIManager.register({
    name: "MissingPanel",
    path: "prefabs/missing",
  });
  const missingResult = await UIManager.open("MissingPanel");
  assert.equal(missingResult.status, "failed");
  assert.equal(missingResult.reason, "missing-component");
  assert.equal(missingComponentPrefab.refCount, 0);

  class FailingOpenPanel extends UIBase {
    onOpen() {
      throw new Error("预期打开错误");
    }
  }
  const { instances, prefab } = createPanelPrefab(FailingOpenPanel);
  cocos.resources.register("prefabs/failing", prefab);
  UIManager.register({
    name: "FailingPanel",
    path: "prefabs/failing",
  });
  const failingResult = await UIManager.open("FailingPanel");
  assert.equal(failingResult.status, "failed");
  assert.equal(failingResult.reason, "open-lifecycle");
  assert.equal(prefab.refCount, 0);
  assert.equal(instances[0].node.isValid, false);
});

test("AudioManager 创建唯一常驻双音源并跨场景复用", () => {
  const { audioRoot } = initializeAudioService();
  assert.equal(audioRoot.parent, cocos.director.getScene());
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_HIDE), 1);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_SHOW), 1);

  AudioManager.init();
  assert.deepEqual(cocos.director.getPersistRootNodes(), [audioRoot]);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_HIDE), 1);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_SHOW), 1);

  cocos.director.setSceneName("SceneA");
  assert.equal(audioRoot.isValid, true);
  assert.equal(audioRoot.parent, cocos.director.getScene());
  assert.equal(cocos.director.isPersistRootNode(audioRoot), true);

  // 常驻标记被外部误删时，重新初始化必须销毁旧宿主并恢复唯一常驻节点。
  cocos.director.removePersistRootNode(audioRoot);
  AudioManager.init();
  const [recreatedRoot] = cocos.director.getPersistRootNodes();
  assert.ok(recreatedRoot);
  assert.notEqual(recreatedRoot, audioRoot);
  assert.equal(audioRoot.isValid, false);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_HIDE), 1);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_SHOW), 1);
});

test("AudioManager 切换音乐并在音效结束后释放资源", async () => {
  const { musicSource, effectSource } = initializeAudioService();

  const firstMusic = new cocos.AudioClip(10);
  const secondMusic = new cocos.AudioClip(12);
  const effect = new cocos.AudioClip(0.5);
  cocos.resources.register("audio/music-a", firstMusic);
  cocos.resources.register("audio/music-b", secondMusic);
  cocos.resources.register("audio/click", effect);

  await AudioManager.playMusic("audio/music-a", true, { volume: 0.6 });
  assert.equal(firstMusic.refCount, 1);
  assert.equal(musicSource.clip, firstMusic);
  assert.equal(musicSource.volume, 0.6);
  await AudioManager.playMusic("audio/music-b");
  assert.equal(firstMusic.refCount, 0);
  assert.equal(secondMusic.refCount, 1);
  assert.equal(AudioManager.getCurrentMusicPath(), "audio/music-b");

  await AudioManager.playEffect("audio/click", { volume: 0.4 });
  assert.equal(effect.refCount, 1);
  assert.deepEqual(effectSource.oneShotCalls, [
    { clip: effect, volume: 0.4 },
  ]);
  assert.deepEqual(musicSource.oneShotCalls, []);
  cocos.director.scheduler.runAllOnce();
  assert.equal(effect.refCount, 0);

  AudioManager.stopMusic();
  assert.equal(secondMusic.refCount, 0);
  assert.equal(musicSource.clip, null);
});

test("AudioManager 丢弃停止播放后的旧异步音乐结果", async () => {
  const { musicSource } = initializeAudioService();
  const music = new cocos.AudioClip(8);
  cocos.resources.register("audio/deferred", music);
  cocos.resources.deferNextLoad("audio/deferred");

  const request = AudioManager.playMusic("audio/deferred");
  await flushMicrotasks();
  AudioManager.stopMusic();
  cocos.resources.completeNextLoad("audio/deferred");
  await request;
  assert.equal(music.refCount, 0);
  assert.equal(musicSource.playCount, 0);
  assert.equal(AudioManager.getCurrentMusicPath(), "");
});

test("AudioManager 在前后台切换时只恢复仍有播放意图的音乐", async () => {
  const { musicSource } = initializeAudioService();
  const music = new cocos.AudioClip(8);
  cocos.resources.register("audio/background", music);

  cocos.game.emit(cocos.Game.EVENT_HIDE);
  await AudioManager.playMusic("audio/background");
  assert.equal(musicSource.clip, music);
  assert.equal(musicSource.playCount, 0);

  cocos.game.emit(cocos.Game.EVENT_SHOW);
  assert.equal(musicSource.playCount, 1);
  assert.equal(musicSource.playing, true);

  cocos.game.emit(cocos.Game.EVENT_HIDE);
  assert.equal(musicSource.pauseCount, 1);
  assert.equal(musicSource.playing, false);
  cocos.game.emit(cocos.Game.EVENT_SHOW);
  assert.equal(musicSource.playCount, 2);

  AudioManager.pauseMusic();
  assert.equal(musicSource.pauseCount, 2);
  cocos.game.emit(cocos.Game.EVENT_HIDE);
  cocos.game.emit(cocos.Game.EVENT_SHOW);
  assert.equal(musicSource.playCount, 2);

  AudioManager.resumeMusic();
  assert.equal(musicSource.playCount, 3);
});

test("AudioManager 丢弃切到后台后才完成加载的音效", async () => {
  const { effectSource } = initializeAudioService();
  const effect = new cocos.AudioClip(0.5);
  cocos.resources.register("audio/deferred-effect", effect);
  cocos.resources.deferNextLoad("audio/deferred-effect");

  const request = AudioManager.playEffect("audio/deferred-effect");
  await flushMicrotasks();
  cocos.game.emit(cocos.Game.EVENT_HIDE);
  cocos.resources.completeNextLoad("audio/deferred-effect");
  await request;

  assert.equal(effect.refCount, 0);
  assert.deepEqual(effectSource.oneShotCalls, []);
});

test("PoolManager 持有 Prefab、复位节点并执行复用协议", async () => {
  /** 记录对象池业务生命周期调用。 */
  class RecordingPoolLifecycle extends cocos.Component {
    /** reuse 收到的全部参数记录。 */
    reuseCalls = [];

    /** unuse 调用次数。 */
    unuseCount = 0;

    /** 记录本次复用参数。 */
    reuse(...args) {
      this.reuseCalls.push(args);
    }

    /** 记录一次回收清理。 */
    unuse() {
      this.unuseCount += 1;
    }
  }

  const prefab = new cocos.Prefab(() => {
    const node = new cocos.Node("PooledNode");
    node.setPosition(2, 3, 4);
    node.setScale(1.5, 1.5, 1.5);
    node.layer = 7;
    node.addComponent(new RecordingPoolLifecycle());
    return node;
  });
  cocos.resources.register("prefabs/effect", prefab);

  assert.equal(
    await PoolManager.create("effects", {
      prefabPath: "prefabs/effect",
      initialSize: 2,
      maxSize: 2,
      lifecycleComponent: RecordingPoolLifecycle,
    }),
    true,
  );
  assert.equal(prefab.refCount, 1);
  assert.deepEqual(PoolManager.getStats("effects"), {
    available: 2,
    inUse: 0,
    total: 2,
    maxSize: 2,
  });

  const firstNode = PoolManager.get("effects", "spark", 3);
  assert.ok(firstNode);
  const firstLifecycle = firstNode.getComponent(RecordingPoolLifecycle);
  assert.deepEqual(firstLifecycle.reuseCalls, [["spark", 3]]);
  firstNode.setPosition(99, 98, 97);
  firstNode.setScale(9, 8, 7);
  firstNode.active = false;
  firstNode.layer = 99;
  assert.equal(PoolManager.put("effects", firstNode), true);
  assert.equal(firstLifecycle.unuseCount, 2);
  assert.equal(PoolManager.put("effects", firstNode), false);

  const restoredNode = PoolManager.get("effects");
  assert.equal(restoredNode, firstNode);
  assert.deepEqual(restoredNode.position, new cocos.Vec3(2, 3, 4));
  assert.deepEqual(restoredNode.scale, new cocos.Vec3(1.5, 1.5, 1.5));
  assert.equal(restoredNode.active, true);
  assert.equal(restoredNode.layer, 7);

  const secondNode = PoolManager.get("effects");
  const overflowNode = PoolManager.get("effects");
  assert.ok(secondNode);
  assert.ok(overflowNode);
  assert.equal(PoolManager.put("effects", restoredNode), true);
  assert.equal(PoolManager.put("effects", secondNode), true);
  assert.equal(PoolManager.put("effects", overflowNode), false);
  assert.equal(overflowNode.isValid, false);
  assert.deepEqual(PoolManager.getStats("effects"), {
    available: 2,
    inUse: 0,
    total: 2,
    maxSize: 2,
  });

  const checkedOutNode = PoolManager.get("effects");
  assert.equal(PoolManager.clear("effects"), false);
  assert.equal(prefab.refCount, 1);
  assert.equal(checkedOutNode.isValid, true);
  assert.equal(PoolManager.clear("effects", true), true);
  assert.equal(checkedOutNode.isValid, false);
  assert.equal(prefab.refCount, 0);
  assert.equal(PoolManager.has("effects"), false);
});

test("PoolManager 取消加载中创建并拒绝缺失生命周期组件", async () => {
  const deferredPrefab = new cocos.Prefab(
    () => new cocos.Node("DeferredPooledNode"),
  );
  cocos.resources.register("prefabs/deferred-pool", deferredPrefab);
  cocos.resources.deferNextLoad("prefabs/deferred-pool");

  const pendingCreate = PoolManager.create("deferred", {
    prefabPath: "prefabs/deferred-pool",
  });
  await flushMicrotasks();
  assert.equal(PoolManager.clear("deferred"), true);
  cocos.resources.completeNextLoad("prefabs/deferred-pool");
  assert.equal(await pendingCreate, false);
  assert.equal(deferredPrefab.refCount, 0);
  assert.equal(PoolManager.has("deferred"), false);

  class MissingPoolLifecycle extends cocos.Component {}
  const invalidPrefab = new cocos.Prefab(
    () => new cocos.Node("InvalidPooledNode"),
  );
  cocos.resources.register("prefabs/invalid-pool", invalidPrefab);
  await assert.rejects(
    PoolManager.create("invalid", {
      prefabPath: "prefabs/invalid-pool",
      initialSize: 1,
      lifecycleComponent: MissingPoolLifecycle,
    }),
    /reuse\/unuse/,
  );
  assert.equal(invalidPrefab.refCount, 0);
  assert.equal(PoolManager.has("invalid"), false);

  const retryPrefab = new cocos.Prefab(
    () => new cocos.Node("RetryPooledNode"),
  );
  cocos.resources.failNextLoad("prefabs/retry-pool");
  await assert.rejects(
    PoolManager.create("retry", { prefabPath: "prefabs/retry-pool" }),
    /模拟资源加载失败/,
  );
  cocos.resources.register("prefabs/retry-pool", retryPrefab);
  assert.equal(
    await PoolManager.create("retry", { prefabPath: "prefabs/retry-pool" }),
    true,
  );
  assert.equal(PoolManager.clear("retry"), true);
  assert.equal(retryPrefab.refCount, 0);
});

test("App 初始化幂等并按顺序重置全局状态", async () => {
  cocos.director.setSceneName("Boot");
  App.init({
    storagePrefix: "CoreGame",
    logPrefix: "[CoreGame]",
  });
  App.init();
  assert.equal(App.inited, true);
  assert.equal(App.get("StorageManager"), StorageManager);
  assert.equal(App.get("AudioManager"), AudioManager);
  assert.equal(App.get("UIManager"), UIManager);
  assert.equal(App.get("SceneManager"), SceneManager);
  const [audioRoot] = cocos.director.getPersistRootNodes();
  assert.ok(audioRoot);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_HIDE), 1);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_SHOW), 1);

  StorageManager.set("persistent", 7);
  assert.equal(cocos.sys.localStorage.getItem("CoreGame:persistent"), "7");
  let eventCount = 0;
  EventCenter.on("reset-event", () => (eventCount += 1));
  TimerManager.delay(() => undefined, 1);
  const prefab = new cocos.Prefab(() => new cocos.Node("Pooled"));
  cocos.resources.register("prefabs/reset-pool", prefab);
  await PoolManager.create("reset-pool", {
    prefabPath: "prefabs/reset-pool",
    initialSize: 1,
  });
  const asset = new cocos.Asset();
  cocos.resources.register("reset/asset", asset);
  const handle = await ResManager.acquire("reset/asset", cocos.Asset);

  App.reset();
  EventCenter.emit("reset-event");
  assert.equal(App.inited, false);
  assert.equal(App.get("StorageManager"), null);
  assert.equal(eventCount, 0);
  assert.equal(TimerManager.count(), 0);
  assert.equal(PoolManager.size("reset-pool"), 0);
  assert.equal(prefab.refCount, 0);
  assert.equal(handle.released, true);
  assert.equal(asset.refCount, 0);
  assert.equal(StorageManager.get("persistent", 0), 7);
  assert.equal(audioRoot.isValid, false);
  assert.equal(cocos.director.getPersistRootNodes().length, 0);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_HIDE), 0);
  assert.equal(cocos.game.listenerCount(cocos.Game.EVENT_SHOW), 0);
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
      throw new Error(`核心框架用例失败：${testCase.name}`, { cause: error });
    }
  }
  resetTestState();
  console.log(
    `核心框架验证通过：${passedCount} 个用例，覆盖 App、Logger、Event、Storage、` +
      "Timer、Scene、Resource、UI、Audio 和 Pool。",
  );
} finally {
  compiledCore.cleanup();
}
