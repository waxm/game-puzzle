import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import {
  loadWorkflowConfig,
  projectRoot,
  runCommand,
  workflowTempDirectory,
} from "./lib.mjs";
import { getPlatformAdapter } from "./platform/index.mjs";

/** 当前系统对应的进程和端口发现适配器。 */
const platformAdapter = getPlatformAdapter();

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

/** 统一不同平台的路径比较。 */
function normalizeComparablePath(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

/** 查找当前项目对应的 Creator 进程和 Dashboard 状态。 */
export function discoverEditorProcess() {
  const processDiscovery =
    loadWorkflowConfig().machine.processDiscovery === "disabled"
      ? {
          available: false,
          processes: [],
          reason: "本机配置已禁用进程发现。",
        }
      : platformAdapter.listProcesses(runCommand);
  const processes = processDiscovery.processes;
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
    processDiscovery: {
      available: processDiscovery.available,
      platform: process.platform,
      reason: processDiscovery.reason,
    },
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

/** 动态发现当前 Creator 进程提供的预览地址和端口发现能力。 */
export async function discoverPreviewState(editorPid) {
  if (!Number.isInteger(editorPid) || editorPid <= 0) {
    return {
      urls: [],
      portDiscovery: {
        available: false,
        platform: process.platform,
        reason: "Creator PID 无效，无法发现预览端口。",
      },
    };
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const portDiscovery =
    loadWorkflowConfig().machine.portDiscovery === "disabled"
      ? {
          available: false,
          ports: [],
          reason: "本机配置已禁用端口发现。",
        }
      : platformAdapter.listListeningPorts(editorPid, runCommand);
  if (!portDiscovery.available) {
    return {
      urls: [],
      portDiscovery: {
        available: false,
        platform: process.platform,
        reason: portDiscovery.reason,
      },
    };
  }
  const checks = await Promise.all(
    portDiscovery.ports.map(async (port) => ({
      port,
      matches: await probePreviewPort(port, packageJson.name),
    })),
  );
  return {
    urls: checks
      .filter((item) => item.matches)
      .map((item) => `http://localhost:${item.port}/`),
    portDiscovery: {
      available: true,
      platform: process.platform,
      reason: null,
    },
  };
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

/** 兼容只需要预览地址的调用方。 */
export async function discoverPreviewUrls(editorPid) {
  return (await discoverPreviewState(editorPid)).urls;
}
