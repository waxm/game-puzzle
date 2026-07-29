import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import {
  projectRoot,
  runCommand,
  workflowTempDirectory,
} from "./lib.mjs";

/** Creator 扩展写入的项目会话文件。 */
const editorSessionPath = path.join(
  workflowTempDirectory,
  "editor-session.json",
);

/** 从 Creator 命令行中读取 --project 参数。 */
function parseProjectArgument(commandLine) {
  const match = commandLine.match(
    /--project(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/,
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

/** 按平台取得当前进程列表。 */
function listProcesses() {
  if (process.platform === "win32") {
    const script = [
      "Get-CimInstance Win32_Process",
      "Select-Object ProcessId,CommandLine,Name",
      "ConvertTo-Json -Compress",
    ].join(" | ");
    const result = runCommand(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { allowFailure: true },
    );
    if (result.status !== 0 || !result.stdout) {
      return [];
    }
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      pid: Number(item.ProcessId),
      command: `${item.Name ?? ""} ${item.CommandLine ?? ""}`,
    }));
  }

  const result = runCommand("ps", ["-axo", "pid=,command="], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match
        ? { pid: Number(match[1]), command: match[2] }
        : null;
    })
    .filter(Boolean);
}

/** 统一不同平台的路径比较。 */
function normalizeComparablePath(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

/** 查找当前项目对应的 Creator 进程和 Dashboard 状态。 */
export function discoverEditorProcess() {
  const processes = listProcesses();
  const expectedProjectPath = normalizeComparablePath(projectRoot);
  const creatorProcesses = processes.filter((item) =>
    /CocosCreator(?:\.exe)?(?:\s|$)/i.test(item.command),
  );
  const targetProcess = creatorProcesses.find((item) => {
    const projectArgument = parseProjectArgument(item.command);
    return (
      projectArgument &&
      normalizeComparablePath(projectArgument) === expectedProjectPath
    );
  });
  return {
    targetProcess: targetProcess ?? null,
    otherCreatorProjects: creatorProcesses
      .map((item) => ({
        pid: item.pid,
        projectPath: parseProjectArgument(item.command),
      }))
      .filter(
        (item) =>
          item.projectPath &&
          normalizeComparablePath(item.projectPath) !== expectedProjectPath,
      ),
    dashboardRunning: processes.some((item) =>
      /CocosDashboard(?:\.exe)?(?:\s|$)/i.test(item.command),
    ),
  };
}

/** 读取仍然新鲜的项目内 Creator 扩展会话。 */
export function readEditorSession() {
  if (!fs.existsSync(editorSessionPath)) {
    return null;
  }
  try {
    const session = JSON.parse(fs.readFileSync(editorSessionPath, "utf8"));
    const heartbeatTime = Date.parse(session.heartbeatAt ?? "");
    if (
      session.projectPath !== projectRoot ||
      !Number.isFinite(heartbeatTime) ||
      Date.now() - heartbeatTime > 20_000 ||
      session.active !== true
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** 按平台读取指定进程正在监听的 TCP 端口。 */
function listListeningPorts(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return [];
  }
  if (process.platform === "win32") {
    const script = [
      `Get-NetTCPConnection -State Listen -OwningProcess ${pid}`,
      "Select-Object -ExpandProperty LocalPort",
    ].join(" | ");
    const result = runCommand(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { allowFailure: true },
    );
    return result.stdout
      .split(/\s+/)
      .map(Number)
      .filter((port) => Number.isInteger(port) && port > 0);
  }

  const result = runCommand(
    "lsof",
    ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"],
    { allowFailure: true },
  );
  return [
    ...new Set(
      [...result.stdout.matchAll(/TCP\s+[^:]+:(\d+)\s+\(LISTEN\)/g)].map(
        (match) => Number(match[1]),
      ),
    ),
  ];
}

/** 判断本地 HTTP 端口是否为当前项目的 Creator 预览页。 */
function probePreviewPort(port, projectName) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/",
        timeout: 700,
      },
      (response) => {
        const chunks = [];
        let receivedBytes = 0;
        response.on("data", (chunk) => {
          if (receivedBytes < 64 * 1024) {
            chunks.push(chunk);
            receivedBytes += chunk.length;
          }
        });
        response.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf8");
          const title =
            html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
          resolve(
            /Cocos Creator/i.test(title) &&
              (!projectName || title.includes(projectName)),
          );
        });
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

/** 动态发现当前 Creator 进程提供的预览地址。 */
export async function discoverPreviewUrls(editorPid) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const ports = listListeningPorts(editorPid);
  const checks = await Promise.all(
    ports.map(async (port) => ({
      port,
      matches: await probePreviewPort(port, packageJson.name),
    })),
  );
  return checks
    .filter((item) => item.matches)
    .map((item) => `http://localhost:${item.port}/`);
}
