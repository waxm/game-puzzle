#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { cocosAssetManifest } from "./cocos-asset-manifest.mjs";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 需要纳入清单覆盖检查的正式 Scene 目录。 */
const sceneRoot = path.join(projectRoot, "assets/scene");

/** 需要纳入清单覆盖检查的正式 resources 目录，业务 Prefab 可以按模块分层。 */
const prefabRoot = path.join(projectRoot, "assets/resources");

/** Creator 编辑器编译脚本所在目录，用于核对实际类 ID。 */
const creatorChunkRoot = path.join(
  projectRoot,
  "temp/programming/packer-driver/targets/editor/chunks",
);

/** Cocos 压缩 UUID 使用的 Base64 字符表。 */
const compressedUuidAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 项目资源 UUID 的格式。 */
const standardUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 项目资源或其子资源 UUID 的格式。 */
const serializedUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[A-Za-z0-9]+)?$/i;

/** Creator 内置资源不位于项目 assets 目录，必须显式登记后才能通过校验。 */
const internalAssetUuids = new Set([
  "d032ac98-05e1-4090-88bb-eb640dcb5fc1@b47c0",
  "6f01cf7f-81bf-4a7e-bd5d-0afc19696480@b47c0",
]);

/** EditBox 宿主节点不能共存的 UI 渲染组件。 */
const editBoxConflictingRendererTypes = new Set([
  "cc.Graphics",
  "cc.Label",
  "cc.Mask",
  "cc.ParticleSystem2D",
  "cc.RichText",
  "cc.TiledMap",
  "cc.UIMeshRenderer",
]);

/** 当前校验器支持的资源专项检查。 */
const supportedChecks = new Set(["noCanvasAudio", "gamePanelHierarchy"]);

/** 扫描并验证项目正式使用的 Cocos 序列化资源。 */
function main() {
  const manifest = validateManifest(cocosAssetManifest);
  validateManifestCoverage(manifest);

  const localUuidIndex = buildLocalUuidIndex();
  const compiledScriptRegistry = buildCompiledScriptRegistry();
  const scriptInfoCache = new Map();
  let scriptCount = 0;
  let bindingCount = 0;

  for (const assetConfig of manifest) {
    const result = validateSerializedAsset(
      assetConfig,
      localUuidIndex,
      compiledScriptRegistry,
      scriptInfoCache,
    );
    scriptCount += result.scriptCount;
    bindingCount += result.bindingCount;
  }

  console.log(
    `已按清单校验 ${manifest.length} 个正式 Cocos 资源、${scriptCount} 个脚本类型和 ${bindingCount} 个必填绑定。`,
  );
}

/** 校验清单结构，并返回按资源路径排序后的副本。 */
function validateManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Cocos 资源校验清单不能为空。");
  }

  const assetPaths = new Set();
  const scriptSources = new Map();
  for (const assetConfig of manifest) {
    const { assetPath, kind, scripts, checks = [] } = assetConfig ?? {};
    validateProjectRelativePath(assetPath, "清单资源路径");
    if (kind !== "scene" && kind !== "prefab") {
      throw new Error(`${assetPath} 的资源类型必须是 scene 或 prefab。`);
    }
    if (!assetPath.endsWith(`.${kind}`)) {
      throw new Error(`${assetPath} 的后缀与清单类型 ${kind} 不一致。`);
    }
    if (assetPaths.has(assetPath)) {
      throw new Error(`Cocos 资源清单重复登记了 ${assetPath}。`);
    }
    assetPaths.add(assetPath);

    if (!Array.isArray(scripts) || scripts.length === 0) {
      throw new Error(`${assetPath} 至少需要登记一个业务脚本。`);
    }
    const assetScriptClasses = new Set();
    for (const scriptConfig of scripts) {
      validateScriptConfig(assetPath, scriptConfig);
      if (assetScriptClasses.has(scriptConfig.className)) {
        throw new Error(
          `${assetPath} 重复登记了业务脚本 ${scriptConfig.className}。`,
        );
      }
      assetScriptClasses.add(scriptConfig.className);

      const registeredSource = scriptSources.get(scriptConfig.className);
      if (registeredSource && registeredSource !== scriptConfig.sourcePath) {
        throw new Error(
          `业务脚本 ${scriptConfig.className} 同时指向 ${registeredSource} 和 ${scriptConfig.sourcePath}。`,
        );
      }
      scriptSources.set(scriptConfig.className, scriptConfig.sourcePath);
    }

    if (!Array.isArray(checks)) {
      throw new Error(`${assetPath} 的 checks 必须是数组。`);
    }
    for (const checkName of checks) {
      if (!supportedChecks.has(checkName)) {
        throw new Error(`${assetPath} 使用了未知专项检查 ${checkName}。`);
      }
    }
  }

  return [...manifest].sort((left, right) =>
    left.assetPath.localeCompare(right.assetPath),
  );
}

