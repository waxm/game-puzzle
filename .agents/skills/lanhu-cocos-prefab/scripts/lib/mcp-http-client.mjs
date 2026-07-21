import process from "node:process";

/** MCP Streamable HTTP 使用的默认协议版本。 */
const PROTOCOL_VERSION = "2024-11-05";

/** 单次 MCP 请求的默认超时时间。 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * 使用 Node 原生 fetch 调用一个 MCP 工具。
 *
 * 该客户端只实现蓝湖转换脚本需要的 initialize、initialized 和 tools/call，
 * 从而避免依赖其他电脑上的 @modelcontextprotocol/sdk 安装目录。
 */
export async function callMcpTool({
    url,
    name,
    arguments: toolArguments = {},
    clientName = "lanhu-cocos-prefab-tool",
    clientVersion = "1.0.0",
    timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
    assertNodeFetch();

    let sessionId = null;
    try {
        const initialized = await sendRequest({
            url,
            payload: {
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: {},
                    clientInfo: {
                        name: clientName,
                        version: clientVersion,
                    },
                },
            },
            timeoutMs,
        });
        sessionId = initialized.sessionId;
        const negotiatedVersion = initialized.message?.result?.protocolVersion || PROTOCOL_VERSION;

        await sendRequest({
            url,
            payload: {
                jsonrpc: "2.0",
                method: "notifications/initialized",
            },
            sessionId,
            protocolVersion: negotiatedVersion,
            timeoutMs,
            expectResponse: false,
        });

        const called = await sendRequest({
            url,
            payload: {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: {
                    name,
                    arguments: toolArguments,
                },
            },
            sessionId,
            protocolVersion: negotiatedVersion,
            timeoutMs,
        });

        return called.message.result;
    } finally {
        if (sessionId) {
            await closeSession(url, sessionId, timeoutMs);
        }
    }
}

/** 校验 Node 版本是否提供转换脚本依赖的原生 fetch。 */
function assertNodeFetch() {
    if (typeof fetch !== "function") {
        throw new Error(
            `当前 Node.js ${process.version} 不支持原生 fetch，请安装 Node.js 18 或更高版本。`,
        );
    }
}

/** 发送一次 JSON-RPC 请求并解析 JSON 或 SSE 响应。 */
async function sendRequest({
    url,
    payload,
    sessionId = null,
    protocolVersion = PROTOCOL_VERSION,
    timeoutMs,
    expectResponse = true,
}) {
    const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: createHeaders(sessionId, protocolVersion),
        body: JSON.stringify(payload),
    }, timeoutMs);

    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(
            `MCP HTTP ${response.status} ${response.statusText}${details ? `：${details}` : ""}`,
        );
    }

    const nextSessionId = response.headers.get("mcp-session-id") || sessionId;
    if (!expectResponse || response.status === 202 || response.status === 204) {
        return { message: null, sessionId: nextSessionId };
    }

    const text = await response.text();
    if (!text.trim()) {
        throw new Error("MCP 返回了空响应。");
    }

    const messages = parseResponseMessages(text, response.headers.get("content-type") || "");
    const message = messages.find((item) => item?.id === payload.id) || messages.at(-1);
    if (!message) {
        throw new Error("MCP 响应中没有可解析的 JSON-RPC 消息。");
    }
    if (message.error) {
        const code = message.error.code ?? "unknown";
        const details = message.error.message || JSON.stringify(message.error);
        throw new Error(`MCP JSON-RPC ${code}：${details}`);
    }

    return { message, sessionId: nextSessionId };
}

/** 创建 MCP Streamable HTTP 请求头。 */
function createHeaders(sessionId, protocolVersion) {
    const headers = {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "mcp-protocol-version": protocolVersion,
    };
    if (sessionId) {
        headers["mcp-session-id"] = sessionId;
    }
    return headers;
}

/** 按响应类型解析普通 JSON 或 SSE data 事件。 */
function parseResponseMessages(text, contentType) {
    if (!contentType.toLowerCase().includes("text/event-stream")) {
        return [JSON.parse(text)];
    }

    const messages = [];
    const normalized = text.replace(/\r\n/g, "\n");
    for (const block of normalized.split(/\n\n+/)) {
        const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
        if (!data || data === "[DONE]") {
            continue;
        }
        messages.push(JSON.parse(data));
    }
    return messages;
}

/** 在指定超时内执行 fetch，防止服务异常时转换脚本永久等待。 */
async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`MCP 请求超时（${timeoutMs} ms）：${url}`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

/** 尽力关闭 MCP 会话；清理失败不覆盖已经取得的转换结果或原始异常。 */
async function closeSession(url, sessionId, timeoutMs) {
    try {
        await fetchWithTimeout(url, {
            method: "DELETE",
            headers: createHeaders(sessionId, PROTOCOL_VERSION),
        }, timeoutMs);
    } catch {
        // 会话会由服务端回收，客户端退出不应因清理失败而改变主要结果。
    }
}
