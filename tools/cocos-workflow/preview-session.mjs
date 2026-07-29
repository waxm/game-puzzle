#!/usr/bin/env node

import { discoverEditorProcess, discoverPreviewUrls } from "./session.mjs";

/** 输出当前项目已有的 Creator 预览地址，不创建浏览器进程。 */
async function main() {
  const editorState = discoverEditorProcess();
  if (!editorState.targetProcess) {
    throw new Error(
      "当前项目尚未在 Creator 中打开；请先从 Cocos Dashboard 打开项目。",
    );
  }
  const previewUrls = await discoverPreviewUrls(
    editorState.targetProcess.pid,
  );
  if (previewUrls.length === 0) {
    throw new Error(
      "未发现当前 Creator 的预览页，请先在编辑器中启动一次预览。",
    );
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ previewUrls }, null, 2));
  } else {
    console.log(previewUrls.join("\n"));
  }
}

await main();
