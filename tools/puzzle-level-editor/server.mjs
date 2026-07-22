#!/usr/bin/env node

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  MAX_PUZZLE_LEVEL,
  collectConfigLevelNumbers,
  createLevelName,
  createSourceImagePath,
  formatPuzzleLevelConfig,
  getLevelConfigFilePath,
  parsePuzzleLevelConfig,
} from "../puzzle-level-schema.mjs";

/** 编辑器固定绑定到本机回环地址，避免在局域网中暴露写文件接口。 */
export const EDITOR_HOST = "127.0.0.1";

/** 编辑器默认端口。 */
export const DEFAULT_EDITOR_PORT = 4178;

/** 当前编辑器静态文件目录。 */
const editorRoot = import.meta.dirname;

/** 默认项目根目录。 */
const defaultProjectRoot = path.resolve(editorRoot, "../..");

/** 允许浏览器请求的静态文件及其响应类型。 */
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

/** JSON 请求体的最大字节数，防止本地误操作占满内存。 */
const maxJsonBodyBytes = 1024 * 1024;

/**
 * 创建关卡编辑器 HTTP 服务。
 *
 * 测试可以传入临时项目目录；正常启动始终使用当前工程目录。
 */
export function createPuzzleLevelEditorServer({
  projectRoot = defaultProjectRoot,
} = {}) {
  const roots = createProjectRoots(projectRoot);
  return http.createServer((request, response) => {
    void handleRequest(request, response, roots).catch((error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      sendError(response, error);
    });
  });
}

/** 检查编辑器文件、关卡配置、图片映射和路径边界，不启动 HTTP 端口。 */
export async function runCheck({ projectRoot = defaultProjectRoot } = {}) {
  if (EDITOR_HOST !== "127.0.0.1") {
    throw new Error("关卡编辑器必须只绑定 127.0.0.1。");
  }

  for (const [fileName] of staticFiles.values()) {
    const filePath = path.join(editorRoot, fileName);
    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error(`编辑器静态文件无效：${filePath}`);
    }
  }

  const roots = createProjectRoots(projectRoot);
  const levels = await readLevelSummaries(roots);
  if (levels.length === 0) {
    throw new Error(`没有找到可编辑关卡：${roots.configsRoot}`);
  }

  for (const { level } of levels) {
    await readExistingLevel(level, roots);
  }

  console.log(
    `关卡编辑器检查通过：${levels.length} 个关卡，服务仅绑定 ${EDITOR_HOST}。`,
  );
}

/** 根据项目根目录创建经过归一化的资源根路径。 */
function createProjectRoots(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  return {
    projectRoot: resolvedProjectRoot,
    configsRoot: path.join(
      resolvedProjectRoot,
      "assets/resources/configs/game/levels",
    ),
    texturesRoot: path.join(
      resolvedProjectRoot,
      "assets/resources/textures/game/levels",
    ),
  };
}

/** 分发静态文件、关卡 JSON 和关卡原图请求。 */
async function handleRequest(request, response, roots) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && staticFiles.has(requestUrl.pathname)) {
    await sendStaticFile(response, requestUrl.pathname);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/levels") {
    sendJson(response, 200, { levels: await readLevelSummaries(roots) });
    return;
  }

  const levelRoute = requestUrl.pathname.match(/^\/api\/levels\/(\d+)$/);
  if (levelRoute && request.method === "GET") {
    const level = parseRouteLevel(levelRoute[1]);
    const { config } = await readExistingLevel(level, roots);
    sendJson(response, 200, {
      config,
      imageUrl: createImageUrl(level),
    });
    return;
  }

  if (levelRoute && request.method === "PUT") {
    const level = parseRouteLevel(levelRoute[1]);
    const requestBody = await readJsonBody(request);
    const savedConfig = await saveExistingLevel(level, requestBody, roots);
    sendJson(response, 200, {
      config: savedConfig,
      message: `第 ${level} 关已保存到工程。`,
    });
    return;
  }

  const imageRoute = requestUrl.pathname.match(
    /^\/api\/levels\/(\d+)\/image$/,
  );
  if (imageRoute && request.method === "GET") {
    const level = parseRouteLevel(imageRoute[1]);
    await sendLevelImage(response, level, roots);
    return;
  }

  sendJson(response, 404, { error: "请求地址不存在。" });
}

/** 扫描并严格解析全部既有关卡配置。 */
async function readLevelSummaries(roots) {
  const levels = collectConfigLevelNumbers(roots.configsRoot);

  const summaries = [];
  for (const level of levels) {
    const { config } = await readExistingLevel(level, roots);
    summaries.push({
      level,
      levelName: createLevelName(level),
      rows: config.rows,
      columns: config.columns,
      timeLimitSeconds: config.timeLimitSeconds,
      sourceImagePath: config.sourceImagePath,
      imageUrl: createImageUrl(level),
    });
  }
  return summaries;
}

/** 读取一个已存在的单关 JSON，并核对编号、资源路径和原图。 */
async function readExistingLevel(level, roots) {
  const paths = await resolveExistingLevelPaths(level, roots);
  const source = await fsPromises.readFile(paths.configPath, "utf8");
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw createHttpError(
      500,
      `${paths.levelName} JSON 解析失败：${getErrorMessage(error)}`,
    );
  }
  const config = parsePuzzleLevelConfig(value, {
    expectedLevel: level,
    location: paths.configPath,
  });
  return { config, ...paths };
}

