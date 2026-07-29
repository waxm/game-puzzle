"use strict";

/** 返回稳定且适合写入会话文件的错误文本。 */
function getErrorMessage(error) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? "未知错误");
}

/** 把场景进程返回值转换为统一的组件校验状态。 */
function createValidationState(result, checkedAt = new Date().toISOString()) {
  const sceneName =
    typeof result?.sceneName === "string" ? result.sceneName : "";
  const nodeCount = Number.isInteger(result?.nodeCount)
    ? result.nodeCount
    : 0;
  const issues = Array.isArray(result?.issues) ? result.issues : [];

  if (result?.unavailable === true) {
    return {
      status: "unavailable",
      checkedAt,
      sceneName,
      nodeCount,
      issueCount: 0,
      firstIssue: null,
      reason:
        typeof result.reason === "string" && result.reason
          ? result.reason
          : "当前没有可校验的活动场景。",
    };
  }

  return {
    status: issues.length > 0 ? "issues" : "passed",
    checkedAt,
    sceneName,
    nodeCount,
    issueCount: issues.length,
    firstIssue: issues[0] ?? null,
  };
}

/** 把桥接调用异常转换为可诊断且可序列化的失败状态。 */
function createValidationFailure(
  error,
  checkedAt = new Date().toISOString(),
) {
  return {
    status: "failed",
    checkedAt,
    sceneName: "",
    nodeCount: 0,
    issueCount: 0,
    firstIssue: null,
    errorCode:
      typeof error?.code === "string" ||
      typeof error?.code === "number"
        ? String(error.code)
        : null,
    errorMessage: getErrorMessage(error),
  };
}

/** 判断组件校验结果是否应让环境诊断返回失败。 */
function isValidationBlocking(validation) {
  return (
    validation?.status === "failed" ||
    validation?.status === "issues"
  );
}

/** 把组件校验状态转换为简明诊断文本。 */
function formatValidationState(validation) {
  switch (validation?.status) {
    case "passed":
      return `通过（${validation.sceneName || "未命名场景"}，${validation.nodeCount} 个节点）`;
    case "issues":
      return `发现 ${validation.issueCount} 个问题，首个问题：${validation.firstIssue}`;
    case "unavailable":
      return `当前不可用（${validation.reason}）`;
    case "failed":
      return `执行失败（${validation.errorCode ? `${validation.errorCode}：` : ""}${validation.errorMessage}）`;
    default:
      return "尚无检查结果";
  }
}

module.exports = {
  createValidationFailure,
  createValidationState,
  formatValidationState,
  isValidationBlocking,
};
