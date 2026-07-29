#!/usr/bin/env node

import fs from "node:fs";

import { containsChinese } from "./lib.mjs";

/** 校验 Git 提交主题必须包含中文。 */
function main() {
  const messagePath = process.argv[2];
  if (!messagePath || !fs.existsSync(messagePath)) {
    throw new Error("缺少 Git commit-msg 文件。");
  }
  const subject = fs
    .readFileSync(messagePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (!subject || !containsChinese(subject)) {
    console.error(
      "提交失败：Git 提交主题必须使用中文记录，例如“接入可移植的 Cocos 开发工作流”。",
    );
    process.exitCode = 1;
  }
}

main();
