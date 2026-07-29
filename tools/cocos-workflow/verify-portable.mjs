#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  listTrackedFiles,
  loadWorkflowConfig,
  projectRoot,
} from "./lib.mjs";

/** 不应作为文本扫描的二进制后缀。 */
const binaryExtensions = new Set([
  ".aac",
  ".bin",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".pdf",
  ".png",
  ".ttf",
  ".wav",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

/** 会把工作流绑定到某台电脑的绝对用户目录。 */
const machinePathPatterns = [
  {
    label: "macOS 用户绝对路径",
    pattern: /\/Users\/[A-Za-z0-9._-]+\//,
  },
  {
    label: "Linux 用户绝对路径",
    pattern: /(?:^|[\s"'(=])\/home\/[A-Za-z0-9._-]+\//m,
  },
  {
    label: "Windows 用户绝对路径",
    pattern: /[A-Za-z]:\\Users\\[^\\\r\n]+\\/i,
  },
];

/** 判断文件是否适合执行可移植性文本扫描。 */
function shouldScanText(relativePath, filePath) {
  if (binaryExtensions.has(path.extname(relativePath).toLowerCase())) {
    return false;
  }
  return fs.statSync(filePath).size <= 2 * 1024 * 1024;
}

/** 运行仓库可移植性检查。 */
function main() {
  loadWorkflowConfig();
  const trackedFiles = listTrackedFiles();
  const issues = [];

  if (trackedFiles.includes(".cocos-workflow.local.json")) {
    issues.push(".cocos-workflow.local.json 是机器配置，不得提交。");
  }

  for (const relativePath of trackedFiles) {
    const filePath = path.join(projectRoot, relativePath);
    if (
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile() ||
      !shouldScanText(relativePath, filePath)
    ) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const rule of machinePathPatterns) {
      if (rule.pattern.test(content)) {
        issues.push(`${relativePath} 包含${rule.label}。`);
      }
    }
  }

  for (const requiredPath of [
    ".cocos-workflow.json",
    ".githooks/commit-msg",
    "extensions/cocos-workflow-bridge/package.json",
    "extensions/cocos-workflow-bridge/main.js",
    "extensions/cocos-workflow-bridge/scene.js",
  ]) {
    if (!trackedFiles.includes(requiredPath)) {
      issues.push(`缺少可移植工作流文件：${requiredPath}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `工作流可移植性检查失败：\n${issues.join("\n")}`,
    );
  }
  console.log(
    `工作流可移植性检查通过：${trackedFiles.length} 个仓库文件，无机器绝对路径。`,
  );
}

main();
