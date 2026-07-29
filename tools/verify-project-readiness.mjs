#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileAppFilesForTest } from "./testing/compile-core-for-test.mjs";

/** 当前工具所在项目根目录。 */
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Cocos 核心模拟模块路径；注册表本身不依赖引擎，但测试转换器需要固定入口。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 读取并解析项目内 JSON 文件。 */
function readJson(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** 断言项目内文件存在。 */
function assertProjectFile(relativePath, description) {
  assert.equal(
    fs.existsSync(path.join(projectRoot, relativePath)),
    true,
    `${description}不存在：${relativePath}`,
  );
}

/** 转换并载入纯常量注册表，避免在校验脚本中复制运行时配置。 */
const compiledApp = compileAppFilesForTest(
  projectRoot,
  cocosMockPath,
  ["game/PuzzleGameKey.ts"],
);

try {
  const {
    PuzzleDisplayConfig,
    PuzzleSceneName,
    PuzzleStorageKey,
    PuzzleUIConfig,
    PuzzleUIName,
  } = await compiledApp.importModule("game/PuzzleGameKey.ts");

  const projectSettings = readJson("settings/v2/packages/project.json");
  assert.deepEqual(
    projectSettings.general?.designResolution,
    { width: 640, height: 1136, policy: 2 },
    "设计分辨率必须固定为 640×1136，并使用 SHOW_ALL 防止 iframe 裁切。",
  );
  assert.deepEqual(
    PuzzleDisplayConfig,
    { Width: 640, Height: 1136 },
    "运行时设计画布配置必须保持 640×1136。",
  );

  const engineSettings = readJson("settings/v2/packages/engine.json");
  const includedEngineModules =
    engineSettings.modules?.includeModules ?? [];
  const requiredEngineModules = [
    "2d",
    "3d",
    "audio",
    "base",
    "custom-pipeline",
    "gfx-webgl",
    "intersection-2d",
    "primitive",
    "tween",
    "ui",
  ];
  const forbiddenEngineModules = [
    "dragon-bones",
    "particle",
    "physics-2d-box2d",
    "physics-ammo",
    "spine",
    "terrain",
    "video",
    "webview",
  ];
  for (const moduleName of requiredEngineModules) {
    assert.equal(
      includedEngineModules.includes(moduleName),
      true,
      `发布所需引擎模块未启用：${moduleName}`,
    );
  }
  for (const moduleName of forbiddenEngineModules) {
    assert.equal(
      includedEngineModules.includes(moduleName),
      false,
      `纯 2D 拼图不应携带未使用引擎模块：${moduleName}`,
    );
  }

  const sceneNames = Object.values(PuzzleSceneName);
  assert.equal(
    new Set(sceneNames).size,
    sceneNames.length,
    "正式场景名称必须唯一。",
  );
  for (const sceneName of sceneNames) {
    const scenePath = `assets/scene/${sceneName}.scene`;
    assertProjectFile(scenePath, `正式场景 ${sceneName}`);
    const sceneSource = fs.readFileSync(
      path.join(projectRoot, scenePath),
      "utf8",
    );
    assert.equal(
      sceneSource.includes('"__type__": "cc.DirectionalLight"'),
      false,
      `${sceneName}.scene 不应保留纯 2D 游戏未使用的 DirectionalLight。`,
    );
    assert.equal(
      sceneSource.includes('"__type__": "cc.StaticLightSettings"'),
      false,
      `${sceneName}.scene 不应保留纯 2D 游戏未使用的 StaticLightSettings。`,
    );
    assert.equal(
      sceneSource.includes('"_name": "Main Camera"'),
      false,
      `${sceneName}.scene 不应保留 3D 模板遗留的 Main Camera。`,
    );
  }

  const uiNames = Object.values(PuzzleUIName);
  assert.equal(
    new Set(uiNames).size,
    uiNames.length,
    "UI 注册名称必须唯一。",
  );
  const uiConfigs = Object.values(PuzzleUIConfig);
  assert.equal(
    new Set(uiConfigs.map((config) => config.name)).size,
    uiConfigs.length,
    "UI 配置不得重复注册同名面板。",
  );
  for (const config of uiConfigs) {
    assert.equal(
      uiNames.includes(config.name),
      true,
      `UI 配置名称未登记：${config.name}`,
    );
    assertProjectFile(
      `assets/resources/${config.path}.prefab`,
      `UI Prefab ${config.name}`,
    );
  }

  assert.equal(
    PuzzleStorageKey.Progress.startsWith("puzzle."),
    true,
    "当前进度键必须包含 puzzle 业务命名空间。",
  );
  assert.notEqual(
    PuzzleStorageKey.Progress,
    PuzzleStorageKey.LegacyProgress,
    "新旧进度键必须可区分，才能执行一次性迁移。",
  );

  const sceneSources = [
    "assets/app/scenes/BootScene.ts",
    "assets/app/scenes/LobbyScene.ts",
    "assets/app/scenes/GameScene.ts",
  ].map((relativePath) =>
    fs.readFileSync(path.join(projectRoot, relativePath), "utf8"),
  );
  assert.match(
    sceneSources[0],
    /ResolutionPolicy\.SHOW_ALL/,
    "BootScene 必须覆盖 Creator Web 构建器写入的 FIXED_WIDTH 初始策略。",
  );
  assert.match(
    sceneSources[0],
    /view\.setDesignResolutionSize/,
    "BootScene 必须在业务 UI 打开前应用运行时分辨率策略。",
  );
  const centralizedRuntimeValues = [
    ...sceneNames,
    ...uiNames,
    ...uiConfigs.map((config) => config.path),
  ];
  for (const source of sceneSources) {
    for (const value of centralizedRuntimeValues) {
      assert.equal(
        source.includes(`"${value}"`),
        false,
        `场景入口不得绕过 PuzzleGameKey 使用匿名运行时字符串：${value}`,
      );
    }
  }

  const webTemplate = fs.readFileSync(
    path.join(projectRoot, "build-templates/web-mobile/index.ejs"),
    "utf8",
  );
  assert.match(webTemplate, /<title>光影拼图<\/title>/);
  assert.match(webTemplate, /name="viewport"/);
  assertProjectFile("docs/PROJECT_READINESS.md", "项目就绪记录");
  assertProjectFile(
    "tools/cocos-modules/playable-foundation/module-contract.json",
    "可玩化基础模块契约",
  );

  console.log(
    `项目就绪检查通过：${sceneNames.length} 个场景、` +
      `${uiConfigs.length} 个 UI、${includedEngineModules.length} 个引擎模块。`,
  );
} finally {
  compiledApp.cleanup();
}