/** 校验单个业务脚本的清单配置。 */
function validateScriptConfig(assetPath, scriptConfig) {
  const {
    className,
    sourcePath,
    hostNodeName,
    objectBindings = {},
    assetBindings = {},
  } = scriptConfig ?? {};
  if (typeof className !== "string" || className.length === 0) {
    throw new Error(`${assetPath} 存在未填写 className 的脚本配置。`);
  }
  validateProjectRelativePath(sourcePath, `${className} 源码路径`);
  if (!sourcePath.endsWith(".ts")) {
    throw new Error(`${className} 的源码路径必须指向 TypeScript 文件。`);
  }
  if (typeof hostNodeName !== "string" || hostNodeName.length === 0) {
    throw new Error(`${className} 必须登记脚本宿主节点名称。`);
  }

  validateBindingMap(assetPath, className, objectBindings, false);
  validateBindingMap(assetPath, className, assetBindings, true);
}

/** 校验 Inspector 绑定清单的字段结构。 */
function validateBindingMap(assetPath, className, bindings, isAssetBinding) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new Error(`${assetPath} 的 ${className} 绑定配置必须是对象。`);
  }

  for (const [field, binding] of Object.entries(bindings)) {
    if (!field || !binding || typeof binding !== "object") {
      throw new Error(`${assetPath} 的 ${className}.${field} 绑定配置无效。`);
    }
    if (isAssetBinding) {
      if (typeof binding.type !== "string" || binding.type.length === 0) {
        throw new Error(`${assetPath} 的 ${className}.${field} 缺少资源类型。`);
      }
      validateProjectRelativePath(
        binding.assetMetaPath,
        `${className}.${field} 资源 Meta 路径`,
      );
      if (!binding.assetMetaPath.endsWith(".meta")) {
        throw new Error(`${className}.${field} 必须指向资源的 .meta 文件。`);
      }
    } else {
      const hasEngineType =
        typeof binding.type === "string" && binding.type.length > 0;
      const hasScriptType =
        typeof binding.scriptClassName === "string" &&
        binding.scriptClassName.length > 0 &&
        typeof binding.scriptSourcePath === "string";
      if (!hasEngineType && !hasScriptType) {
        throw new Error(`${assetPath} 的 ${className}.${field} 缺少组件类型。`);
      }
      if (hasScriptType) {
        validateProjectRelativePath(
          binding.scriptSourcePath,
          `${className}.${field} 脚本组件源码路径`,
        );
        if (!binding.scriptSourcePath.endsWith(".ts")) {
          throw new Error(`${className}.${field} 的脚本组件必须指向 TypeScript。`);
        }
      }
      if (
        typeof binding.nodeName !== "string" ||
        binding.nodeName.length === 0
      ) {
        throw new Error(`${className}.${field} 必须登记目标节点名称。`);
      }
    }
  }
}

/** 防止清单路径逃逸项目目录，也避免同一路径出现多种写法。 */
function validateProjectRelativePath(relativePath, description) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`${description}不能为空。`);
  }
  const normalizedPath = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (
    path.isAbsolute(relativePath) ||
    normalizedPath !== relativePath ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../")
  ) {
    throw new Error(`${description}必须是规范的项目相对路径：${relativePath}`);
  }
}

