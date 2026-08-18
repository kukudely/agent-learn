# 步骤 27：实现最小多 Agent

## 本步目标

管理多个独立 AgentSession 的生命周期、预算、权限和通信。多 Agent 不是简单 `Promise.all(modelCalls)`；它需要明确父子关系、join、取消传播和资源冲突。

## 前置条件

- 单 Agent 的 Session、预算、Policy 和持久化稳定。
- 安全并行调度与资源锁可复用。
- 交互事件和 Plan 已结构化。

## 第一版限制

- 子 Agent 只读。
- 不允许后台永久任务。
- 父 Agent 必须显式 wait/join。
- 子结果以结构化 ToolResult 回到父 Agent。
- 权限只能继承或收紧，不能扩大。
- 每个子 Agent 有独立消息历史和预算。

## 推荐契约

```ts
export interface SpawnAgentRequest {
  readonly parentSessionId: string;
  readonly task: string;
  readonly limits: Partial<TurnLimits>;
  readonly permissionCeiling: PermissionPolicy;
}

export interface AgentHandle {
  readonly agentId: string;
  readonly sessionId: string;
  wait(signal?: AbortSignal): Promise<AgentResult>;
  send(message: AgentMessage): Promise<void>;
  interrupt(reason?: string): Promise<void>;
  close(): Promise<void>;
}

export interface AgentManager {
  spawn(request: SpawnAgentRequest): Promise<AgentHandle>;
  list(): readonly AgentSnapshot[];
  get(agentId: string): AgentSnapshot | undefined;
  close(): Promise<void>;
}
```

## 不变量

- agent ID 和 session ID 稳定且不同。
- 每个子消息历史独立。
- parent/child 关系持久化。
- 子权限是 `intersection(parent, requested)`。
- 根取消沿树向下传播。
- 子失败不自动取消所有 sibling，除非父策略明确。
- 最大并发、深度、总 token/cost、存活时间均限制。
- ancestry 中不能出现环。
- 父结束前所有非后台子 Agent 必须收敛。

## 实现步骤

1. 定义 Agent tree event 和 snapshot。
2. 实现 Registry，按 ID 管理 handle。
3. spawn 时校验 parent 存在、depth 和 concurrency。
4. 创建独立 Session 和 BudgetLedger。
5. 计算权限 ceiling，禁止子级放宽。
6. 将 task 作为明确 user input，而不是共享父 messages。
7. 实现 wait/join 和结构化结果。
8. 实现 parent <-> child message envelope。
9. 取消沿树传播，并等待所有子级。
10. 子失败转换为父可观察结果。
11. Agent tree 写入 Session Repository。
12. 加入总 token/cost budget。
13. 后续若允许写工具，先加独立工作树或 resource locks。

## 步骤 adapter

创建 `test/step-adapters/step-27.adapter.ts`：

```ts
export function runMultiAgentScenario(scenario: string): Promise<{
  status: string;
  childCount?: number;
  maxDepthObserved?: number;
  messages?: Array<{ from: string; to: string; body: string }>;
  parentReceived?: unknown;
  childPermissionsWithinParent?: boolean;
  activeChildrenAfter?: number;
  cycleDetected?: boolean;
}>;
```

支持：

- `spawn-and-join`
- `message-routing`
- `limits`
- `cycle`
- `parent-cancel`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 生命周期 | spawn、wait、close、list |
| 并行 | 多个子 Agent，最大并发 |
| 深度 | 超限拒绝 |
| 通信 | stable from/to IDs |
| 失败 | 子失败、超时、模型错误 |
| 取消 | 父取消向下传播 |
| 权限 | 子不能扩大父权限 |
| 隔离 | messages、budget 不共享可变对象 |
| 资源 | 同文件写冲突 |
| 恢复 | 重启后 Agent tree 可列举 |

运行：

```powershell
npm run verify:step -- 27
```

## 退出清单

- [ ] Agent tree 可列举和恢复。
- [ ] 每个 Agent 有独立 Session。
- [ ] 权限只能收紧。
- [ ] depth/concurrency/cost 均受限。
- [ ] 取消沿树传播。
- [ ] 父结束后无活跃子任务。
- [ ] 本步测试通过。

## 常见错误

- 多个 Agent 共享 messages 数组。
- 子 Agent 自动继承更宽权限。
- 父返回后子任务仍运行。
- spawn 不检查 ancestry cycle。
- 子 Agent 直接写父 Session。
- 用全局预算计数但无原子预留。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\examples\extensions\subagent\index.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\task.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\agent\control.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\agent\registry.rs`

## 学习记录问题

1. 多 Agent 为什么需要独立 Session？
2. 子权限如何与父 Policy 求交集？
3. 子失败应取消 sibling 吗？
4. 什么情况下需要独立 Git worktree？

