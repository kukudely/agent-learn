# 步骤 29：把 CLI/TUI/IDE 建成薄客户端

## 本步目标

让所有界面只依赖同一个 Client API 和 Event Reducer。替换 CLI、增加 TUI 或 IDE 不需要修改 Agent 内核，也不能在界面层复制 Provider、Tool 或 Session 逻辑。

## 前置条件

- Headless Server 协议和生成的 client types 可用。
- 所有 UI 所需状态都能由事件重建。

## 客户端分层

```text
Transport
  -> Generated/Typed Client
  -> Event Reducer
  -> View Model
  -> CLI/TUI/IDE Renderer
```

只有 Renderer 与具体 UI 框架相关。

## CLI 最小能力

- 新建/恢复 Session；
- 发送 prompt；
- 显示流式文本；
- 显示 ToolCall、审批和进度；
- steering/interrupt；
- 回答 approval/question；
- attach 已有 Server。

## TUI 后续能力

- Session 列表；
- 消息/事件流；
- Tool 状态；
- Permission/Question 对话；
- Model/Agent 切换；
- 本地/attach 模式。

## IDE 后续能力

- 显式文件引用；
- Diff 预览；
- progress；
- permission/question；
- cancel；
- 多 Workspace；
- 点击事件定位文件。

## 推荐契约

```ts
export interface AgentClient {
  send<TCommand, TResult>(
    command: CommandEnvelope<TCommand>,
  ): Promise<TResult>;

  subscribe(options: {
    sessionId: string;
    afterSequence?: number;
    signal?: AbortSignal;
  }): AsyncIterable<ServerEventEnvelope>;
}

export interface ClientState {
  readonly sessionId: string;
  readonly connection: "connecting" | "connected" | "disconnected";
  readonly messages: readonly UiMessage[];
  readonly pendingApproval?: UiApproval;
  readonly pendingQuestion?: UiQuestion;
  readonly plan?: PlanSnapshot;
}

export function reduceClientState(
  state: ClientState,
  event: ServerEventEnvelope,
): ClientState;
```

## 原则

- UI 状态来自 reducer，不解析日志或自然语言。
- UI 不直接访问 ToolRegistry、Provider、SessionStore。
- 本地和 remote attach 复用同一个 Client API。
- 客户端命令只使用协议定义的类型。
- reducer 是纯函数，可用录制事件测试。
- reconnect 使用 sequence cursor。
- UI 渲染失败不能影响 Server Run。
- 敏感字段在协议层已脱敏，UI 再做安全显示。

## 实现步骤

1. 从 Server schema 生成或手写唯一 Client API。
2. 实现 in-process transport client。
3. 实现 remote transport client。
4. 实现纯 Event Reducer。
5. 用录制事件 fixture 驱动 reducer。
6. 先实现非交互 CLI。
7. 增加交互式 approval/question。
8. 增加 reconnect 和 resume。
9. 抽取 ViewModel，不让 Renderer 解释协议细节。
10. TUI/IDE 只复用 Client + Reducer。
11. 静态检查客户端不得 import core Provider/AgentLoop。
12. 对同一事件录制生成跨客户端 transcript snapshot。

## 步骤 adapter

创建 `test/step-adapters/step-29.adapter.ts`：

```ts
export function runClientScenario(scenario: string): Promise<{
  status: string;
  transcripts: Record<string, string[]>;
  directProviderImports: Record<string, number>;
  localAgentLoops: Record<string, number>;
  commandsSent?: string[];
}>;
```

支持：

- `shared-transcript`
- `architecture-boundary`
- `user-actions`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| reducer | 所有 event、未知新 event、重复 sequence |
| transcript | CLI/TUI/IDE 同一语义 |
| command | open/start/steer/cancel |
| reconnect | cursor resume |
| approval | answer/reject/cancel |
| question | schema-driven input |
| 架构 | Provider import = 0，local AgentLoop = 0 |
| transport | local/remote 行为一致 |
| 渲染 | 渲染异常不影响 Server |

运行：

```powershell
npm run verify:step -- 29
```

## 退出清单

- [ ] 客户端只依赖协议和 Client API。
- [ ] Event Reducer 是纯函数。
- [ ] 同一录制流驱动所有客户端。
- [ ] 本地/远程复用同一接口。
- [ ] 客户端无 Provider 和 AgentLoop 逻辑。
- [ ] reconnect 不丢事件。
- [ ] 本步测试通过。

## 常见错误

- CLI 直接 import AgentLoop。
- UI 通过日志字符串判断审批状态。
- 每个客户端维护不同事件类型。
- 本地模式绕过 Server handler。
- reconnect 后重复显示全部历史。
- Renderer 持有可变 Session 对象。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\modes`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\cli`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\server`
- Codex：`C:\code\projects\codex\codex-rs\tui`
- Codex：`C:\code\projects\codex\codex-rs\app-server`

## 学习记录问题

1. 什么逻辑属于 Event Reducer，什么属于 Renderer？
2. 本地模式为何也应通过同一个 handler？
3. 未知新事件应如何兼容显示？
4. 如何通过依赖检查阻止业务逻辑回流客户端？

