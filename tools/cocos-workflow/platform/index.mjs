import * as darwinAdapter from "./darwin.mjs";
import * as linuxAdapter from "./linux.mjs";
import * as win32Adapter from "./win32.mjs";

/** 已实现命令适配的桌面平台。 */
const platformAdapters = {
  darwin: darwinAdapter,
  linux: linuxAdapter,
  win32: win32Adapter,
};

/** 返回当前平台适配器；未知平台以能力不可用方式降级。 */
export function getPlatformAdapter(platform = process.platform) {
  return (
    platformAdapters[platform] ?? {
      listProcesses() {
        return {
          available: false,
          processes: [],
          reason: `暂不支持 ${platform} 的进程发现。`,
        };
      },
      listListeningPorts() {
        return {
          available: false,
          ports: [],
          reason: `暂不支持 ${platform} 的端口发现。`,
        };
      },
    }
  );
}
