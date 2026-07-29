#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  loadWorkflowConfig,
  projectRoot,
  readJson,
} from "./lib.mjs";

/** 校验 Creator 桥接扩展和工作流脚本契约。 */
function main() {
  const config = loadWorkflowConfig();
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const extensionPackage = readJson(
    path.join(
      projectRoot,
      "extensions/cocos-workflow-bridge/package.json",
    ),
  );
  if (extensionPackage.editor !== `>=${config.creator.version}`) {
    throw new Error("Creator 桥接扩展版本范围与工作流配置不一致。");
  }
  for (const scriptName of [
    "workflow:setup",
    "workflow:doctor",
    "workflow:log:mark",
    "workflow:log:read",
    "workflow:preview",
    "workflow:verify",
    "validate:components",
    "verify:changed",
    "verify:module",
  ]) {
    if (!packageJson.scripts?.[scriptName]) {
      throw new Error(`package.json 缺少工作流脚本：${scriptName}`);
    }
  }
  const hookSource = fs.readFileSync(
    path.join(projectRoot, ".githooks/commit-msg"),
    "utf8",
  );
  if (!hookSource.includes("verify-commit-message.mjs")) {
    throw new Error("Git commit-msg 没有接入中文提交校验。");
  }
  if (packageJson.name !== "cocos-game-framework") {
    const baselinePath = path.join(
      projectRoot,
      "COCOS_WORKFLOW_BASELINE.json",
    );
    if (!fs.existsSync(baselinePath)) {
      throw new Error("游戏仓库缺少 COCOS_WORKFLOW_BASELINE.json。");
    }
    const baseline = readJson(baselinePath);
    if (
      baseline.workflowVersion !== config.workflowVersion ||
      baseline.creatorVersion !== config.creator.version
    ) {
      throw new Error("工作流来源记录与当前配置版本不一致。");
    }
  }
  console.log(
    `工作流契约检查通过：版本 ${config.workflowVersion}，Creator ${config.creator.version}。`,
  );
}

main();
