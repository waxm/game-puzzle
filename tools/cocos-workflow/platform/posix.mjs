/** 把受限命令结果转换为可读原因。 */
function describeCommandFailure(command, result) {
  const detail =
    result.stderr || result.stdout || result.errorCode || "未知原因";
  return `${command} 不可用：${detail}`;
}

/** 在 macOS 和 Linux 上读取进程列表。 */
export function listProcesses(runCommand) {
  const result = runCommand("ps", ["-axo", "pid=,command="], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    return {
      available: false,
      processes: [],
      reason: describeCommandFailure("ps", result),
    };
  }

  const processes = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match
        ? { pid: Number(match[1]), command: match[2] }
        : null;
    })
    .filter(Boolean);
  return {
    available: true,
    processes,
    reason: null,
  };
}

/** 在 macOS 和 Linux 上读取指定进程监听的 TCP 端口。 */
export function listListeningPorts(pid, runCommand) {
  const result = runCommand(
    "lsof",
    ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"],
    { allowFailure: true },
  );
  if (
    result.status !== 0 &&
    (result.errorCode || result.stderr || result.stdout)
  ) {
    return {
      available: false,
      ports: [],
      reason: describeCommandFailure("lsof", result),
    };
  }
  return {
    available: true,
    ports: [
      ...new Set(
        [
          ...result.stdout.matchAll(
            /TCP\s+[^:]+:(\d+)\s+\(LISTEN\)/g,
          ),
        ].map((match) => Number(match[1])),
      ),
    ],
    reason: null,
  };
}
