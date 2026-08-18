# 步骤 26：实现用户输入、Steering、Plan 和 Todo

## 本步目标

把交互状态建模为正式事件：用户问题、回答、运行中 Steering、完成后 Follow-up、结构化 Plan 和 Todo。客户端不需要解析自然语言或日志来猜 Agent 在等待什么。

## 前置条件

- Session 可持久化事件和恢复 state。
- Run 支持 cancel/interrupt。
- Headless 协议尚未实现，但交互状态应先成为内核契约。

## 概念区分

- **Steering**：当前任务仍在运行，改变下一次安全检查点之后的方向。
- **Follow-up**：当前任务结束后再执行的新请求。
- **Question**：Agent 明确暂停并等待用户提供数据或选择。
- **Plan**：对外可观察、可持久化、带 revision 的执行状态。
- **Todo**：计划内部工作项，不是 AgentLoop 的控制栈。

## 推荐事件

```ts
export type InteractionEvent =
  | { type: "input.queued"; inputId: string; mode: "steer" | "follow_up" }
  | { type: "input.consumed"; inputId: string }
  | { type: "question.requested"; question: PendingQuestion }
  | { type: "question.answered"; questionId: string; answer: unknown }
  | { type: "question.cancelled"; questionId: string }
  | { type: "plan.updated"; plan: PlanSnapshot }
  | { type: "todo.updated"; todo: TodoItem };
```

## 推荐契约

```ts
export interface PlanSnapshot {
  readonly revision: number;
  readonly items: readonly {
    id: string;
    text: string;
    status: "pending" | "in_progress" | "completed";
  }[];
}

export interface PendingQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly expiresAt?: string;
}
```

建议 Plan 同时最多一个 `in_progress` 项；更新必须携带 expected revision。

## 安全检查点

Steering 不应在任意指令中间强行修改可变状态。建议只在以下边界消费：

- 模型流结束后；
- 工具批次结束后；
- 进入下一次模型调用前；
- 等待审批/问题的显式状态转换点。

已经启动的副作用工具不因 Steering 自动重跑或撤销。

## 实现步骤

1. 定义 Session 的 waiting_for_input 状态。
2. 实现 QuestionManager 和非交互 fallback。
3. answer/reject/cancel 使用 question ID 和 schema。
4. 实现两条队列：steering 与 follow-up。
5. 给输入分配稳定 ID，持久化 queued/consumed。
6. 在安全检查点按 FIFO 消费 steering。
7. 明确新输入是替换当前目标还是附加约束。
8. follow-up 只在当前 Run 终态后启动。
9. Plan 更新使用 expected revision。
10. 校验 item 状态转换和唯一 in-progress。
11. Todo 工具只提交结构化更新事件。
12. 恢复时重建 pending question、queue、plan 和 todo。
13. 非交互模式有 timeout/default/error，不永久等待。

## 步骤 adapter

创建 `test/step-adapters/step-26.adapter.ts`：

```ts
export function runInteractionScenario(scenario: string): Promise<{
  status: string;
  consumedUserInputs?: string[];
  eventTypes?: string[];
  modelContextInputs?: string[];
  planRevision?: number;
  todos?: Array<{ id: string; status: string }>;
  pendingInputCount?: number;
}>;
```

支持：

- `steer-during-tool`
- `plan-and-todos`
- `stale-plan-update`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| steering | 工具执行中到达，下一模型轮消费 |
| interrupt | 模型流中用户取消 |
| approval | 等待审批时新输入 |
| follow-up | 多个 FIFO 请求 |
| question | answer/reject/cancel/timeout |
| 非交互 | 默认值或明确失败 |
| plan | revision、唯一 in-progress、非法转换 |
| recovery | 重启后 pending question/plan 一致 |
| 竞态 | 同时 answer 与 cancel，只一个获胜 |

运行：

```powershell
npm run verify:step -- 26
```

## 退出清单

- [ ] UI 无需解析日志判断等待状态。
- [ ] Steering 在安全检查点消费。
- [ ] Follow-up 与 Steering 语义分开。
- [ ] Question 在非交互模式不会永久等待。
- [ ] Plan 有 revision 和合法状态转换。
- [ ] 所有交互状态可从事件恢复。
- [ ] 本步测试通过。

## 常见错误

- 把所有新输入都直接追加到 messages。
- Steering 到达时重启整个 turn。
- 等待用户时 Session 状态仍显示 running。
- Plan 只是 prompt 中的 Markdown。
- 没有 question ID，陈旧回答匹配到新问题。
- 非交互运行永久挂起。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\agent-session.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\plan_tool.rs`

## 学习记录问题

1. Steering 与 interrupt 的边界是什么？
2. 新输入何时应覆盖、追加或排队？
3. 为什么 Plan 必须有 expected revision？
4. 已启动副作用期间到达 Steering 应如何处理？

