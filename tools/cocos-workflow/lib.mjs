import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 工作流脚本所在目录。 */
export const workflowDirectory = path.dirname(fileURLToPath(import.meta.url));

/** 当前 Cocos 项目根目录。 */
export const projectRoot = path.resolve(workflowDirectory, "../..");

/** 工作流配置文件路径。 */
export const workflowConfigPath = path.join(
  projectRoot,
  ".cocos-workflow.json",
);

/** 工作流临时状态目录。 */
export const workflowTempDirectory = path.join(
  projectRoot,
  "temp/cocos-workflow",
);

/** 读取 UTF-8 JSON 文件。 */
export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** 使用稳定格式原子写入 JSON。 */
export function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(temporaryPath, filePath);
}

/** 把配置中的项目相对路径解析为本机绝对路径。 */
export function resolveProjectPath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`工作流路径必须是非空项目相对路径：${relativePath}`);
  }
  const resolvedPath = path.resolve(projectRoot, relativePath);
  const relativeResolvedPath = path.relative(projectRoot, resolvedPath);
  if (
    relativeResolvedPath.startsWith("..") ||
    path.isAbsolute(relativeResolvedPath)
  ) {
    throw new Error(`工作流路径越出项目根目录：${relativePath}`);
  }
  return resolvedPath;
}

/** 读取并校验跨电脑工作流配置。 */
export function loadWorkflowConfig() {
  if (!fs.existsSync(workflowConfigPath)) {
    throw new Error("缺少 .cocos-workflow.json。");
  }
  const config = readJson(workflowConfigPath);
  if (config.schemaVersion !== 1) {
    throw new Error(
      `不支持的工作流配置版本：${config.schemaVersion ?? "未填写"}`,
    );
  }
  if (config.creator?.launchPolicy !== "dashboard-only") {
    throw new Error("Creator 启动策略必须为 dashboard-only。");
  }
  if (config.validation?.developmentBuildPolicy !== "explicit-only") {
    throw new Error("开发阶段构建策略必须为 explicit-only。");
  }
  for (const relativePath of [
    config.logs?.editor,
    config.logs?.programming,
    config.logs?.assetDbDirectory,
    config.logs?.builderDirectory,
    config.componentRules,
  ]) {
    resolveProjectPath(relativePath);
  }
  return config;
}

/** 执行命令并返回去除首尾空白的输出。 */
export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && options.allowFailure !== true) {
    const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
    throw new Error(
      `${command} ${args.join(" ")} 执行失败${detail ? `：\n${detail}` : ""}`,
    );
  }
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
  };
}

/** 执行 package.json 中已登记的脚本。 */
export function runPackageScript(scriptName) {
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`package.json 未登记脚本：${scriptName}`);
  }
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  runCommand(npmCommand, ["run", scriptName], { inherit: true });
}

/** 返回 Git 已跟踪和未忽略的新增文件列表。 */
export function listTrackedFiles() {
  const tracked = runCommand("git", ["ls-files", "-z"]).stdout;
  const untracked = runCommand("git", [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]).stdout;
  return [...new Set(`${tracked}\0${untracked}`.split("\0"))]
    .filter(Boolean)
    .map((relativePath) => relativePath.split(path.sep).join("/"));
}

/** 判断字符串是否包含中文字符。 */
export function containsChinese(value) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}
