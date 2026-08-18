# Adapter 场景目录

本目录补充各步骤文档中的测试矩阵，列出扩展验收会调用的精确 scenario ID。

工作方式：

```text
真实实现
-> test/step-adapters/step-XX.adapter.ts
-> 基础验收
-> 扩展边界/故障验收
```

Adapter 必须导入并调用 `src/` 下的真实实现。不要用固定字面量伪造结果；那只能欺骗测试，不能验证 Agent。

步骤 00–01 不使用 Adapter。步骤 34 的完整场景 ID 已在其独立文档中列出。

## 步骤 02：消息协议

不增加 scenario runner。扩展测试继续调用：

- `createMessageExamples`
- `roundTripMessage`
- `parseMessage`

并验证原对象不变、坏 JSON、未知版本、role/content 不兼容和未知 content type。

## 步骤 03：事件流

不增加 scenario runner。扩展测试继续使用 `createEventStream`，验证 iterator/result 同时观察失败，以及多个终态竞争时第一次生效。

## 步骤 04：Scripted Model

不增加 scenario runner。扩展测试向 `runScriptedModel` 传入：

- 重复 finish；
- 缺失 finish；
- finish 后继续发事件；
- 非法工具 JSON。

这些调用都必须 reject。

## 步骤 05：Provider

`runProviderScenario` 还需支持：

- `server-error`
- `malformed-stream`
- `no-body`
- `connection-interrupted`
- `timeout`
- `abort`

结果需给出稳定 `errorKind`、`retryable`、`activeRequestsAfter` 和 `credentialsExposed`。

## 步骤 06：单轮 Agent

`runSingleTurnScenario` 还需支持：

- `text-invariants`
- `provider-error-invariants`
- `abort-invariants`
- `output-budget`

扩展字段：

```ts
{
  terminalEvents: number;
  resultStatus: string;
  inputUnchanged: boolean;
  outputBytes?: number;
  outputBudgetBytes?: number;
}
```

## 步骤 07：Tool Registry

`runToolRegistryScenario` 还需支持：

- `extra-properties`
- `unserializable-output`
- `cancel`
- `list-isolation`

扩展字段包括 `registryChanged` 和 `activeAfter`。

## 步骤 08：Agent Loop

`runAgentLoopScenario` 还需支持：

- `strict-order`
- `cancel-during-tool`
- `model-fails-after-tool`

扩展字段：

```ts
{
  executionOrder?: string[];
  resultOrder?: string[];
  maxActiveTools?: number;
  activeAfter?: number;
  sideEffectCount?: number;
}
```

## 步骤 09：AgentSession

`runAgentSessionScenario` 还需支持：

- `two-turn-history`
- `snapshot-isolation`
- `two-session-isolation`
- `send-after-close`

## 步骤 10：Workspace

不增加 scenario runner。扩展测试直接向 `createWorkspace` 返回的对象传入：

- POSIX absolute path；
- Windows drive path；
- UNC path；
- NUL；
- root 内尚不存在的创建目标。

## 步骤 11：只读工具

不增加 scenario runner。扩展测试用 `createReadonlyTools` 验证：

- list/search 稳定排序；
- UTF-8 原样读取；
- 目录当文件和文件当目录均拒绝。

## 步骤 12：写入和 Patch

`runPatchScenario` 还需支持：

- `zero-match`
- `multiple-match`
- `atomic-write-failure`
- `utf8-content`

扩展字段包括 `matchCount`、`tempArtifactsAfter` 和 `encoding`。

## 步骤 13：Shell

`runShellScenario` 还需支持：

- `output-limit`
- `environment-filter`
- `missing-executable`
- `invalid-cwd`

扩展字段包括 output bytes/limit、环境可见性和 `activeProcessesAfter`。

## 步骤 14：Policy 与 Approval

`runPolicyScenario` 还需支持：

- `approve-project`
- `approval-cancelled`
- `policy-engine-failure`

安全失败时必须得到 deny、零执行、零审批请求。

## 步骤 15：预算和重试

`runReliabilityScenario` 还需支持：

- `model-call-budget`
- `tool-call-budget`
- `output-budget`
- `wall-timeout`
- `cancel-timeout-race`

竞态场景必须报告 `terminalEvents: 1` 和 `activeOperationsAfter: 0`。

