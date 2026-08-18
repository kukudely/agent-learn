# 步骤 24：实现 MCP Client

## 本步目标

把外部 MCP Server 提供的工具接入内部 ToolRegistry，同时复用既有 Schema、Policy、Approval、预算、取消和审计管线。MCP 是能力来源，不是安全旁路。

## 前置条件

- ToolRegistry 和统一执行 Pipeline 已完成。
- Project Trust、CredentialProvider 和 Session dispose 可用。
- 熟悉 JSON-RPC 2.0 和 MCP 的 initialize/tools 协议。

## 第一版范围

按以下顺序实现：

1. stdio transport；
2. initialize/handshake；
3. tools/list；
4. tools/call；
5. cancellation；
6. tools/list_changed；
7. resources 和 resource templates；
8. Streamable HTTP；
9. OAuth。

不要同时实现全部 transport 和能力。先用 Fake stdio Server 固定生命周期。

## 推荐状态机

```text
disabled
  -> connecting
  -> connected
  -> needs_auth
  -> failed
  -> stopped
```

状态转移必须形成事件，不能只记录日志。

## 推荐模块和契约

```text
src/mcp/types.ts
src/mcp/json-rpc.ts
src/mcp/transports/stdio.ts
src/mcp/client.ts
src/mcp/server-connection.ts
src/mcp/tool-adapter.ts
src/mcp/manager.ts
```

```ts
export interface McpTransport {
  readonly incoming: AsyncIterable<JsonRpcMessage>;
  send(message: JsonRpcMessage): Promise<void>;
  close(): Promise<void>;
}

export interface McpServerConfig {
  readonly name: string;
  readonly transport: "stdio" | "streamable-http";
  readonly command?: string;
  readonly args?: readonly string[];
  readonly url?: string;
  readonly startupTimeoutMs: number;
  readonly callTimeoutMs: number;
}

export interface McpConnection {
  initialize(signal: AbortSignal): Promise<McpServerInfo>;
  listTools(signal: AbortSignal): Promise<readonly McpTool[]>;
  callTool(
    name: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<McpToolResult>;
  dispose(): Promise<void>;
}
```

## 关键规则

- 工具 namespace 使用 `mcp:<server>:<tool>`，避免与内建工具冲突。
- initialize 前不能调用工具。
- 协议版本和 capabilities 必须协商。
- JSON-RPC request ID 唯一，响应必须匹配 pending request。
- AbortSignal 转换为 MCP cancellation notification。
- server 返回的 schema 先校验，再注册。
- MCP Tool 被包装成普通 ToolDefinition，之后走统一 Pipeline。
- 启动、调用、输出均有上限。
- Server 崩溃只使该连接失败，不使 Agent 进程崩溃。
- dispose 后没有遗留子进程和 pending request。
- OAuth token 只存 CredentialProvider。

## 实现步骤

1. 实现 JSON-RPC message validator 和 pending request map。
2. 建立 stdio transport，分离 stdout 协议与 stderr 日志。
3. 实现 initialize 请求、版本检查和 capability 保存。
4. 实现 `tools/list` 和分页。
5. 校验每个工具的 name、description 和 input schema。
6. 使用稳定 namespace 映射到 ToolRegistry。
7. `tools/call` 保留 call ID、超时、取消和输出限制。
8. 将 MCP error 映射为 ToolExecutionResult 或基础设施错误。
9. 处理 `tools/list_changed`：先完整获取新快照，再原子替换注册。
10. 实现 resources MIME、字节和数量限制。
11. transport 断开时 reject 全部 pending request。
12. Session/Workspace dispose 时关闭连接和子进程。
13. 添加 Streamable HTTP 后复用同一个 protocol client。
14. OAuth 只通过 credential reference。

## 步骤 adapter

创建 `test/step-adapters/step-24.adapter.ts`：

```ts
export function runMcpScenario(scenario: string): Promise<{
  status: string;
  negotiatedVersion?: string;
  capabilities?: string[];
  tools?: string[];
  callResult?: unknown;
  cancelled?: boolean;
  activeRequestsAfter?: number;
  secretExposed?: boolean;
}>;
```

必须支持：

- `initialize-list-call`
- `cancel-call`
- `protocol-error`
- `server-disconnect`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 握手 | 版本兼容、不兼容、capabilities |
| 工具 | list、分页、call、malformed schema |
| 生命周期 | startup timeout、进程崩溃、dispose |
| 取消 | client abort -> server cancellation |
| 更新 | list_changed 原子刷新 |
| 资源 | MIME、大小、数量限制 |
| 冲突 | 工具重名和 namespace |
| 权限 | MCP Tool 被 Policy deny |
| 安全 | token、headers 不泄露 |
| 清理 | pending requests、子进程归零 |

运行：

```powershell
npm run verify:step -- 24
```

## 退出清单

- [ ] Fake stdio Server 可完成握手和调用。
- [ ] MCP 工具进入统一 Tool Pipeline。
- [ ] 取消传到 Server。
- [ ] Server 故障不破坏 Session。
- [ ] 工具更新是原子快照。
- [ ] dispose 后无子进程和 pending request。
- [ ] 本步测试通过。

## 常见错误

- MCP Tool 直接执行，绕过 Policy。
- 把 stderr 当 JSON-RPC 数据。
- 未 initialize 就 list/call。
- transport 断开后 pending Promise 永久挂起。
- tools changed 时边删边加，暴露半个 Registry。
- 把 OAuth token 写入 Session。

## 本地源码锚点

- OpenCode：`C:\code\projects\opencode\packages\opencode\src\mcp\index.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\tools.ts`
- Codex：`C:\code\projects\codex\codex-rs\codex-mcp\src\connection_manager.rs`
- Pi：查看 `C:\code\projects\pi\packages\coding-agent` 中的外部工具/扩展示例，并与内部工具 Pipeline 对照。

## 学习记录问题

1. MCP capability negotiation 为什么不能省略？
2. 外部工具为何必须再次通过本地 Policy？
3. tools changed 怎样做到 Registry 原子更新？
4. Server 断开时哪些错误应回传模型，哪些应终止 Run？

