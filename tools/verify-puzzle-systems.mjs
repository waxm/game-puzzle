#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileAppFilesForTest } from "./testing/compile-core-for-test.mjs";

/** 项目根目录。 */
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Cocos 测试模拟模块。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 转换设置和玩家资料真实依赖的应用源码。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "core/utils/Logger.ts",
  "core/data/StorageManager.ts",
  "core/event/EventCenter.ts",
  "core/timer/TimerManager.ts",
  "core/resource/ResManager.ts",
  "core/audio/AudioManager.ts",
  "game/PuzzleGameKey.ts",
  "game/PuzzleSystemEvent.ts",
  "game/profile/PuzzleAvatarCatalog.ts",
  "game/profile/PuzzleProfileManager.ts",
  "game/settings/PuzzleSettingsManager.ts",
]);

/** 动态载入与业务代码共用的 Cocos 模拟器。 */
const cocos = await import(pathToFileURL(cocosMockPath).href);

/** 动态载入设置与资料模块。 */
const [
  { StorageManager },
  { EventCenter },
  { Logger, LogLevel },
  { PuzzleStorageKey },
  { PuzzleSystemEvent },
  avatarCatalog,
  profileModule,
  settingsModule,
] = await Promise.all([
  compiledApp.importModule("core/data/StorageManager.ts"),
  compiledApp.importModule("core/event/EventCenter.ts"),
  compiledApp.importModule("core/utils/Logger.ts"),
  compiledApp.importModule("game/PuzzleGameKey.ts"),
  compiledApp.importModule("game/PuzzleSystemEvent.ts"),
  compiledApp.importModule("game/profile/PuzzleAvatarCatalog.ts"),
  compiledApp.importModule("game/profile/PuzzleProfileManager.ts"),
  compiledApp.importModule("game/settings/PuzzleSettingsManager.ts"),
]);

const { PUZZLE_AVATAR_CATALOG } = avatarCatalog;
const { PuzzleProfileManager, PUZZLE_PROFILE_NAME_MAX_LENGTH } = profileModule;
const { PuzzleSettingsManager } = settingsModule;

/** 测试专属存档前缀。 */
const storagePrefix = "game-puzzle.system-test";

/** 待顺序执行的系统模块用例。 */
const testCases = [];

/** 注册一个具名用例。 */
function test(name, callback) {
  testCases.push({ name, callback });
}

/** 在每个用例前恢复存档、事件和服务状态。 */
function resetTestState() {
  cocos.__mock.reset();
  Logger.setLevel(LogLevel.None);
  StorageManager.init(storagePrefix);
  EventCenter.clear();
  PuzzleSettingsManager.reset();
  PuzzleProfileManager.reset();
}

test("首次启动创建默认设置并同步两个音频通道", () => {
  const audioCalls = [];
  PuzzleSettingsManager.setAudioPort({
    setMusicEnabled(enabled) {
      audioCalls.push(["music", enabled]);
    },
    setEffectsEnabled(enabled) {
      audioCalls.push(["effects", enabled]);
    },
  });

  assert.deepEqual(PuzzleSettingsManager.initialize(), {
    version: 1,
    soundEnabled: true,
    vibrationEnabled: true,
  });
  assert.deepEqual(audioCalls, [
    ["music", true],
    ["effects", true],
  ]);
  assert.deepEqual(
    StorageManager.get(PuzzleStorageKey.Settings, null),
    PuzzleSettingsManager.getSettings(),
  );
});

test("损坏设置回退默认值，声音切换会持久化并派发快照", () => {
  StorageManager.set(PuzzleStorageKey.Settings, {
    version: 99,
    soundEnabled: "yes",
    vibrationEnabled: null,
  });
  const audioCalls = [];
  PuzzleSettingsManager.setAudioPort({
    setMusicEnabled(enabled) {
      audioCalls.push(["music", enabled]);
    },
    setEffectsEnabled(enabled) {
      audioCalls.push(["effects", enabled]);
    },
  });
  const changes = [];
  EventCenter.on(
    PuzzleSystemEvent.SettingsChanged,
    (settings) => changes.push(settings),
    changes,
  );

  PuzzleSettingsManager.initialize();
  const changed = PuzzleSettingsManager.setSoundEnabled(false);
  assert.equal(changed.soundEnabled, false);
  assert.deepEqual(audioCalls.at(-2), ["music", false]);
  assert.deepEqual(audioCalls.at(-1), ["effects", false]);
  assert.deepEqual(changes, [changed]);
  assert.deepEqual(
    StorageManager.get(PuzzleStorageKey.Settings, null),
    changed,
  );
});