/** 确保正式资源目录与清单完全一致，禁止遗漏校验或登记不存在的资源。 */
function validateManifestCoverage(manifest) {
  const actualPaths = [
    ...collectFiles(sceneRoot, ".scene"),
    ...collectFiles(prefabRoot, ".prefab"),
  ].map(toProjectPath);
  const manifestPaths = manifest.map((item) => item.assetPath);
  const actualSet = new Set(actualPaths);
  const manifestSet = new Set(manifestPaths);
  const unregistered = actualPaths.filter((item) => !manifestSet.has(item));
  const missing = manifestPaths.filter((item) => !actualSet.has(item));

  if (unregistered.length > 0 || missing.length > 0) {
    const details = [];
    if (unregistered.length > 0) {
      details.push(`未登记：${unregistered.join("、")}`);
    }
    if (missing.length > 0) {
      details.push(`文件不存在：${missing.join("、")}`);
    }
    throw new Error(`正式 Cocos 资源与校验清单不一致；${details.join("；")}`);
  }
}

/** 递归收集指定后缀的文件。 */
function collectFiles(root, extension) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

/** 将绝对路径转换为使用正斜杠的项目相对路径。 */
function toProjectPath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

/** 建立 assets 内全部主资源和子资源的 UUID 索引。 */
function buildLocalUuidIndex() {
  const uuidIndex = new Map();
  const metaFiles = collectFiles(path.join(projectRoot, "assets"), ".meta");
  for (const metaFile of metaFiles) {
    const relativePath = toProjectPath(metaFile);
    const meta = readJson(metaFile, relativePath);
    visitObject(meta, (value, key) => {
      if (key !== "uuid") {
        return;
      }
      if (typeof value !== "string" || !serializedUuidPattern.test(value)) {
        throw new Error(`${relativePath} 包含格式无效的 UUID：${String(value)}`);
      }
      const registeredPath = uuidIndex.get(value);
      if (registeredPath && registeredPath !== relativePath) {
        throw new Error(
          `资源 UUID ${value} 同时出现在 ${registeredPath} 和 ${relativePath}。`,
        );
      }
      uuidIndex.set(value, relativePath);
    });
  }
  return uuidIndex;
}

/** 扫描 Creator 实际编译结果，建立 ccclass 到脚本类 ID 的对应关系。 */
function buildCompiledScriptRegistry() {
  if (!fs.existsSync(creatorChunkRoot)) {
    throw new Error(
      "缺少 Creator 编辑器编译目录，请先用 Cocos Creator 3.8.4 打开项目并完成脚本导入。",
    );
  }

  const registry = new Map();
  const pushPattern =
    /_RF\.push\(\{\},\s*["']([^"']+)["'],\s*["']([^"']+)["']/g;
  for (const chunkFile of collectFiles(creatorChunkRoot, ".js")) {
    const content = fs.readFileSync(chunkFile, "utf8");
    for (const match of content.matchAll(pushPattern)) {
      const [, typeId, className] = match;
      const typeIds = registry.get(className) ?? new Set();
      typeIds.add(typeId);
      registry.set(className, typeIds);
    }
  }
  return registry;
}

/** 校验单个 Scene 或 Prefab 的结构、脚本、资源引用与必填绑定。 */
function validateSerializedAsset(
  assetConfig,
  localUuidIndex,
  compiledScriptRegistry,
  scriptInfoCache,
) {
  const { assetPath, kind, scripts, checks = [] } = assetConfig;
  const filePath = path.join(projectRoot, assetPath);
  const objects = readJson(filePath, assetPath);
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new Error(`${assetPath} 不是有效的 Cocos 序列化对象数组。`);
  }

  validateAssetMeta(assetPath, kind, localUuidIndex);
  validateReferenceRange(objects, assetPath);
  validateNodeRelations(objects, assetPath);
  validateEditBoxRendererCompatibility(objects, assetPath);
  validateSerializedUuids(objects, assetPath, localUuidIndex);
  if (kind === "scene") {
    validateSceneGlobals(objects, assetPath);
  }

  const scriptResults = scripts.map((scriptConfig) =>
    validateSerializedScript(
      objects,
      assetPath,
      scriptConfig,
      compiledScriptRegistry,
      scriptInfoCache,
    ),
  );
  validateCustomScriptCoverage(objects, assetPath, scriptResults);

  for (const checkName of checks) {
    if (checkName === "noCanvasAudio") {
      validateNoCanvasAudio(objects, assetPath, scriptResults);
    } else if (checkName === "gamePanelHierarchy") {
      validateGamePanelHierarchy(objects, assetPath);
    }
  }

  return {
    scriptCount: scriptResults.length,
    bindingCount: scriptResults.reduce(
      (total, result) => total + result.bindingCount,
      0,
    ),
  };
}

