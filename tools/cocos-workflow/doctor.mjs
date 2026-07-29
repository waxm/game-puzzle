#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  loadWorkflowConfig,
  projectRoot,
  readJson,
  resolveProjectPath,
  runCommand,
} from "./lib.mjs";
import {
  discoverEditorProcess,
  discoverPreviewUrls,
  readEditorSession,
} from "./session.mjs";

/** 运行跨电脑工作流环境检查。 */
async function main() {
  const config = loadWorkflowConfig();
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const editorState = discoverEditorProcess();
  const extensionSession = readEditorSession();
  const editorPid =
    extensionSession?.pid ?? editorState.targetProcess?.pid ?? null;
  const previewUrls = editorPid
    ? await discoverPreviewUrls(editorPid)
    : [];
  const hookPath = runCommand("git", ["config", "--get", "core.hooksPath"], {
    allowFailure: true,
  }).stdout;

  const report = {
    platform: process.platform,
    project: packageJson.name,
    projectRoot,
    creatorVersion: {
      expected: config.creator.version,
      project: packageJson.creator?.version ?? null,
      matches:
        packageJson.creator?.version === config.creator.version,
    },
    launchPolicy: config.creator.launchPolicy,
    editor: {
      targetProjectOpen: Boolean(editorPid),
      pid: editorPid,
      dashboardRunning: editorState.dashboardRunning,
      otherCreatorProjects: editorState.otherCreatorProjects,
      extensionConnected: Boolean(extensionSession),
    },
    preview: {
      urls: previewUrls,
      browserReuseRequired: config.preview.reuseExistingBrowserTab,
    },
    logs: {
      editor: fs.existsSync(resolveProjectPath(config.logs.editor)),
      programming: fs.existsSync(
        resolveProjectPath(config.logs.programming),
      ),
      assetDbDirectory: fs.existsSync(
        resolveProjectPath(config.logs.assetDbDirectory),
      ),
    },
    git: {
      chineseCommitHookEnabled: hookPath === ".githooks",
    },
    developmentBuildPolicy:
      config.validation.developmentBuildPolicy,
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`工作流环境：${report.project}（${report.platform}）`);
  console.log(
    `Creator：${report.editor.targetProjectOpen ? `已复用 PID ${editorPid}` : "目标项目未打开"}；Dashboard：${report.editor.dashboardRunning ? "运行中" : "未运行"}`,
  );
  console.log(
    `桥接扩展：${report.editor.extensionConnected ? "已连接" : "未连接"}；预览：${previewUrls.join("、") || "未发现"}`,
  );
  console.log(
    `日志：编辑器 ${report.logs.editor ? "可读" : "缺失"}，脚本 ${report.logs.programming ? "可读" : "缺失"}，资源库 ${report.logs.assetDbDirectory ? "可读" : "缺失"}`,
  );
  console.log(
    `中文提交钩子：${report.git.chineseCommitHookEnabled ? "已启用" : "未启用，请执行 npm run workflow:setup"}`,
  );
  console.log("开发阶段构建策略：仅在用户明确要求时执行。");

  if (!report.creatorVersion.matches) {
    process.exitCode = 1;
  }
}

await main();
