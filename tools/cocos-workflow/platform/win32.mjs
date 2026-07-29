/** 把受限 PowerShell 结果转换为可读原因。 */
function describePowerShellFailure(result) {
  const detail =
    result.stderr || result.stdout || result.errorCode || "未知原因";
  return `PowerShell 不可用：${detail}`;
}

/** 在 Windows 上读取进程列表。 */
export function listProcesses(runCommand) {
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
  if (result.status !== 0) {
    return {
      available: false,
      processes: [],
      reason: describePowerShellFailure(result),
    };
  }
  if (!result.stdout) {
    return {
      available: true,
      processes: [],
      reason: null,
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return {
      available: true,
      processes: items.map((item) => ({
        pid: Number(item.ProcessId),
        command: `${item.Name ?? ""} ${item.CommandLine ?? ""}`,
      })),
      reason: null,
    };
  } catch (error) {
    return {
      available: false,
      processes: [],
      reason: `PowerShell 进程列表不是有效 JSON：${error.message}`,
    };
  }
}

/** 在 Windows 上读取指定进程监听的 TCP 端口。 */
export function listListeningPorts(pid, runCommand) {
  const script = [
    `Get-NetTCPConnection -State Listen -OwningProcess ${pid}`,
    "Select-Object -ExpandProperty LocalPort",
  ].join(" | ");
  const result = runCommand(
    "powershell.exe",
    ["-NoProfile", "-Command", script],
    { allowFailure: true },
  );
  if (result.status !== 0) {
    return {
      available: false,
      ports: [],
      reason: describePowerShellFailure(result),
    };
  }
  return {
    available: true,
    ports: [
      ...new Set(
        result.stdout
          .split(/\s+/)
          .map(Number)
          .filter(
            (port) => Number.isInteger(port) && port > 0,
          ),
      ),
    ],
    reason: null,
  };
}