/**
 * 校验 EditBox 宿主节点没有占用 Sprite 所需的 UI 渲染组件槽位。
 *
 * Creator 会在 EditBox 启用时自动补 Sprite；Graphics 等渲染组件若与其同节点，
 * Prefab 静态结构仍可能合法，但编辑器真正打开资源时会激活失败。
 */
function validateEditBoxRendererCompatibility(objects, assetPath) {
  for (const node of objects) {
    if (node?.__type__ !== "cc.Node") {
      continue;
    }
    const componentTypes = (node._components ?? []).map(
      (reference) => objects[reference.__id__]?.__type__,
    );
    if (!componentTypes.includes("cc.EditBox")) {
      continue;
    }
    const conflictingType = componentTypes.find((type) =>
      editBoxConflictingRendererTypes.has(type),
    );
    if (conflictingType) {
      throw new Error(
        `${assetPath} 的 ${node._name} 不能同时挂载 cc.EditBox 和 ${conflictingType}。`,
      );
    }
  }
}

/**
 * 校验 SceneGlobals 的八个依赖类型。
 *
 * 仅校验 __id__ 范围无法发现全局引用误指向业务节点的问题；这里显式检查类型，
 * 防止场景能通过静态引用检查却在激活 skybox 时崩溃。
 */
function validateSceneGlobals(objects, assetPath) {
  const sceneGlobalsEntries = objects
    .map((object, objectId) => ({ object, objectId }))
    .filter(({ object }) => object?.__type__ === "cc.SceneGlobals");
  if (sceneGlobalsEntries.length !== 1) {
    throw new Error(
      `${assetPath} 必须有且只有一个 cc.SceneGlobals，当前数量为 ${sceneGlobalsEntries.length}。`,
    );
  }

  const [{ object: sceneGlobals, objectId: sceneGlobalsId }] =
    sceneGlobalsEntries;
  const expectedBindings = {
    ambient: "cc.AmbientInfo",
    shadows: "cc.ShadowsInfo",
    _skybox: "cc.SkyboxInfo",
    fog: "cc.FogInfo",
    octree: "cc.OctreeInfo",
    skin: "cc.SkinInfo",
    lightProbeInfo: "cc.LightProbeInfo",
    postSettings: "cc.PostSettingsInfo",
  };
  for (const [field, expectedType] of Object.entries(expectedBindings)) {
    const target = objects[sceneGlobals[field]?.__id__];
    if (target?.__type__ !== expectedType) {
      throw new Error(
        `${assetPath} 的 SceneGlobals.${field} 未绑定到 ${expectedType}。`,
      );
    }
  }

  const scenes = objects.filter((object) => object?.__type__ === "cc.Scene");
  if (
    scenes.length !== 1 ||
    scenes[0]._globals?.__id__ !== sceneGlobalsId
  ) {
    throw new Error(`${assetPath} 的 cc.Scene 没有绑定唯一 SceneGlobals。`);
  }
}

/** 校验 Scene/Prefab 自身的 Meta 状态和主资源 UUID。 */
function validateAssetMeta(assetPath, kind, localUuidIndex) {
  const metaPath = `${assetPath}.meta`;
  const meta = readJson(path.join(projectRoot, metaPath), metaPath);
  if (meta.importer !== kind) {
    throw new Error(`${metaPath} 的 importer 应为 ${kind}。`);
  }
  if (meta.imported !== true) {
    throw new Error(`${metaPath} 尚未被 Creator 成功导入。`);
  }
  if (!standardUuidPattern.test(meta.uuid)) {
    throw new Error(`${metaPath} 的主资源 UUID 格式无效。`);
  }
  if (localUuidIndex.get(meta.uuid) !== metaPath) {
    throw new Error(`${metaPath} 的主资源 UUID 没有正确登记到本地索引。`);
  }
}

