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

/** 不提交 Git 的本机工作流能力配置。 */
export const workflowLocalConfigPath = path.join(
  projectRoot,
  ".cocos-workflow.local.json",
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

/** 校验本机能力配置，只允许覆盖不会放宽团队规则的字段。 */
export function validateMachineConfig(
  machine,
  description = "machine",
  allowPartial = false,
) {
  if (!machine || typeof machine !== "object" || Array.isArray(machine)) {
    throw new Error(`${description} 必须是对象。`);
  }
  const allowedKeys = new Set([
    "browserControl",
    "portDiscovery",
    "processDiscovery",
  ]);
  const unknownKeys = Object.keys(machine).filter(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `${description} 包含未知字段：${unknownKeys.join("、")}`,
    );
  }
  for (const key of ["processDiscovery", "portDiscovery"]) {
    if (
      (!allowPartial || Object.hasOwn(machine, key)) &&
      !["auto", "disabled"].includes(machine[key])
    ) {
      throw new Error(
        `${description}.${key} 必须是 auto 或 disabled。`,
      );
    }
  }
  if (
    (!allowPartial || Object.hasOwn(machine, "browserControl")) &&
    !["available", "unavailable", "unknown"].includes(
      machine.browserControl,
    )
  ) {
    throw new Error(
      `${description}.browserControl 必须是 available、unavailable 或 unknown。`,
    );
  }
}

/** 读取并校验仅包含机器能力的本机覆盖配置。 */
function loadLocalWorkflowConfig() {
  if (!fs.existsSync(workflowLocalConfigPath)) {
    return null;
  }
  const localConfig = readJson(workflowLocalConfigPath);
  if (localConfig.schemaVersion !== 1) {
    throw new Error(
      ".cocos-workflow.local.json 的 schemaVersion 必须为 1。",
    );
  }
  const allowedKeys = new Set(["schemaVersion", "machine"]);
  const unknownKeys = Object.keys(localConfig).filter(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `.cocos-workflow.local.json 只能包含 schemaVersion 和 machine，禁止覆盖团队规则：${unknownKeys.join("、")}`,
    );
  }
  validateMachineConfig(
    localConfig.machine,
    ".cocos-workflow.local.json 的 machine",
    true,
  );
  return localConfig;
}

/** 读取并校验跨电脑工作流配置。 */
export function loadWorkflowConfig() {
  if (!fs.existsSync(workflowConfigPath)) {
    throw new Error("缺少 .cocos-workflow.json。");
  }
  const baseConfig = readJson(workflowConfigPath);
  if (baseConfig.schemaVersion !== 1) {
    throw new Error(
      `不支持的工作流配置版本：${baseConfig.schemaVersion ?? "未填写"}`,
    );
  }
  const localConfig = loadLocalWorkflowConfig();
  const config = {
    ...baseConfig,
    machine: {
      ...baseConfig.machine,
      ...(localConfig?.machine ?? {}),
    },
  };
  if (config.creator?.launchPolicy !== "dashboard-only") {
    throw new Error("Creator 启动策略必须为 dashboard-only。");
  }
  if (config.creator?.reuseOpenedProject !== true) {
    throw new Error("Creator 必须优先复用已打开的目标项目。");
  }
  if (
    config.preview?.reuseExistingBrowserTab !== true ||
    config.preview?.createTabOnlyWhenMissing !== true
  ) {
    throw new Error("浏览器预览必须优先复用现有标签。");
  }
  if (
    config.preview?.browserControlRequirement !== "external-tool"
  ) {
    throw new Error("浏览器控制能力必须声明为 external-tool。");
  }
  if (
    JSON.stringify(config.preview?.errorInspectionOrder) !==
    JSON.stringify(["editor-log", "browser-console"])
  ) {
    throw new Error("错误检查顺序必须先编辑器日志、后浏览器 Console。");
  }
  if (config.preview?.screenshotPolicy !== "visual-only") {
    throw new Error("截图策略必须为 visual-only。");
  }
  if (config.validation?.developmentBuildPolicy !== "explicit-only") {
    throw new Error("开发阶段构建策略必须为 explicit-only。");
  }
  if (config.validation?.submissionValidationScript !== "verify") {
    throw new Error("提交前完整验证脚本必须为 verify。");
  }
  if (config.validation?.failureReassessmentLimit !== 2) {
    throw new Error("连续两次未改变首个错误后必须重新定位。");
  }
  validateMachineConfig(config.machine);
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
    if (options.allowFailure === true) {
      return {
        status: result.status ?? 1,
        stdout: String(result.stdout ?? "").trim(),
        stderr: String(
          result.stderr ?? result.error.message ?? "",
        ).trim(),
        errorCode:
          typeof result.error.code === "string"
            ? result.error.code
            : null,
      };
    }
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
    errorCode: null,
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
