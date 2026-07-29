#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { cocosAssetManifest } from "../cocos-asset-manifest.mjs";
import {
  loadWorkflowConfig,
  projectRoot,
  readJson,
  resolveProjectPath,
} from "./lib.mjs";

/** 从正式资源清单解析全部 Scene 和 Prefab，避免业务模块深层目录漏检。 */
function collectManifestAssetPaths(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Cocos 资源校验清单不能为空。");
  }

  const registeredPaths = new Set();
  const assetPaths = [];
  for (const assetConfig of manifest) {
    const { assetPath, kind } = assetConfig ?? {};
    if (kind !== "scene" && kind !== "prefab") {
      throw new Error(
        `${assetPath ?? "<未填写路径>"} 的资源类型必须是 scene 或 prefab。`,
      );
    }
    if (
      typeof assetPath !== "string" ||
      !assetPath.startsWith("assets/") ||
      !assetPath.endsWith(`.${kind}`) ||
      assetPath.includes("\\")
    ) {
      throw new Error(
        `正式 ${kind} 必须使用 assets 下规范的项目相对路径：${assetPath}`,
      );
    }
    if (registeredPaths.has(assetPath)) {
      throw new Error(`Cocos 资源清单重复登记了 ${assetPath}。`);
    }
    registeredPaths.add(assetPath);

    const resolvedPath = resolveProjectPath(assetPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      throw new Error(`正式 Cocos 资源不存在：${assetPath}`);
    }
    assetPaths.push(resolvedPath);
  }
  return assetPaths.sort();
}

/** 返回节点已经挂载的序列化组件类型。 */
function getNodeComponentTypes(objects, node) {
  return (node._components ?? [])
    .map((reference) => objects[reference?.__id__]?.__type__)
    .filter((type) => typeof type === "string");
}

/** 校验单个节点的组件依赖、唯一性和互斥关系。 */
function validateNode(assetPath, node, componentTypes, rules) {
  const issues = [];
  const componentTypeSet = new Set(componentTypes);

  for (const singletonType of rules.singletons ?? []) {
    const count = componentTypes.filter(
      (type) => type === singletonType,
    ).length;
    if (count > 1) {
      issues.push(`${singletonType} 重复挂载 ${count} 次`);
    }
  }

  for (const group of rules.exclusiveGroups ?? []) {
    const matchedTypes = componentTypes.filter((type) =>
      group.types.includes(type),
    );
    if (matchedTypes.length > group.max) {
      issues.push(
        `${group.description} 当前为 ${matchedTypes.join("、")}`,
      );
    }
  }

  for (const [componentType, requiredTypes] of Object.entries(
    rules.requirements ?? {},
  )) {
    if (!componentTypeSet.has(componentType)) {
      continue;
    }
    for (const requiredType of requiredTypes) {
      if (!componentTypeSet.has(requiredType)) {
        issues.push(`${componentType} 缺少依赖 ${requiredType}`);
      }
    }
  }

  for (const [leftType, rightType] of rules.forbiddenPairs ?? []) {
    if (
      componentTypeSet.has(leftType) &&
      componentTypeSet.has(rightType)
    ) {
      issues.push(`${leftType} 与 ${rightType} 不能挂在同一节点`);
    }
  }

  return issues.map(
    (message) => `${assetPath} / ${node._name || "<未命名节点>"}：${message}`,
  );
}

/** 校验一个序列化资源。 */
function validateAsset(assetFilePath, rules) {
  const relativeAssetPath = path
    .relative(projectRoot, assetFilePath)
    .split(path.sep)
    .join("/");
  let objects;
  try {
    objects = readJson(assetFilePath);
  } catch (error) {
    throw new Error(
      `${relativeAssetPath} 不是有效 JSON：${error.message}`,
    );
  }
  if (!Array.isArray(objects)) {
    throw new Error(`${relativeAssetPath} 的序列化根必须是数组。`);
  }

  const issues = [];
  for (const object of objects) {
    if (object?.__type__ !== "cc.Node") {
      continue;
    }
    issues.push(
      ...validateNode(
        relativeAssetPath,
        object,
        getNodeComponentTypes(objects, object),
        rules,
      ),
    );
  }
  return issues;
}

/** 运行项目级组件兼容性检查。 */
function main() {
  const config = loadWorkflowConfig();
  const rules = readJson(resolveProjectPath(config.componentRules));
  if (
    rules.schemaVersion !== 1 ||
    rules.creatorVersion !== config.creator.version
  ) {
    throw new Error(
      `组件规则版本与 Creator ${config.creator.version} 不匹配。`,
    );
  }

  const assetPaths = collectManifestAssetPaths(cocosAssetManifest);
  const issues = assetPaths.flatMap((assetPath) =>
    validateAsset(assetPath, rules),
  );
  if (issues.length > 0) {
    throw new Error(
      `发现 ${issues.length} 个组件挂载问题：\n${issues.join("\n")}`,
    );
  }
  console.log(
    `组件兼容性检查通过：Creator ${rules.creatorVersion}，${assetPaths.length} 个正式资源。`,
  );
}

main();
