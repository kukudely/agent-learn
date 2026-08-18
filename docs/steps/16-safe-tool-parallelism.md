# 步骤 16：实现安全的工具并行执行

## 本步目标

在保持可重放和权限安全的前提下并行执行独立工具。执行完成顺序可以变化，但写回模型上下文的结果顺序必须与原 tool call 顺序一致。

## 前置条件

- 根 signal、预算账本和统一 Policy Pipeline 已完成。
- 路径写工具可声明资源。
- 顺序 AgentLoop 已有完整回归测试。

## 核心原则

- **执行序与提交序分离**。
- 所有参数校验和权限预检在启动副作用之前完成。
- 工具声明 concurrency mode 和 resource claims。
- 写资源互斥；只读/纯计算在并发上限内运行。
- Shell 默认 sequential。
- 取消后停止接纳新任务，并等待已启动任务收敛。
- 普通 ToolResult 错误不取消其他独立工具；调度器不变量错误才终止批次。

## 推荐契约

```ts
export type ToolConcurrency = "parallel" | "sequential" | "exclusive";

export interface ResourceClaim {
  readonly key: string;
  readonly access: "read" | "write";
}

export interface PlannedToolCall {
  readonly index: number;
  readonly call: ToolInvocation;
  readonly claims: readonly ResourceClaim[];
  readonly decision: PolicyDecision;
}

export class ToolBatchScheduler {
  execute(
    calls: readonly ToolInvocation[],
    context: ToolContext,
    signal: AbortSignal,
  ): Promise<readonly ToolExecutionResult[]>;
}
```

返回数组长度和索引必须严格对应原模型调用顺序。

## 实现步骤

1. 为每个工具定义 concurrency metadata。
2. 规范化并排序 resource key。
3. 按原顺序完成 schema 校验。
4. 按原顺序完成 Policy/Approval 预检。
5. 审批全部确定后才开始本批执行。
6. 为每个调用预分配 result slot。
7. 第一版如果批次包含 sequential 工具，可保守地让整批串行。
8. 否则通过 concurrency limiter 获取槽位。
9. 对 claims 使用 read/write lock；多锁按固定 key 顺序获取。
10. 实时发 started/completed 事件，但不按完成顺序写上下文。
11. 使用 all-settled 语义收集普通结果。
12. 取消时停止启动剩余调用，等待锁和任务释放。
13. 最终按 slot 顺序形成 ToolResult messages。

## 步骤 adapter

创建 `test/step-adapters/step-16.adapter.ts`：

```ts
export function runToolBatchScenario(scenario: string): Promise<{
  status: string;
  maxConcurrency: number;
  completionOrder?: string[];
  resultOrder?: string[];
  maxConcurrentWrites?: number;
  resultStatuses?: string[];
  activeAfter?: number;
}>;
```

支持：

- `reverse-completion`
- `write-conflict`
- `ordinary-error`
- `cancel`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 并行 | 两个慢只读工具最大并发 >= 2 |
| 顺序 | 第二个先完成，但 result order 不变 |
| 资源 | 同文件写串行，不同文件可并行 |
| 混合 | read/write、sequential shell |
| 错误 | 中间工具失败，其余结果保留 |
| 审批 | 等待审批时后项未执行 |
| 取消 | 等槽、等锁、执行中均可取消 |
| 清理 | locks、leases、active task 为 0 |

运行：

```powershell
npm run verify:step -- 16
```

## 退出清单

- [ ] 执行序与提交序分开。
- [ ] 权限预检在副作用之前。
- [ ] 同资源写不会并发。
- [ ] 完成顺序不改变上下文顺序。
- [ ] 普通错误不丢独立结果。
- [ ] 取消后任务和锁收敛。
- [ ] 本步测试通过。

## 常见错误

- `Promise.all` 完成一个就追加一个结果。
- 先执行后审批。
- 只限制 Promise 数量，不锁写资源。
- 任一工具失败就丢掉其他结果。
- 取消后不等待清理。
- 资源 key 未规范化，等价路径拿到不同锁。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\agent\src\agent-loop.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\processor.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\parallel.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\stream_events_utils.rs`

## 学习记录问题

1. 为什么执行序与记录序必须分开？
2. 权限预检等待时能否启动后续只读工具？
3. Resource key 如何规范化？
4. 一个普通工具失败时是否应取消其他工具？

