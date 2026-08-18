# 步骤 06：实现无工具的单轮 Agent

## 本步目标

完成第一条端到端控制流：用户消息进入 Agent，Agent 调用 ModelClient，持续发出事件，并最终得到一条完整 assistant message。此时不允许调用工具。

## 前置条件

- 消息协议、事件流、Scripted Model 和一个 Provider 适配器已完成。
- 本步测试仍优先使用 Scripted Model。

## 推荐契约

```ts
export type AgentEvent =
  | { readonly type: "turn.started"; readonly runId: string }
  | { readonly type: "model.started"; readonly runId: string }
  | { readonly type: "model.delta"; readonly delta: string }
  | {
      readonly type: "model.completed";
      readonly message: AgentMessage;
    }
  | { readonly type: "turn.completed"; readonly stopReason: StopReason }
  | { readonly type: "turn.failed"; readonly error: AgentError }
  | { readonly type: "turn.cancelled"; readonly reason?: string };

export interface AgentRun<TResult> {
  readonly events: AsyncIterable<AgentEvent>;
  readonly result: Promise<TResult>;
  cancel(reason?: string): void;
}

export function startSingleTurn(
  input: {
    readonly messages: readonly AgentMessage[];
    readonly signal?: AbortSignal;
  },
  dependencies: {
    readonly model: ModelClient;
    readonly createId?: () => string;
    readonly now?: () => number;
  },
): AgentRun<SingleTurnResult>;
```

## 关键不变量

- 每个 Run 恰好一个终态事件。
- `result` 与事件流的终态一致。
- 成功时先完成 assistant message，再完成 turn。
- 失败或取消不能提交一条伪装完整的 assistant message。
- 输入消息不被原地修改。
- 外部 AbortSignal 和 `run.cancel()` 都能到达 ModelClient。

## 实现步骤

1. 在运行前校验输入消息和限制。
2. 创建内部 AbortController，并连接外部 signal。
3. 生成稳定 run ID 并发出 `turn.started`。
4. 发出 `model.started` 后调用 ModelClient。
5. 逐条转发文本 delta，但只由统一 collector 组装最终消息。
6. 检查 finish、usage、stop reason 和输出字节预算。
7. 成功时依次发 `model.completed`、`turn.completed`。
8. Provider/协议错误时发 `turn.failed`。
9. 取消时发 `turn.cancelled`。
10. 在 finally 中关闭流、解绑 signal、释放 timer。
11. 为 terminal event 写一个集中式 guard，禁止双重结束。

## 步骤 adapter

创建 `test/step-adapters/step-06.adapter.ts`：

```ts
export function runSingleTurnScenario(scenario: string): Promise<{
  status: string;
  messages: unknown[];
  eventTypes: string[];
}>;
```

必须支持：

- `text`
- `length`
- `provider-error`
- `abort`

`text` 的 eventTypes 必须至少反映：

```text
turn.started
model.started
model.completed
turn.completed
```

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 正常 | user -> streamed assistant |
| 顺序 | event seq 单调且终态最后出现 |
| 状态 | stop、length 分开表示 |
| 失败 | 两个 delta 后 Provider 抛错 |
| 协议 | 缺 finish、重复 finish |
| 预算 | 输出字节超限 |
| 取消 | 外部 signal、run.cancel |
| 不变性 | 输入消息数组和内容未改变 |

运行：

```powershell
npm run verify:step -- 06
```

## 退出清单

- [ ] 单轮闭环完全由 Fake 测试。
- [ ] 事件和 result 始终一致。
- [ ] 每个 run 只有一个终态。
- [ ] 失败不提交半条 assistant message。
- [ ] 取消能停止模型流。
- [ ] 本步测试通过。

## 常见错误

- 只返回字符串，没有事件。
- 事件报告成功但 result reject。
- 把部分模型输出保存为完整历史。
- 忘记消费或关闭模型流。
- 模型错误后仍发 `turn.completed`。
- 取消只改变本地状态，没有传入 Provider。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\agent\src\agent-loop.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\session\turn.rs`

## 学习记录问题

1. 为什么事件流和最终 Promise 都有价值？
2. 部分模型输出应成为诊断事件还是历史消息？
3. 哪个组件应负责唯一终态？
4. 输出预算应按字符、UTF-8 字节还是 token 计算？

