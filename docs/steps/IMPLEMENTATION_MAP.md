# Step 00–34 实现文件地图

这张表只解决一个问题：**当前步骤的代码建议写在哪里？**

目录和文件名是本课程的推荐组织方式。验收测试主要检查行为，不会要求你必须采用完全相同的内部文件名；但对初学者来说，先使用统一结构更容易学习。

共同规则：

- Step 00–01 不需要 Agent 业务代码。
- Step 02–34 的真实实现写在 `src/`。
- 自己的单元测试写在对应的 `test/<模块>/`。
- 每一步另建 `test/step-adapters/step-XX.adapter.ts` 连接验收题。
- 不要在 Adapter 中实现业务逻辑。

| Step | 本步主要实现位置 | 自己的单元测试位置 |
| --- | --- | --- |
| 00 | `docs/adr/0001-agent-scope.md` | 无，验收直接读 ADR |
| 01 | `package.json`、`tsconfig.json`、`vitest.config.ts`、`src/index.ts` | `test/smoke.test.ts` |
| 02 | `src/core/messages.ts`、`message-validation.ts`、`protocol-version.ts`、`usage.ts` | `test/core/messages.test.ts` |
| 03 | `src/core/events.ts`、`async-event-queue.ts` | `test/core/events.test.ts` |
| 04 | `src/testing/scripted-model.ts` | `test/testing/scripted-model.test.ts` |
| 05 | `src/model/model-client.ts`、`src/model/providers/<provider>.ts` | `test/model/model-client.test.ts` |
| 06 | `src/agent/run-single-turn.ts` | `test/agent/run-single-turn.test.ts` |
| 07 | `src/tools/tool.ts`、`tool-registry.ts`、`tool-validation.ts` | `test/tools/tool-registry.test.ts` |
| 08 | `src/agent/agent-loop.ts` | `test/agent/agent-loop.test.ts` |
| 09 | `src/agent/agent-session.ts` | `test/agent/agent-session.test.ts` |
| 10 | `src/workspace/workspace.ts`、`path-safety.ts` | `test/workspace/path-safety.test.ts` |
| 11 | `src/tools/files/read-file.ts`、`list-directory.ts`、`search-text.ts` | `test/tools/read-only-files.test.ts` |
| 12 | `src/workspace/atomic-write.ts`、`patch.ts` | `test/workspace/writes.test.ts` |
| 13 | `src/tools/shell/shell-executor.ts` | `test/tools/shell-executor.test.ts` |
| 14 | `src/policy/policy.ts`、`rules.ts`、`approval.ts` | `test/policy/policy.test.ts` |
| 15 | `src/runtime/budget.ts`、`cancellation.ts`、`retry.ts` | `test/runtime/runtime-limits.test.ts` |
| 16 | `src/tools/tool-scheduler.ts`、`resource-conflicts.ts` | `test/tools/tool-scheduler.test.ts` |
| 17 | `src/session/session-record.ts`、`append-only-store.ts` | `test/session/append-only-store.test.ts` |
| 18 | `src/session/replay.ts`、`branch.ts`、`recovery.ts` | `test/session/replay.test.ts` |
| 19 | `src/context/context-builder.ts`、`token-budget.ts` | `test/context/context-builder.test.ts` |
| 20 | `src/context/compactor.ts`、`summary-record.ts` | `test/context/compactor.test.ts` |
| 21 | `src/config/config-loader.ts`、`credentials.ts`、`project-trust.ts` | `test/config/config.test.ts` |
| 22 | `src/model/provider-conformance.ts`、`src/model/providers/<second-provider>.ts` | `test/model/provider-conformance.test.ts` |
| 23 | `src/instructions/instruction-loader.ts`、`src/skills/skill-loader.ts` | `test/instructions/instructions.test.ts` |
| 24 | `src/mcp/mcp-client.ts`、`transport.ts`、`tool-adapter.ts` | `test/mcp/mcp-client.test.ts` |
| 25 | `src/plugins/plugin.ts`、`plugin-loader.ts`、`plugin-registry.ts` | `test/plugins/plugins.test.ts` |
| 26 | `src/agent/input-controller.ts`、`src/planning/plan.ts`、`todo.ts` | `test/agent/steering.test.ts` |
| 27 | `src/multi-agent/agent-manager.ts`、`delegation.ts` | `test/multi-agent/multi-agent.test.ts` |
| 28 | `src/server/protocol.ts`、`agent-server.ts` | `test/server/server-protocol.test.ts` |
| 29 | `src/cli/`、需要时增加 `src/clients/` | `test/clients/thin-clients.test.ts` |
| 30 | `src/sandbox/sandbox.ts`、`sandbox-backend.ts`、具体 backend | `test/sandbox/sandbox.test.ts` |
| 31 | `src/observability/trace.ts`、`logger.ts`、`cost.ts`、`audit.ts` | `test/observability/observability.test.ts` |
| 32 | 主要完善已有模块的测试基础设施 | `test/unit/`、`test/integration/`、`test/e2e/` |
| 33 | `src/eval/eval-runner.ts`、`eval-case.ts`、`scoring.ts` | `test/eval/eval-runner.test.ts` |
| 34 | 组合已有模块，必要时只修复真实实现 | `test/capstone/` |

## 每一步都采用相同的目录模式

以 Step 07 为例：

```text
src/tools/
├─ tool.ts                  正式类型和接口
├─ tool-registry.ts         正式功能
└─ tool-validation.ts       正式校验逻辑

test/tools/
└─ tool-registry.test.ts    你写的单元测试

test/step-adapters/
└─ step-07.adapter.ts       调用 src/tools 中的实现

test/steps/
└─ step-07.test.ts          预置验收入口，不改
```

如果某一步的详细文档与本地图有冲突，以该步骤文档列出的契约和 `test/steps` 的验收行为为准。