/** 校验业务脚本 Meta、Creator 编译类型、挂载节点和全部 Inspector 绑定。 */
function validateSerializedScript(
  objects,
  assetPath,
  scriptConfig,
  compiledScriptRegistry,
  scriptInfoCache,
) {
  const scriptInfo = resolveScriptInfo(
    scriptConfig,
    compiledScriptRegistry,
    scriptInfoCache,
  );
  const matches = objects
    .map((object, objectId) => ({ object, objectId }))
    .filter(({ object }) => object?.__type__ === scriptInfo.typeId);
  if (matches.length !== 1) {
    throw new Error(
      `${assetPath} 必须有且只有一个 ${scriptConfig.className} 脚本，当前数量为 ${matches.length}。`,
    );
  }

  const [{ object: script, objectId: scriptId }] = matches;
  const hostNode = objects[script.node?.__id__];
  if (
    hostNode?.__type__ !== "cc.Node" ||
    hostNode._name !== scriptConfig.hostNodeName
  ) {
    throw new Error(
      `${assetPath} 的 ${scriptConfig.className} 没有挂载到 ${scriptConfig.hostNodeName} 节点。`,
    );
  }

  let bindingCount = 0;
  for (const [field, binding] of Object.entries(
    scriptConfig.objectBindings ?? {},
  )) {
    validateObjectBinding(
      objects,
      assetPath,
      scriptConfig,
      script,
      field,
      binding,
      compiledScriptRegistry,
      scriptInfoCache,
    );
    bindingCount += 1;
  }
  for (const [field, binding] of Object.entries(
    scriptConfig.assetBindings ?? {},
  )) {
    validateAssetBinding(assetPath, scriptConfig, script, field, binding);
    bindingCount += 1;
  }

  return {
    className: scriptConfig.className,
    typeId: scriptInfo.typeId,
    script,
    scriptId,
    bindingCount,
  };
}

/** 从脚本 Meta 推导类 ID，并与 Creator 实际编译结果交叉校验。 */
function resolveScriptInfo(scriptConfig, compiledScriptRegistry, cache) {
  const cacheKey = `${scriptConfig.sourcePath}:${scriptConfig.className}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sourcePath = path.join(projectRoot, scriptConfig.sourcePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${scriptConfig.className} 源码不存在：${scriptConfig.sourcePath}`);
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const ccclassPattern = new RegExp(
    `@ccclass\\(\\s*["']${escapeRegExp(scriptConfig.className)}["']\\s*\\)`,
  );
  if (!ccclassPattern.test(source)) {
    throw new Error(
      `${scriptConfig.sourcePath} 没有声明 @ccclass("${scriptConfig.className}")。`,
    );
  }

  const metaPath = `${scriptConfig.sourcePath}.meta`;
  const meta = readJson(path.join(projectRoot, metaPath), metaPath);
  if (meta.importer !== "typescript" || meta.imported !== true) {
    throw new Error(`${metaPath} 尚未作为 TypeScript 被 Creator 成功导入。`);
  }
  if (!standardUuidPattern.test(meta.uuid)) {
    throw new Error(`${metaPath} 的脚本 UUID 格式无效。`);
  }

  const typeId = compressUuid(meta.uuid);
  const compiledTypeIds = compiledScriptRegistry.get(scriptConfig.className);
  if (!compiledTypeIds || compiledTypeIds.size === 0) {
    throw new Error(
      `Creator 编译结果中找不到 ${scriptConfig.className}，请重新导入脚本。`,
    );
  }
  if (compiledTypeIds.size !== 1 || !compiledTypeIds.has(typeId)) {
    throw new Error(
      `${scriptConfig.className} 的 Meta 类 ID ${typeId} 与 Creator 编译结果 ${[
        ...compiledTypeIds,
      ].join("、")} 不一致。`,
    );
  }

  const result = { typeId };
  cache.set(cacheKey, result);
  return result;
}

/** 校验所有非 cc 内置组件都已由当前资源清单明确登记。 */
function validateCustomScriptCoverage(objects, assetPath, scriptResults) {
  const expectedTypeIds = new Set(scriptResults.map((item) => item.typeId));
  const customScripts = objects.filter(
    (object) =>
      object?.node?.__id__ !== undefined &&
      typeof object.__type__ === "string" &&
      !object.__type__.startsWith("cc."),
  );
  const unexpected = customScripts
    .map((script) => script.__type__)
    .filter((typeId) => !expectedTypeIds.has(typeId));
  if (unexpected.length > 0) {
    throw new Error(
      `${assetPath} 存在清单未登记或无法识别的脚本类型：${[
        ...new Set(unexpected),
      ].join("、")}。`,
    );
  }
  if (customScripts.length !== scriptResults.length) {
    throw new Error(`${assetPath} 的业务脚本数量与清单不一致。`);
  }
}

