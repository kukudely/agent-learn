# 步骤 28：实现 Headless Server 和协议

## 本步目标

把 Agent Runtime 与客户端解耦。Server 持有 Session 和执行，CLI/TUI/IDE 只发送版本化命令并消费事件。本地 in-process 和远程 transport 共用同一 handler。

## 前置条件

- Session 所有状态都可通过 command/event 表达。
- append-only Repository 支持 cursor/sequence。
- 权限、问题和 Agent tree 都是结构化状态。

## 最小 API

- session create/get/list；
- turn start/steer/cancel；
- history；
- event subscribe/resume；
- pending approval/question；
- approval/question reply；
- agent list/status。

## 推荐协议 envelope

```ts
export interface CommandEnvelope<T = unknown> {
  readonly protocolVersion: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly sessionId?: string;
  readonly type: string;
  readonly payload: T;
}

export interface ServerEventEnvelope<T = unknown> {
  readonly protocolVersion: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly type: string;
  readonly payload: T;
}
```

## 核心规则

- Server 持有执行状态。
- Session 与 Workspace 显式关联，不使用进程全局 cwd。
- 同一 Session 的命令串行。
- 不同 Session 可并发。
- 事件有 sequence/cursor，支持断线补发。
- 命令有 idempotency key，客户端重试不重复副作用。
- 慢消费者有有界缓冲和明确断开/补发策略。
- 外部监听默认认证。
- 版本不兼容在执行命令前拒绝。
- Client 断开时运行是取消还是继续，必须按命令/Session 策略决定。

## 实现步骤

1. 先定义 JSON Schema/OpenAPI，而不是先写 HTTP handler。
2. 实现 command dispatcher 和 event reducer。
3. 实现 in-process transport 作为 conformance 基准。
4. 添加 JSON-RPC stdio 或 HTTP + SSE。
5. 建立 session-scoped serial queue。
6. 将每个 command 映射到内核公开 API。
7. 保存 idempotency key -> result/event range。
8. subscribe 接受 `afterSequence`。
9. 补发时按 sequence 去重且不遗漏。
10. 为慢消费者设置最大 buffer。
11. 增加认证和 workspace authorization。
12. 处理 disconnect、reconnect 和 interrupt。
13. in-process 与 HTTP 跑同一 contract suite。
14. 由 schema 生成 client types。

## 步骤 adapter

创建 `test/step-adapters/step-28.adapter.ts`：

```ts
export function runServerScenario(scenario: string): Promise<{
  status: string;
  negotiatedVersion?: string;
  replayedSequence?: number[];
  duplicateSideEffects?: number;
  maxBufferedEvents?: number;
  authenticated?: boolean;
  activeRunsAfterDisconnect?: number;
}>;
```

支持：

- `connect-command-resume`
- `duplicate-command`
- `slow-client`
- `disconnect`
- `unauthenticated`
- `incompatible-version`

后两个场景应 reject。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| contract | schema、版本、未知 command |
| transport | in-process 与 HTTP/stdio 一致 |
| resume | cursor 补发无重无漏 |
| 幂等 | 重试 command 只产生一次副作用 |
| 并发 | 同 Session 串行，不同 Session 并行 |
| backpressure | 慢客户端缓冲有界 |
| workspace | Session 不混淆 root |
| auth | 未认证和越权拒绝 |
| disconnect | cancel/continue 策略和资源清理 |
| interrupt | signal 到达内核 |

运行：

```powershell
npm run verify:step -- 28
```

## 退出清单

- [ ] 内核与客户端通过协议解耦。
- [ ] in-process 和远程 transport 行为一致。
- [ ] cursor 补发无重无漏。
- [ ] command retry 不重复副作用。
- [ ] 慢消费者有界。
- [ ] 外部监听需要认证。
- [ ] 本步测试通过。

## 常见错误

- HTTP handler 直接操作 AgentLoop 内部对象。
- 使用全局 cwd。
- 客户端重试导致重复工具执行。
- SSE 断线后从头重放全部事件。
- 每个客户端自定义一套事件字段。
- 慢客户端导致 Server 无限缓存。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\modes\rpc`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\server\server.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\cli\cmd\run.ts`
- Codex：`C:\code\projects\codex\codex-rs\app-server\README.md`

## 学习记录问题

1. 为什么 Server 而不是 Client 持有 Session？
2. cursor 和 idempotency key 分别解决什么问题？
3. Client 断开时 Run 应继续还是取消？
4. 同 Session 串行如何与多客户端协作？

