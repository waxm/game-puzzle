#!/usr/bin/env node

import { loadWorkflowConfig, runCommand } from "./lib.mjs";

/** 为当前克隆启用仓库内中文提交钩子。 */
function main() {
  loadWorkflowConfig();
  runCommand("git", ["rev-parse", "--show-toplevel"]);
  runCommand("git", ["config", "core.hooksPath", ".githooks"]);
  console.log("已启用项目内 Git 钩子；提交主题必须包含中文。");
}

main();
