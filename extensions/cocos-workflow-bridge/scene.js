"use strict";

const { director, js } = require("cc");

/** 返回组件稳定的 ccclass 名称。 */
function getComponentType(component) {
  return js.getClassName(component) || component?.constructor?.name || "";
}

/** 校验一个节点的组件挂载规则。 */
function validateNode(node, rules) {
  const componentTypes = (node.components ?? [])
    .map(getComponentType)
    .filter(Boolean);
  const componentTypeSet = new Set(componentTypes);
  const issues = [];

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
    (message) => `${node.getPathInHierarchy()}：${message}`,
  );
}

/** 递归校验当前活动场景。 */
function validateActiveScene(rules) {
  const scene = director.getScene();
  if (!scene) {
    return {
      sceneName: "",
      nodeCount: 0,
      issues: [],
      unavailable: true,
    };
  }
  const issues = [];
  let nodeCount = 0;
  const visit = (node) => {
    nodeCount += 1;
    issues.push(...validateNode(node, rules));
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(scene);
  return {
    sceneName: scene.name,
    nodeCount,
    issues,
  };
}

exports.load = function load() {};
exports.unload = function unload() {};
exports.methods = {
  validateActiveScene,
};
