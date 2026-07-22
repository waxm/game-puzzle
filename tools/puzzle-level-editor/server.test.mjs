import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  EDITOR_HOST,
  createPuzzleLevelEditorServer,
  runCheck,
} from "./server.mjs";

/** 测试使用的最小有效 PNG。 */
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/** 测试工程根目录。 */
let temporaryProjectRoot;

/** 测试 HTTP 服务。 */
let server;

/** 测试 HTTP 服务入口。 */
let baseUrl;

/** 第一关配置路径。 */
let configPath;

before(async () => {
  temporaryProjectRoot = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "workai-level-editor-"),
  );
  const configsRoot = path.join(
    temporaryProjectRoot,
    "assets/resources/configs/game/levels",
  );
  const textureLevelRoot = path.join(
    temporaryProjectRoot,
    "assets/resources/textures/game/levels/level_001",
  );
  await fsPromises.mkdir(configsRoot, { recursive: true });
  await fsPromises.mkdir(textureLevelRoot, { recursive: true });
  configPath = path.join(configsRoot, "level_001.json");
  await fsPromises.writeFile(
    configPath,
    `${JSON.stringify(createConfig(), null, 2)}\n`,
    "utf8",
  );
  await fsPromises.writeFile(
    path.join(textureLevelRoot, "level_001_source.png"),
    onePixelPng,
  );

  server = createPuzzleLevelEditorServer({
    projectRoot: temporaryProjectRoot,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, EDITOR_HOST, resolve);
  });
  const address = server.address();
  baseUrl = `http://${EDITOR_HOST}:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (temporaryProjectRoot) {
    await fsPromises.rm(temporaryProjectRoot, { recursive: true, force: true });
  }
});

test("--check 等价检查能够读取既有关卡且不启动端口", async () => {
  await runCheck({ projectRoot: temporaryProjectRoot });
});

test("静态首页、关卡列表、配置与对应图片可读取", async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /拼图关卡编辑器/);

  const listResponse = await fetch(`${baseUrl}/api/levels`);
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.deepEqual(
    list.levels.map((entry) => entry.level),
    [1],
  );
  assert.equal(list.levels[0].rows, 3);

  const configResponse = await fetch(`${baseUrl}/api/levels/1`);
  assert.equal(configResponse.status, 200);
  const payload = await configResponse.json();
  assert.deepEqual(payload.config, createConfig());
  assert.equal(payload.imageUrl, "/api/levels/1/image");

  const imageResponse = await fetch(`${baseUrl}/api/levels/1/image`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), onePixelPng);
});

test("有效配置通过临时文件加 rename 保存并保持稳定格式", async () => {
  const updatedConfig = createConfig({
    boardWidth: 512,
    boardHeight: 384,
    timeLimitSeconds: null,
    pieceOrder: [8, 7, 6, 5, 4, 3, 2, 1, 0],
  });
  const response = await putLevel(1, updatedConfig);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.config, updatedConfig);

  const savedSource = await fsPromises.readFile(configPath, "utf8");
  assert.deepEqual(JSON.parse(savedSource), updatedConfig);
  assert.equal(savedSource.endsWith("\n"), true);
  const leftovers = (await fsPromises.readdir(path.dirname(configPath))).filter(
    (name) => name.endsWith(".tmp"),
  );
  assert.deepEqual(leftovers, []);
});

test("拒绝额外字段且不会改写原文件", async () => {
  const beforeSource = await fsPromises.readFile(configPath, "utf8");
  const response = await putLevel(1, {
    ...createConfig(),
    accidentalField: true,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /不支持字段/);
  assert.equal(await fsPromises.readFile(configPath, "utf8"), beforeSource);
});

test("拒绝重复 pieceOrder 且不会改写原文件", async () => {
  const beforeSource = await fsPromises.readFile(configPath, "utf8");
  const response = await putLevel(
    1,
    createConfig({ pieceOrder: [0, 0, 2, 3, 4, 5, 6, 7, 8] }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /重复|完整包含/);
  assert.equal(await fsPromises.readFile(configPath, "utf8"), beforeSource);
});

test("拒绝修改只读资源路径", async () => {
  const response = await putLevel(
    1,
    createConfig({ sourceImagePath: "textures/other/spriteFrame" }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /sourceImagePath/);
});

test("保存仅允许既有关卡编号，不会创建新 JSON", async () => {
  const response = await putLevel(2, {
    ...createConfig(),
    level: 2,
    sourceImagePath:
      "textures/game/levels/level_002/level_002_source/spriteFrame",
  });
  assert.equal(response.status, 404);
  const nonexistentPath = path.join(path.dirname(configPath), "level_002.json");
  await assert.rejects(fsPromises.stat(nonexistentPath), /ENOENT/);
});

test("拒绝 schema 上限外的 level 1000 和路径穿越请求", async () => {
  const tooLargeResponse = await fetch(`${baseUrl}/api/levels/1000`);
  assert.equal(tooLargeResponse.status, 400);
  assert.match((await tooLargeResponse.json()).error, /1 到 999/);

  const traversalResponse = await fetch(
    `${baseUrl}/api/levels/${encodeURIComponent("../1")}`,
  );
  assert.equal(traversalResponse.status, 404);
});

/** 创建字段完整、顺序稳定的第一关测试配置。 */
function createConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    level: 1,
    sourceImagePath:
      "textures/game/levels/level_001/level_001_source/spriteFrame",
    rows: 3,
    columns: 3,
    boardWidth: 448,
    boardHeight: 448,
    timeLimitSeconds: 30,
    pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
    ...overrides,
  };
}

/** 向指定既有关卡提交 JSON。 */
function putLevel(level, config) {
  return fetch(`${baseUrl}/api/levels/${level}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}
