# 步骤 15：增加取消、超时、预算和重试

## 本步目标

把零散的限制整合成每个 Run 共享的控制对象：一个根取消信号、一个预算账本和一个只对安全操作生效的重试策略。

## 前置条件

- AgentLoop、Tool Pipeline 和 Shell 都接收 AbortSignal。
- 步骤 00 已定义限制字段。
- 已能区分 transient、permanent、aborted 和 outcome unknown。

## 推荐契约

```ts
export interface TurnLimits {
  readonly maxSteps: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxInputTokens: number;
  readonly maxOutputBytes: number;
  readonly maxWallTimeMs: number;
  readonly maxParallelTools: number;
}

export class BudgetLedger {
  reserve(kind: BudgetKind, amount?: number): BudgetLease;
  snapshot(): BudgetSnapshot;
}

export interface RetryPolicy {
  decide(context: RetryContext): {
    readonly retry: boolean;
    readonly delayMs?: number;
    readonly reason: string;
  };
}
```

## 不变量

- 在启动下一次模型/工具操作之前预留预算。
- 预留失败时不能开始外部操作。
- 用户取消优先于 timeout 和 retry。
- 429、部分 5xx、连接前失败可能重试。
- 400、认证失败、协议错误通常不重试。
- 已开始的副作用操作若结果未知，默认不自动重试。
- backoff 必须可取消。
- Run 结束前等待所有已启动操作收敛。

## 实现步骤

1. 建立根 AbortController。
2. 连接外部 signal、wall-time timeout 和显式 cancel。
3. 定义 BudgetKind 和快照。
4. 使用“预留/提交/释放”而非事后计数。
5. 在 AgentLoop、ModelClient、ToolScheduler 入口加入预算预留。
6. 定义标准错误分类。
7. 实现指数退避、上限和可注入 jitter。
8. 测试使用 fake clock 或可注入 sleep。
9. 每次 retry 前再次检查 signal 和预算。
10. 为副作用工具标记 idempotence/outcome。
11. outcome unknown 产生显式终态，等待用户处理。
12. finally 中取消子任务并等待清理。

## 步骤 adapter

创建 `test/step-adapters/step-15.adapter.ts`：

```ts
export function runReliabilityScenario(scenario: string): Promise<{
  status: string;
  attempts: number;
  modelCalls?: number;
  toolCalls?: number;
  sideEffectCount?: number;
  retryDelaysMs?: number[];
  activeOperationsAfter?: number;
}>;
```

支持：

- `max-steps`
- `rate-limit-then-success`
- `bad-request`
- `side-effect-unknown`
- `abort-during-backoff`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 预算 | model、tool、step、输出、wall time |
| 边界 | 最后一个额度正好可用 |
| transient | 429 两次后成功 |
| permanent | 400 只尝试一次 |
| 副作用 | outcome unknown 不重试 |
| 取消 | 模型流、工具、审批、backoff |
| 竞态 | timeout 与用户 cancel 同时触发 |
| 清理 | active operations、timer、listener 为 0 |

运行：

```powershell
npm run verify:step -- 15
```

## 退出清单

- [ ] 每个 Run 只有一个根 signal。
- [ ] 预算在操作前预留。
- [ ] transient/permanent 分类有测试。
- [ ] backoff 可取消。
- [ ] 未知副作用结果不自动重试。
- [ ] 终态前所有子操作收敛。
- [ ] 本步测试通过。

## 常见错误

- 操作完成后才发现超预算。
- 所有 5xx 和网络错误都无限重试。
- retry 整个 turn，重复工具副作用。
- 使用不可取消的 sleep。
- 多层各自创建互不关联的 AbortController。
- Run 已返回但后台操作仍活跃。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\agent\src\agent-loop.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\processor.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\session\turn.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\orchestrator.rs`

## 学习记录问题

1. 为什么预算要预留而不是事后计数？
2. timeout 和 cancel 同时发生时如何选择终态？
3. 哪些模型请求可以安全重试？
4. “副作用结果未知”如何向用户表达？

