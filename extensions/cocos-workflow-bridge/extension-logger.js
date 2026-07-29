"use strict";

/** 创建兼容 Creator 扩展主进程的日志适配器。 */
function createExtensionLogger(output = console) {
  /** 调用目标日志方法，缺失时退回普通 log。 */
  function write(method, message) {
    const writer = output?.[method] ?? output?.log;
    if (typeof writer === "function") {
      writer.call(output, message);
    }
  }

  return {
    /** 输出普通扩展状态。 */
    info(message) {
      write("info", message);
    },

    /** 输出需要进入 Creator 错误日志的异常。 */
    error(message) {
      write("error", message);
    },
  };
}

module.exports = {
  createExtensionLogger,
};