/**
 * 严格校验并原子保存既有关卡。
 *
 * 目标文件和图片路径都由关卡编号生成，不接受请求体提供磁盘路径。
 */
async function saveExistingLevel(level, value, roots) {
  const paths = await resolveExistingLevelPaths(level, roots);
  let config;
  try {
    config = parsePuzzleLevelConfig(value, {
      expectedLevel: level,
      location: `编辑器提交的 ${paths.levelName}`,
    });
  } catch (error) {
    throw createHttpError(400, getErrorMessage(error));
  }
  const expectedSourceImagePath = createSourceImagePath(level);
  if (config.sourceImagePath !== expectedSourceImagePath) {
    throw createHttpError(
      400,
      `${paths.levelName}.sourceImagePath 必须为 ${expectedSourceImagePath}。`,
    );
  }

  const temporaryPath = `${paths.configPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsPromises.writeFile(
      temporaryPath,
      formatPuzzleLevelConfig(config),
      { encoding: "utf8", flag: "wx" },
    );
    await fsPromises.rename(temporaryPath, paths.configPath);
  } catch (error) {
    await fsPromises.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return config;
}

/** 解析并限制可访问的配置和图片路径，只允许已有编号。 */
async function resolveExistingLevelPaths(level, roots) {
  const levelName = createLevelName(level);
  const configPath = getLevelConfigFilePath(roots.configsRoot, level);
  const imagePath = path.join(
    roots.texturesRoot,
    levelName,
    `${levelName}_source.png`,
  );
  assertPathInside(roots.configsRoot, configPath, "关卡配置");
  assertPathInside(roots.texturesRoot, imagePath, "关卡图片");

  const [configStats, imageStats] = await Promise.all([
    fsPromises.stat(configPath).catch(() => null),
    fsPromises.stat(imagePath).catch(() => null),
  ]);
  if (!configStats?.isFile()) {
    throw createHttpError(404, `关卡不存在或不允许新建：${levelName}`);
  }
  if (!imageStats?.isFile()) {
    throw createHttpError(404, `${levelName} 缺少对应原图。`);
  }
  return { levelName, configPath, imagePath };
}

/** 确保候选路径确实位于指定根目录内部。 */
function assertPathInside(rootPath, candidatePath, label) {
  const relativePath = path.relative(
    path.resolve(rootPath),
    path.resolve(candidatePath),
  );
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath)
  ) {
    if (relativePath === "") {
      return;
    }
    throw createHttpError(400, `${label}路径超出允许目录。`);
  }
}

/** 解析 URL 中的正整数关卡编号。 */
function parseRouteLevel(levelText) {
  const level = Number(levelText);
  if (
    !Number.isSafeInteger(level) ||
    level <= 0 ||
    level > MAX_PUZZLE_LEVEL
  ) {
    throw createHttpError(
      400,
      `关卡编号必须是 1 到 ${MAX_PUZZLE_LEVEL} 之间的整数。`,
    );
  }
  return level;
}

/** 创建浏览器读取关卡原图的本地接口地址。 */
function createImageUrl(level) {
  return `/api/levels/${level}/image`;
}

/** 读取大小受限的 JSON 请求体。 */
async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJsonBodyBytes) {
      throw createHttpError(413, "提交的 JSON 超过 1MB 限制。");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw createHttpError(400, `提交内容不是有效 JSON：${getErrorMessage(error)}`);
  }
}

/** 返回编辑器静态文件。 */
async function sendStaticFile(response, requestPath) {
  const [fileName, contentType] = staticFiles.get(requestPath);
  const filePath = path.join(editorRoot, fileName);
  const body = await fsPromises.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

/** 返回指定关卡的 PNG 原图。 */
async function sendLevelImage(response, level, roots) {
  const { imagePath } = await resolveExistingLevelPaths(level, roots);
  const stats = await fsPromises.stat(imagePath);
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": stats.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(imagePath).pipe(response);
}

/** 返回 JSON 响应。 */
function sendJson(response, statusCode, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

/** 将异常转换为不会泄露项目外路径的 JSON 错误。 */
function sendError(response, error) {
  const statusCode = Number.isInteger(error?.statusCode)
    ? error.statusCode
    : 500;
  const fallbackMessage = statusCode >= 500 ? "本地编辑器处理请求失败。" : "请求失败。";
  sendJson(response, statusCode, {
    error: getErrorMessage(error) || fallbackMessage,
  });
}

/** 创建带 HTTP 状态码的错误。 */
function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** 从未知异常中取得可展示文本。 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "");
}

/** 解析命令行端口，仅允许本机开发端口范围。 */
function readPortArgument() {
  const portIndex = process.argv.indexOf("--port");
  if (portIndex < 0) {
    return DEFAULT_EDITOR_PORT;
  }
  const port = Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("--port 必须是 1024 到 65535 之间的整数。");
  }
  return port;
}

/** 判断当前模块是否作为命令行入口执行。 */
const isCommandLineEntry =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCommandLineEntry) {
  if (process.argv.includes("--check")) {
    await runCheck();
  } else {
    const port = readPortArgument();
    const server = createPuzzleLevelEditorServer();
    server.listen(port, EDITOR_HOST, () => {
      console.log(`拼图关卡编辑器：http://${EDITOR_HOST}:${port}`);
      console.log("按 Ctrl+C 停止服务。保存操作会直接更新工程内的单关 JSON。");
    });
  }
}