## 步骤 16：安全并行

`runToolBatchScenario` 还需支持：

- `mixed-read-write`
- `approval-gate`
- `cancel-waiting-lock`

扩展字段包括 `startedBeforeDecision` 和 `locksAfter`。

## 步骤 17：Session Repository

`runSessionProtocolScenario` 还需支持：

- `duplicate-id`
- `dangling-parent`
- `future-version`
- `supported-migration`
- `disk-write-failure`

前三个 reject；迁移返回版本；磁盘失败返回句柄清理状态。

## 步骤 18：恢复、分支和重放

`runRecoveryScenario` 还需支持：

- `invalid-transition`
- `cyclic-graph`
- `dangling-parent`
- `clone`
- `valid-import`
- `invalid-import`

clone/import 必须是零 Model/Tool 调用。

## 步骤 19：Context Builder

`buildContextScenario` 还需支持：

- `branch-isolation`
- `exact-budget-boundary`
- `large-tool-result`

扩展字段包括 included/dropped/replaced IDs。

## 步骤 20：Compaction

`runCompactionScenario` 还需支持：

- `below-threshold`
- `above-threshold`
- `inside-hysteresis`
- `cancel-compaction`
- `consecutive-compactions`

连续压缩不能重复 coverage。

## 步骤 21：配置

`runConfigScenario` 还需支持：

- `merge-semantics`
- `source-relative-path`
- `explain-secret`
- `malformed-config`
- `unknown-field`

## 步骤 22：Provider Conformance

每个 Provider 的 `passedScenarios` 还必须包含：

- `multi-tool`
- `mixed-content`
- `server-error`
- `context-overflow`
- `usage`
- `vision-capability`
- `structured-output-capability`

## 步骤 23：Instructions 和 Skills

`runSkillScenario` 还需支持：

- `instruction-precedence`
- `same-priority-duplicate`
- `bad-encoding`
- `archive-symlink`
- `archive-bomb`

后三个必须 reject。

## 步骤 24：MCP

`runMcpScenario` 还需支持：

- `tools-list-changed`
- `malformed-tool-schema`
- `permission-denied`
- `oversized-resource`

## 步骤 25：Plugin

`runPluginScenario` 还需支持：

- `hook-order`
- `before-hook-block`
- `hook-error`
- `incompatible-host`
- `pure-mode`
- `permission-bypass-attempt`

## 步骤 26：交互状态

`runInteractionScenario` 还需支持：

- `multiple-follow-ups`
- `question-answered`
- `question-rejected`
- `question-cancelled`
- `non-interactive-question`
- `recover-pending-question`

## 步骤 27：多 Agent

`runMultiAgentScenario` 还需支持：

- `parallel-children`
- `child-failure`
- `child-timeout`
- `total-budget`
- `child-write-conflict`
- `recover-agent-tree`

## 步骤 28：Server

`runServerScenario` 还需支持：

- `transport-conformance`
- `session-concurrency`
- `workspace-isolation`
- `interrupt-propagation`

## 步骤 29：薄客户端

`runClientScenario` 还需支持：

- `reducer-recording`
- `reconnect`
- `approval-and-question`
- `transport-parity`

## 步骤 30：Sandbox

每个 Backend 的 `passedScenarios` 还必须包含：

- `read-denied`
- `write-denied`
- `network-denied`
- `symlink-escape`
- `subprocess-containment`
- `resource-exhaustion`

顶层结果还需给出 `localFallbackUsed` 和 `reapprovalRequested`。

## 步骤 31：Observability

`runObservabilityScenario` 还需支持：

- `provider-failure`
- `tool-failure`
- `policy-denial`
- `cancelled-run`
- `large-tool-output`
- `multi-agent-trace`

## 步骤 32：测试体系

`inspectTestingArchitecture` 还需报告：

```ts
{
  externalContracts: string[];
  failureInjections: string[];
  regressionTests: number;
  liveSmokeEnabledByDefault: boolean;
}
```

## 步骤 33：Eval

`runAgentEval` 还需支持：

- `result-based-scoring`
- `budget-regression`
- `judge-failure`

## 步骤 34：综合验收

无需额外 scenario runner。完整 15 个稳定场景 ID 见 [步骤 34 文档](34-capstone-acceptance.md)。

