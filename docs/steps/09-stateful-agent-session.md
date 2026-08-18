# 步骤 09：实现状态型 AgentSession

## 本步目标

让 Session 保存跨轮消息、累计 usage、运行状态和 revision。一个 Session 同时最多一个 active run，对外只暴露不可变 snapshot。

## 前置条件

- 步骤 08 的 AgentLoop 稳定。
- 已明确成功、失败、取消时的消息提交规则。

## 状态机

```text
idle -> running -> idle
idle -> running -> failed
idle -> running -> cancelled
idle/failed/cancelled -> closed
```

如果允许 failed/cancelled 后继续，需要显式定义它们如何回到 idle。不要靠若干布尔值组合状态。

## 推荐契约

```ts
export type SessionStatus =
  | "idle"
  | "running"
  | "failed"
  | "cancelled"
  | "closed";

export interface SessionSnapshot {
  readonly id: string;
  readonly status: SessionStatus;
  readonly revision: number;
  readonly messages: readonly AgentMessage[];
  readonly usage: Usage;
  readonly activeRunId?: string;
  readonly lastError?: AgentError;
}

export class AgentSession {
  snapshot(): SessionSnapshot;
  send(userMessage: AgentMessage, options?: RunOptions): AgentRun<AgentLoopResult>;
  cancel(reason?: string): void;
  close(): void;
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
}
```

## 提交规则

- `send` 开始时原子接纳 user message 并进入 running。
- 成功时提交本次完整 assistant/tool 消息。
- 普通工具错误属于已完成历史。
- 未完成 assistant message 不进入历史。
- 已完整完成的工具调用/结果建议保留，避免隐瞒副作用。
- 每次可观察状态变化都递增 revision。

## 实现步骤

1. 写状态迁移表及守卫函数。
2. 校验并复制初始历史。
3. 在 `send` 入口同步占用运行槽，避免竞态。
4. 把 AgentLoop 事件映射成 Session 状态。
5. 在明确提交点合并消息，不共享 Loop 可变数组。
6. 实现累计 usage。
7. snapshot 做深度不可变快照。
8. listener 使用副本迭代，异常只记录不破坏主流程。
9. unsubscribe 幂等。
10. cancel 传播到 active run。
11. close 后拒绝 send。
12. 两个 Session 共用 ModelClient/Registry 时仍保持历史隔离。

## 步骤 adapter

创建 `test/step-adapters/step-09.adapter.ts`：

```ts
export function runAgentSessionScenario(scenario: string): Promise<{
  status: string;
  eventTypes: string[];
  activeOperations: number;
}>;
```

支持：

- `concurrent-prompt`
- `interrupt`
- `subscriber-error`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| snapshot | 初始状态、revision、不可变性 |
| 连续轮次 | 第二次模型请求包含第一轮完整历史 |
| 并发 | 同一 Session 第二个 send 被拒绝 |
| 取消 | active 操作归零并回到可用状态 |
| 订阅 | 通知顺序、unsubscribe、listener 抛错 |
| 关闭 | closed 后 send/cancel 行为明确 |
| 隔离 | 两个 Session 历史不串线 |
| 提交 | 无半条 assistant，已完成副作用不丢失 |

运行：

```powershell
npm run verify:step -- 09
```

## 退出清单

- [ ] 状态迁移表完整。
- [ ] 同一 Session 没有并发 send。
- [ ] snapshot 不暴露内部可变引用。
- [ ] revision 单调。
- [ ] 失败和取消后的提交语义有测试。
- [ ] listener 异常不影响 Session。
- [ ] 本步测试通过。

## 常见错误

- Session 只是消息数组别名。
- 失败后永久卡在 running。
- 并发 send 交叉写历史。
- 取消后 active operation 不归零。
- listener 异常中断业务流程。
- 用回滚隐藏已经发生的工具副作用。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\agent\src\agent.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\session-manager.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\message-v2.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\session\turn.rs`
- Codex：`C:\code\projects\codex\codex-rs\rollout\src\recorder.rs`

## 学习记录问题

1. Session 应事务性回滚还是保留部分成功事实？
2. 为什么 history 与 event log 不完全相同？
3. 并发 send 应排队还是拒绝？首版为何选择其一？
4. revision 如何帮助客户端避免陈旧更新？

