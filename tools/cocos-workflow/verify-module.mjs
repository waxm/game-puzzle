#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  loadWorkflowConfig,
  projectRoot,
  readJson,
  runPackageScript,
} from "./lib.mjs";

/** 发布或构建脚本不得混入开发阶段模块验收。 */
const buildScriptPattern = /(?:^|:)(?:build|publish|deploy|release)(?::|$)/i;

/** 按模块配置执行局部验收。 */
function main() {
  const moduleId = process.argv[2];
  if (!moduleId || moduleId.startsWith("-")) {
    throw new Error("用法：npm run verify:module -- <module-id> [--dry-run]");
  }
  const config = loadWorkflowConfig();
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const scripts = config.modules?.[moduleId];
  if (!Array.isArray(scripts) || scripts.length === 0) {
    throw new Error(
      `未在 .cocos-workflow.json 登记模块验收：${moduleId}`,
    );
  }
  for (const scriptName of scripts) {
    if (!packageJson.scripts?.[scriptName]) {
      throw new Error(`${moduleId} 引用了不存在的脚本：${scriptName}`);
    }
    if (buildScriptPattern.test(scriptName)) {
      throw new Error(
        `开发阶段模块验收禁止执行构建或发布脚本：${scriptName}`,
      );
    }
  }
  console.log(`${moduleId} 局部验收：${scripts.join(" -> ")}`);
  if (process.argv.includes("--dry-run")) {
    return;
  }
  for (const scriptName of scripts) {
    runPackageScript(scriptName);
  }
}

main();
