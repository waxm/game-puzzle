#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  loadWorkflowConfig,
  resolveProjectPath,
  workflowTempDirectory,
  writeJsonAtomic,
} from "./lib.mjs";

/** 编辑器日志增量游标文件。 */
const cursorPath = path.join(
  workflowTempDirectory,
  "editor-log-cursor.json",
);

/** 把日志按 Creator 级别和常见首错特征归类。 */
function classifyLog(content) {
  const lines = content.split(/\r?\n/);
  const errors = [];
  const warnings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      / - (?:error|failed):/i.test(line) ||
      /Can not find class|Missing Script|TypeError|ReferenceError|deserialize/i.test(
        line,
      )
    ) {
      errors.push({ line: index + 1, message: line });
    } else if (/ - warn(?:ing)?:/i.test(line)) {
      warnings.push({ line: index + 1, message: line });
    }
  }
  return { errors, warnings };
}

/** 保存当前日志末尾位置。 */
function mark(logPath) {
  const size = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  writeJsonAtomic(cursorPath, {
    schemaVersion: 1,
    logPath,
    offset: size,
    markedAt: new Date().toISOString(),
  });
  console.log(`已记录编辑器日志游标：${size} 字节。`);
}

/** 读取自上次标记以来的日志，并默认推进游标。 */
function read(logPath) {
  if (!fs.existsSync(cursorPath)) {
    throw new Error(
      "缺少编辑器日志游标，请先执行 npm run workflow:log:mark。",
    );
  }
  const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8"));
  const size = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  const offset =
    cursor.logPath === logPath && cursor.offset <= size
      ? cursor.offset
      : 0;
  const length = Math.max(0, size - offset);
  const buffer = Buffer.alloc(length);
  if (length > 0) {
    const descriptor = fs.openSync(logPath, "r");
    try {
      fs.readSync(descriptor, buffer, 0, length, offset);
    } finally {
      fs.closeSync(descriptor);
    }
  }
  const content = buffer.toString("utf8");
  const result = classifyLog(content);

  if (!process.argv.includes("--no-advance")) {
    writeJsonAtomic(cursorPath, {
      schemaVersion: 1,
      logPath,
      offset: size,
      markedAt: new Date().toISOString(),
    });
  }

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          bytes: length,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
          firstError: result.errors[0] ?? null,
          firstWarning: result.warnings[0] ?? null,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `编辑器日志增量：${length} 字节，${result.errors.length} 个错误，${result.warnings.length} 个警告。`,
    );
    if (result.errors[0]) {
      console.log(`首个错误：${result.errors[0].message}`);
    } else if (result.warnings[0]) {
      console.log(`首个警告：${result.warnings[0].message}`);
    }
  }

  if (
    process.argv.includes("--fail-on-error") &&
    result.errors.length > 0
  ) {
    process.exitCode = 1;
  }
}

/** 命令行入口。 */
function main() {
  const config = loadWorkflowConfig();
  const logPath = resolveProjectPath(config.logs.editor);
  const command = process.argv[2];
  if (command === "mark") {
    mark(logPath);
  } else if (command === "read") {
    read(logPath);
  } else {
    throw new Error("用法：editor-log.mjs <mark|read> [--json] [--fail-on-error]");
  }
}

main();
