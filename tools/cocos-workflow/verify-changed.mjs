#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  projectRoot,
  readJson,
  runCommand,
  runPackageScript,
} from "./lib.mjs";

/** 返回当前提交边界内修改和新增的文件。 */
function collectChangedFiles() {
  const hasHead =
    runCommand("git", ["rev-parse", "--verify", "HEAD"], {
      allowFailure: true,
    }).status === 0;
  const changed = hasHead
    ? runCommand("git", [
        "diff",
        "--name-only",
        "--diff-filter=ACMR",
        "HEAD",
      ]).stdout.split("\n")
    : runCommand("git", ["ls-files"]).stdout.split("\n");
  const untracked = runCommand("git", [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]).stdout.split("\n");
  return [...new Set([...changed, ...untracked].filter(Boolean))];
}

/** 根据文件职责选取最快且足够的本地检查。 */
function selectScripts(changedFiles, availableScripts) {
  const selectedScripts = [];
  const addScript = (scriptName) => {
    if (
      availableScripts[scriptName] &&
      !selectedScripts.includes(scriptName)
    ) {
      selectedScripts.push(scriptName);
    }
  };
  const hasMatch = (pattern) =>
    changedFiles.some((relativePath) => pattern.test(relativePath));

  if (hasMatch(/\.ts$/)) {
    addScript("typecheck");
  }
  if (hasMatch(/^assets\/app\/core\//)) {
    addScript("verify:core");
  }
  if (hasMatch(/^assets\/app\/game\//)) {
    addScript("verify:game");
  }
  if (
    hasMatch(
      /\.(?:scene|prefab|meta)$/i,
    ) ||
    hasMatch(/^tools\/cocos-asset-manifest\.mjs$/)
  ) {
    addScript("validate:components");
    addScript("validate:cocos");
  }
  if (
    hasMatch(
      /^(?:\.cocos-workflow\.json|\.githooks\/|extensions\/cocos-workflow-bridge\/|tools\/cocos-workflow\/)/,
    ) ||
    hasMatch(/^(?:AGENTS\.md|GAME_AGENTS_TEMPLATE\.md|package\.json)$/)
  ) {
    addScript("workflow:verify");
  }
  return selectedScripts;
}

/** 执行修改范围对应的开发阶段快速验证。 */
function main() {
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const changedFiles = collectChangedFiles();
  if (changedFiles.length === 0) {
    console.log("当前没有待验证的修改。");
    return;
  }
  const scripts = selectScripts(changedFiles, packageJson.scripts ?? {});
  console.log(
    `修改范围：${changedFiles.length} 个文件；快速验证：${scripts.join(" -> ") || "无需自动检查"}`,
  );
  if (process.argv.includes("--dry-run")) {
    return;
  }
  for (const scriptName of scripts) {
    runPackageScript(scriptName);
  }
}

main();