test("震动关闭时不触发平台，重新开启只预览一次", () => {
  const durations = [];
  PuzzleSettingsManager.setAudioPort({
    setMusicEnabled() {},
    setEffectsEnabled() {},
  });
  PuzzleSettingsManager.setHapticsPort({
    vibrate(durationMs) {
      durations.push(durationMs);
      return true;
    },
  });
  PuzzleSettingsManager.initialize();
  PuzzleSettingsManager.setVibrationEnabled(false);
  assert.equal(PuzzleSettingsManager.vibrate(), false);
  PuzzleSettingsManager.setVibrationEnabled(true);
  assert.deepEqual(durations, [35]);
  assert.equal(PuzzleSettingsManager.vibrate(12.4), true);
  assert.deepEqual(durations, [35, 12]);
});

test("设置外部动作通过统一接口转发", async () => {
  const actions = [];
  PuzzleSettingsManager.setExternalPort({
    open(action) {
      actions.push(action);
      return action === "privacy";
    },
  });
  assert.equal(
    await PuzzleSettingsManager.openExternalAction("privacy"),
    true,
  );
  assert.equal(await PuzzleSettingsManager.openExternalAction("help"), false);
  assert.deepEqual(actions, ["privacy", "help"]);
});

test("首次启动创建默认玩家资料并返回独立快照", () => {
  const profile = PuzzleProfileManager.initialize();
  assert.deepEqual(profile, {
    version: 1,
    name: "拼图玩家",
    avatarId: PUZZLE_AVATAR_CATALOG[0].id,
  });
  profile.name = "外部篡改";
  assert.equal(PuzzleProfileManager.getProfile().name, "拼图玩家");
});

test("玩家名称会去空白并按 Unicode 字符安全截断", () => {
  PuzzleProfileManager.initialize();
  const longName = `  ${"光".repeat(PUZZLE_PROFILE_NAME_MAX_LENGTH + 3)}  `;
  const profile = PuzzleProfileManager.setName(longName);
  assert.equal(
    Array.from(profile.name).length,
    PUZZLE_PROFILE_NAME_MAX_LENGTH,
  );
  assert.throws(
    () => PuzzleProfileManager.setName("   "),
    /玩家名称不能为空/,
  );
});

test("头像选择持久化并通知大厅，非法编号被拒绝", () => {
  PuzzleProfileManager.initialize();
  const selected = PUZZLE_AVATAR_CATALOG[3];
  const changes = [];
  EventCenter.on(
    PuzzleSystemEvent.ProfileChanged,
    (profile) => changes.push(profile),
    changes,
  );

  const profile = PuzzleProfileManager.selectAvatar(selected.id);
  assert.equal(profile.avatarId, selected.id);
  assert.deepEqual(changes, [profile]);
  assert.deepEqual(
    StorageManager.get(PuzzleStorageKey.Profile, null),
    profile,
  );
  assert.throws(
    () => PuzzleProfileManager.selectAvatar("missing"),
    /头像编号不存在/,
  );
});

test("损坏资料会修复为空安全默认值", () => {
  StorageManager.set(PuzzleStorageKey.Profile, {
    version: 1,
    name: "   ",
    avatarId: "removed-avatar",
  });
  assert.deepEqual(PuzzleProfileManager.initialize(), {
    version: 1,
    name: "拼图玩家",
    avatarId: PUZZLE_AVATAR_CATALOG[0].id,
  });
});

try {
  for (const testCase of testCases) {
    resetTestState();
    await testCase.callback();
    console.log(`✓ ${testCase.name}`);
  }
  console.log(`系统模块测试通过：${testCases.length} 项。`);
} finally {
  compiledApp.cleanup();
}
