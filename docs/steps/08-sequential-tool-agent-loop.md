# 步骤 08：实现顺序工具调用 Agent Loop

## 本步目标

完成核心循环：

```text
model -> tool calls -> tool results -> model -> final answer
```

同一次模型响应中的工具必须按出现顺序执行。直到步骤 16 之前，不允许用 `Promise.all` 并行工具。

## 前置条件

- 步骤 04 的 Scripted Model。
- 步骤 07 的 ToolRegistry。
- 步骤 06 的运行事件和终态语义。

## 推荐算法

1. 防御性复制初始历史。
2. 在每次模型调用前检查 `maxSteps/maxTurns`。
3. 把 ToolRegistry specs 传给模型。
4. 收集完整 assistant message。
5. 若没有 tool call，提交消息并结束。
6. 若存在 tool call：
   - 先提交包含调用块的 assistant message；
   - 按内容块顺序逐个调用 Registry；
   - 每个调用前检查预算和取消；
   - 将每个结果追加为 tool message；
   - 普通工具错误作为 `isError: true` 结果回传模型。
7. 进入下一次模型调用。
8. 汇总 usage、steps 和 tool call 数。
9. 发出唯一终态。

## 推荐契约

```ts
export interface AgentLoopResult {
  readonly messages: readonly AgentMessage[];
  readonly finalMessage: AgentMessage;
  readonly stopReason: StopReason;
  readonly usage: Usage;
  readonly steps: number;
  readonly toolCalls: number;
}

export function startAgentLoop(
  input: AgentLoopInput,
  dependencies: {
    readonly model: ModelClient;
    readonly tools: ToolRegistry;
  },
): AgentRun<AgentLoopResult>;
```

需要增加 `tool.started`、`tool.completed`、`limit.reached` 等事件。

## 副作用提交规则

- 在执行器开始后，不能假设工具没有产生副作用。
- 模型在工具完成后失败时，不能自动重新执行整个 turn。
- ToolResult 是副作用已经发生或明确失败的事实。
- 未知工具和参数错误没有执行副作用，可以安全回传模型修正。

## 实现步骤

1. 先实现“无工具”路径，确保等价于步骤 06。
2. 实现单工具两次模型请求。
3. 固定 assistant tool call 和 tool result 的消息顺序。
4. 实现同一响应多个工具的严格串行。
5. 将普通错误转为 ToolResult。
6. 分离可恢复工具错误与取消/内核错误。
7. 在操作之前扣减预算。
8. 对每个 tool call ID 保证恰好一个结果。
9. 累加多轮 usage。
10. 写 active executor 计数器，测试最大值只能为 1。

## 步骤 adapter

创建 `test/step-adapters/step-08.adapter.ts`：

```ts
export function runAgentLoopScenario(scenario: string): Promise<{
  status: string;
  steps: number;
  toolCalls: Array<{
    id: string;
    resultCount: number;
    isError?: boolean;
  }>;
  finalText?: string;
}>;
```

支持：

- `single-tool`
- `multiple-tools`
- `invalid-tool-arguments`
- `max-steps`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 文本 | 无工具时一次模型调用结束 |
| 单工具 | 工具结果进入第二次模型上下文 |
| 多工具 | 严格按声明顺序执行 |
| 关联 | 每个 call ID 恰有一个 result |
| 恢复 | 参数错误和工具错误回传模型 |
| 预算 | max steps、tool calls、output bytes |
| 取消 | 工具执行期间取消 |
| 副作用 | 工具完成后模型失败，不重复执行 |

运行：

```powershell
npm run verify:step -- 08
```

## 退出清单

- [ ] 文本、单工具和多工具都通过。
- [ ] 工具执行最大并发为 1。
- [ ] 每个调用只有一个结果。
- [ ] 普通工具错误可以由模型纠正。
- [ ] 预算在下一次操作前生效。
- [ ] 副作用工具不会被隐式重试。
- [ ] 本步测试通过。

## 常见错误

- 对 tool calls 使用 `Promise.all`。
- 模型请求前后重复追加消息。
- 工具错误直接终止整个 Run。
- 达到预算后仍多调用一次模型。
- 重试整个 turn 导致工具重复执行。
- ToolResult 名称或 ID 与调用不一致。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\agent\src\agent-loop.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\tools.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\orchestrator.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\session\turn.rs`

## 学习记录问题

1. 为什么普通工具错误属于模型上下文，而取消不属于？
2. 哪个提交点决定工具能否被重试？
3. 为什么先提交 assistant tool call 再执行工具？
4. `maxSteps` 应统计模型调用、工具调用还是循环推进？

