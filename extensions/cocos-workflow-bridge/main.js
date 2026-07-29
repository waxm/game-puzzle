"use strict";

const fs = require("fs");
const path = require("path");

const { createExtensionLogger } = require("./extension-logger");
const packageJson = require("./package.json");
const {
  createValidationFailure,
  createValidationState,
} = require("./validation-state");

/** Creator 扩展主进程日志适配器。 */
const logger = createExtensionLogger();

/** 扩展包名。 */
const PACKAGE_NAME = packageJson.name;

/** 会话心跳间隔。 */
const HEARTBEAT_INTERVAL_MS = 5_000;

/** 活动场景组件轮询间隔。 */
const VALIDATION_INTERVAL_MS = 3_000;

/** 心跳定时器。 */
let heartbeatTimer = null;

/** 组件校验定时器。 */
let validationTimer = null;

/** 上一次组件冲突签名，用于避免重复刷屏。 */
let lastIssueSignature = "";

/** 上一次组件校验异常签名，用于避免重复刷屏。 */
let lastFailureSignature = "";

/** 上一次活动场景组件校验结果。 */
let lastValidation = null;

/** 返回当前项目根目录。 */
function getProjectRoot() {
  if (!global.Editor || !Editor.Project || !Editor.Project.path) {
    throw new Error("Editor.Project.path 不可用。");
  }
  return Editor.Project.path;
}

/** 返回工作流临时目录。 */
function getWorkflowTempDirectory() {
  return path.join(getProjectRoot(), "temp/cocos-workflow");
}

/** 返回项目内组件规则。 */
function readComponentRules() {
  const configPath = path.join(
    getProjectRoot(),
    ".cocos-workflow.json",
  );
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rulesPath = path.resolve(
    getProjectRoot(),
    config.componentRules,
  );
  return JSON.parse(fs.readFileSync(rulesPath, "utf8"));
}

/** 使用临时文件原子写入会话，避免外部工具读取半截 JSON。 */
function writeSession(active) {
  const directory = getWorkflowTempDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const sessionPath = path.join(directory, "editor-session.json");
  const temporaryPath = `${sessionPath}.${process.pid}.tmp`;
  const session = {
    schemaVersion: 1,
    extensionVersion: packageJson.version,
    active,
    pid: process.pid,
    projectPath: getProjectRoot(),
    creatorVersion: String(Editor.App?.version ?? "3.8.4"),
    platform: process.platform,
    heartbeatAt: new Date().toISOString(),
    componentValidation: lastValidation,
  };
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(session, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(temporaryPath, sessionPath);
  return session;
}

/** 调用场景进程执行组件规则检查。 */
async function validateActiveScene() {
  try {
    const result = await Editor.Message.request(
      "scene",
      "execute-scene-script",
      {
        name: PACKAGE_NAME,
        method: "validateActiveScene",
        args: [readComponentRules()],
      },
    );
    lastValidation = createValidationState(result);

    const issueSignature = JSON.stringify(result?.issues ?? []);
    if (
      lastValidation.status === "issues" &&
      issueSignature !== lastIssueSignature
    ) {
      logger.error(
        `[${PACKAGE_NAME}] 发现 ${lastValidation.issueCount} 个组件挂载问题，首个问题：${lastValidation.firstIssue}`,
      );
    } else if (
      lastValidation.status === "passed" &&
      lastIssueSignature &&
      lastIssueSignature !== "[]"
    ) {
      logger.info(`[${PACKAGE_NAME}] 当前场景组件挂载问题已消除。`);
    }
    lastIssueSignature = issueSignature;
    if (lastFailureSignature) {
      logger.info(`[${PACKAGE_NAME}] 活动场景组件校验已恢复。`);
      lastFailureSignature = "";
    }
    writeSession(true);
    return result;
  } catch (error) {
    lastValidation = createValidationFailure(error);
    const failureSignature = JSON.stringify([
      lastValidation.errorCode,
      lastValidation.errorMessage,
    ]);
    if (failureSignature !== lastFailureSignature) {
      logger.error(
        `[${PACKAGE_NAME}] 活动场景组件校验执行失败：${lastValidation.errorMessage}`,
      );
    }
    lastFailureSignature = failureSignature;
    writeSession(true);
    return {
      sceneName: "",
      nodeCount: 0,
      issues: [],
      failed: true,
      errorCode: lastValidation.errorCode,
      errorMessage: lastValidation.errorMessage,
    };
  }
}

/** 启动项目会话心跳和低频组件检查。 */
function load() {
  writeSession(true);
  heartbeatTimer = setInterval(
    () => writeSession(true),
    HEARTBEAT_INTERVAL_MS,
  );
  validationTimer = setInterval(
    () => void validateActiveScene(),
    VALIDATION_INTERVAL_MS,
  );
  void validateActiveScene();
  logger.info(`[${PACKAGE_NAME}] 跨电脑开发工作流已连接。`);
}

/** 清理定时器并把会话标记为离线。 */
function unload() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (validationTimer) {
    clearInterval(validationTimer);
    validationTimer = null;
  }
  writeSession(false);
}

module.exports = {
  load,
  unload,
  methods: {
    /** 返回当前项目会话状态。 */
    status() {
      return writeSession(true);
    },

    /** 手动触发一次活动场景组件校验。 */
    async validateActiveScene() {
      return validateActiveScene();
    },
  },
};