/** 校验绑定对象的组件类型及其所在节点，防止同类型组件绑错位置。 */
function validateObjectBinding(
  objects,
  assetPath,
  scriptConfig,
  script,
  field,
  binding,
  compiledScriptRegistry,
  scriptInfoCache,
) {
  const expectedType = binding.scriptClassName
    ? resolveScriptInfo(
        {
          className: binding.scriptClassName,
          sourcePath: binding.scriptSourcePath,
        },
        compiledScriptRegistry,
        scriptInfoCache,
      ).typeId
    : binding.type;
  const referenceId = script[field]?.__id__;
  const target = objects[referenceId];
  if (target?.__type__ !== expectedType) {
    throw new Error(
      `${assetPath} 的 ${scriptConfig.className}.${field} 未绑定到 ` +
        `${binding.scriptClassName ?? binding.type}。`,
    );
  }

  const ownerNode =
    target.__type__ === "cc.Node" ? target : objects[target.node?.__id__];
  if (ownerNode?.__type__ !== "cc.Node" || ownerNode._name !== binding.nodeName) {
    throw new Error(
      `${assetPath} 的 ${scriptConfig.className}.${field} 未绑定到 ${binding.nodeName} 节点。`,
    );
  }
}

/** 校验脚本显式引用了目标 Meta 对应的资源 UUID 和资源类型。 */
function validateAssetBinding(
  assetPath,
  scriptConfig,
  script,
  field,
  binding,
) {
  const meta = readJson(
    path.join(projectRoot, binding.assetMetaPath),
    binding.assetMetaPath,
  );
  const expectedImporter = binding.type === "cc.Prefab" ? "prefab" : undefined;
  if (
    meta.imported !== true ||
    !standardUuidPattern.test(meta.uuid) ||
    (expectedImporter && meta.importer !== expectedImporter)
  ) {
    throw new Error(
      `${binding.assetMetaPath} 不是已成功导入的 ${binding.type} 资源 Meta。`,
    );
  }
  const serializedBinding = script[field];
  if (
    serializedBinding?.__uuid__ !== meta.uuid ||
    serializedBinding?.__expectedType__ !== binding.type
  ) {
    throw new Error(
      `${assetPath} 的 ${scriptConfig.className}.${field} 没有绑定预期 ${binding.type} 资源。`,
    );
  }
}

/** 校验场景 Canvas 不再持有旧版场景级 AudioSource。 */
function validateNoCanvasAudio(objects, assetPath, scriptResults) {
  const canvasEntries = objects
    .map((object, objectId) => ({ object, objectId }))
    .filter(
      ({ object }) => object?.__type__ === "cc.Node" && object._name === "Canvas",
    );
  if (canvasEntries.length !== 1) {
    throw new Error(`${assetPath} 必须有且只有一个 Canvas 节点。`);
  }

  const [{ object: canvas }] = canvasEntries;
  const canvasHasAudio = (canvas._components ?? []).some(
    (reference) => objects[reference.__id__]?.__type__ === "cc.AudioSource",
  );
  if (canvasHasAudio) {
    throw new Error(`${assetPath} 的 Canvas 仍挂载旧版 AudioSource。`);
  }
  for (const result of scriptResults) {
    if (Object.hasOwn(result.script, "audioSource")) {
      throw new Error(
        `${assetPath} 的 ${result.className} 仍保留旧版 audioSource 绑定。`,
      );
    }
  }
}

/** 校验组合边框层和活动拼图容器位于确定的父节点下。 */
function validateGamePanelHierarchy(objects, assetPath) {
  const getUniqueNodeId = (name) => {
    const ids = objects
      .map((object, index) => ({ object, index }))
      .filter(
        ({ object }) => object.__type__ === "cc.Node" && object._name === name,
      )
      .map(({ index }) => index);
    if (ids.length !== 1) {
      throw new Error(`${assetPath} 必须有且只有一个 ${name} 节点。`);
    }
    return ids[0];
  };

  const rootId = getUniqueNodeId("UIGamePanel");
  const restingBorderId = getUniqueNodeId("RestingGroupBorderLayer");
  const activeRootId = getUniqueNodeId("ActiveGroupRoot");
  const activePieceContainerId = getUniqueNodeId("ActivePieceContainer");
  const activeBorderId = getUniqueNodeId("ActiveGroupBorderLayer");
  if (
    objects[restingBorderId]._parent?.__id__ !== rootId ||
    objects[activeRootId]._parent?.__id__ !== rootId ||
    objects[activePieceContainerId]._parent?.__id__ !== activeRootId ||
    objects[activeBorderId]._parent?.__id__ !== activeRootId
  ) {
    throw new Error(`${assetPath} 的组合边框或活动组合节点层级不正确。`);
  }
}

