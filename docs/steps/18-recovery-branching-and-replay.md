# 步骤 18：实现恢复、分支和重放

## 本步目标

从 append-only 事件纯函数恢复 SessionState；允许从任意历史节点创建分支；提供完全不调用模型、工具和 Policy 的事件重放。

## 前置条件

- 步骤 17 的协议和 Repository 已稳定。
- 所有副作用的 started/completed/failed/interrupted 事件定义清楚。

## 核心区别

- **Resume**：从当前 active leaf 继续真实运行。
- **Recover**：把崩溃时未完成的操作标记为 interrupted/cancelled。
- **Branch**：在同一 Session 图中从旧节点产生新 leaf，不删除原历史。
- **Clone**：复制到新 Session，并记录来源。
- **Replay**：只把已记录事件交给 sink，绝不执行能力。

## 推荐契约

```ts
export interface SessionState {
  readonly sessionId: string;
  readonly activeLeafId: string;
  readonly status: string;
  readonly messages: readonly AgentMessage[];
  readonly pendingApprovals: readonly string[];
  readonly interruptedOperations: readonly string[];
  readonly lastSequence: number;
}

export function reduceSession(
  header: SessionHeader,
  events: readonly PersistedSessionEvent[],
): SessionState;

export function buildSessionGraph(
  events: readonly PersistedSessionEvent[],
): SessionGraph;

export function activePath(
  graph: SessionGraph,
  leafId: string,
): readonly PersistedSessionEvent[];

export function replaySession(
  events: readonly PersistedSessionEvent[],
  sink: { onEvent(event: PersistedSessionEvent): void | Promise<void> },
  signal?: AbortSignal,
): Promise<void>;
```

## 恢复规则

- `model.started` 无终态 -> 追加 `model.interrupted`。
- `tool.started` 无终态 -> 追加 `tool.interrupted`，不能自动重跑。
- `approval.requested` 无终态 -> 首版建议追加 `approval.cancelled`，之后重新请求。
- 恢复事件 sequence 继续递增。
- reducer 不读取当前时间、文件系统、网络或随机数。

## 实现步骤

1. 列出每种 event 对 state 的转移。
2. 用穷尽 `switch` 实现纯 reducer。
3. 构建事件图并拒绝重复 ID、环和悬空 parent。
4. 从 root 到 active leaf 投影消息。
5. 为 crash fixture 实现 recovery planner。
6. recovery planner 只生成“事实事件”，不调用能力。
7. branch 追加显式 branch/active-leaf 事件。
8. 切换分支不删除旧节点。
9. clone 重新映射 ID，并保留 sourceSessionId/sourceEventId。
10. replay 的依赖中不出现 ModelClient、ToolRegistry、Policy。
11. export 包含 schema、checksum 和 provenance。
12. import 先全量验证，再原子写入。

## 步骤 adapter

创建 `test/step-adapters/step-18.adapter.ts`：

```ts
export function runRecoveryScenario(scenario: string): Promise<{
  status: string;
  modelCalls: number;
  toolCalls: number;
  events?: string[];
  originalBranchIntact?: boolean;
  activePath?: string[];
  replayedEventIds?: string[];
}>;
```

支持：

- `model-crash`
- `tool-crash`
- `approval-crash`
- `branch`
- `replay`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| reducer | 每种 event、非法转移、确定性 |
| graph | 多层分支、环、悬空 parent |
| crash | model/tool/approval 未完成 |
| branch | 新 leaf、旧分支仍可读 |
| clone | ID 重映射和来源 |
| replay | event 顺序、取消、sink 失败 |
| 零副作用 | model/tool spy 调用均为 0 |
| import | checksum/版本失败不半导入 |

运行：

```powershell
npm run verify:step -- 18
```

## 退出清单

- [ ] reducer 是纯函数。
- [ ] 恢复不自动重跑副作用。
- [ ] active leaf 被持久化。
- [ ] branch 不修改旧事件。
- [ ] replay 无任何能力依赖。
- [ ] import 先验证再写入。
- [ ] 本步测试通过。

## 常见错误

- 恢复时重新执行 pending 工具。
- active branch 只存在内存。
- branch 复制并修改旧事件。
- replay 直接调用 AgentLoop。
- import 边验证边写导致半导入。
- reducer 使用 `Date.now()`。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\session-manager.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\test\session-manager\tree-traversal.test.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\revert.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\message-v2.ts`
- Codex：`C:\code\projects\codex\codex-rs\thread-store\src\local\mod.rs`

## 学习记录问题

1. 哪些未完成状态必须标记 interrupted？
2. approval 恢复为何建议重新询问？
3. branch 和 clone 有什么差别？
4. 如何用依赖图和 spy 同时证明 replay 零副作用？