/** 校验所有内部 __id__ 引用都没有越界。 */
function validateReferenceRange(objects, assetPath) {
  visitObject(objects, (value, key) => {
    if (key !== "__id__") {
      return;
    }
    if (!Number.isInteger(value) || value < 0 || value >= objects.length) {
      throw new Error(`${assetPath} 存在越界引用：__id__=${String(value)}`);
    }
  });
}

/** 校验节点父子关系和组件所属节点保持双向一致。 */
function validateNodeRelations(objects, assetPath) {
  objects.forEach((object, objectId) => {
    if (object.__type__ !== "cc.Node") {
      validateComponentOwner(objects, object, objectId, assetPath);
      return;
    }

    // 除 Prefab 根节点外，每个节点登记的父对象也必须反向包含当前节点。
    if (object._parent?.__id__ !== undefined) {
      const parent = objects[object._parent.__id__];
      const parentContainsNode = (parent?._children ?? []).some(
        (childReference) => childReference.__id__ === objectId,
      );
      if (!parentContainsNode) {
        throw new Error(
          `${assetPath} 的节点 ${object._name} 没有登记在父节点 children 中。`,
        );
      }
    }

    for (const childReference of object._children ?? []) {
      const child = objects[childReference.__id__];
      if (child?.__type__ !== "cc.Node" || child._parent?.__id__ !== objectId) {
        throw new Error(`${assetPath} 的节点 ${object._name} 存在不一致的父子引用。`);
      }
    }

    for (const componentReference of object._components ?? []) {
      const component = objects[componentReference.__id__];
      if (!component || component.node?.__id__ !== objectId) {
        throw new Error(`${assetPath} 的节点 ${object._name} 存在不一致的组件引用。`);
      }
    }
  });
}

/** 校验带 node 引用的组件也登记在所属节点 components 中。 */
function validateComponentOwner(objects, component, componentId, assetPath) {
  if (component?.node?.__id__ === undefined) {
    return;
  }
  const ownerNode = objects[component.node.__id__];
  const ownerContainsComponent = (ownerNode?._components ?? []).some(
    (componentReference) => componentReference.__id__ === componentId,
  );
  if (ownerNode?.__type__ !== "cc.Node" || !ownerContainsComponent) {
    throw new Error(
      `${assetPath} 的组件 ${component.__type__} 没有登记在所属节点 components 中。`,
    );
  }
}

/** 校验序列化资源引用能解析到项目资源或已登记的 Creator 内置资源。 */
function validateSerializedUuids(objects, assetPath, localUuidIndex) {
  visitObject(objects, (value, key) => {
    if (key !== "__uuid__") {
      return;
    }
    if (typeof value !== "string" || !serializedUuidPattern.test(value)) {
      throw new Error(`${assetPath} 包含格式无效的资源 UUID：${String(value)}`);
    }
    if (!localUuidIndex.has(value) && !internalAssetUuids.has(value)) {
      throw new Error(`${assetPath} 引用了无法解析的资源 UUID：${value}`);
    }
  });
}

/** 将标准 UUID 压缩为 Creator 序列化脚本使用的 23 位类 ID。 */
function compressUuid(uuid) {
  const hex = uuid.replaceAll("-", "");
  let result = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    result += compressedUuidAlphabet[value >> 6];
    result += compressedUuidAlphabet[value & 63];
  }
  return result;
}

/** 读取 JSON，并把文件缺失或语法错误转换为包含路径的明确错误。 */
function readJson(filePath, relativePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 ${relativePath}：${message}`);
  }
}

/** 深度遍历对象中的每个属性，供引用和 Meta UUID 校验复用。 */
function visitObject(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitObject(item, visitor));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitor(child, key);
    visitObject(child, visitor);
  }
}

/** 转义动态类名，避免生成的正则表达式改变语义。 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();
