# Agent 学习步骤索引

> JS/TS 初学者或不知道应该改哪个文件：先完成 [JS/TS 初学者从这里开始](START_HERE.md)。

仓库分工：`src` 写真实实现；`test` 写自己的单元测试；`test/steps` 是预置验收题；`test/step-adapters` 把真实实现接给验收题。
这里把 [`AGENT_LEARNING_PLAN.md`](../AGENT_LEARNING_PLAN.md) 中的 35 个步骤拆成可独立执行的实现手册。路线按技术依赖组织，不按天、周或月安排。

先阅读 [分步骤验证机制](TESTING.md)；实现 Adapter 时同时查看 [精确场景目录](ADAPTER_SCENARIOS.md)。完成任一步骤后：

```powershell
# 只调试当前步骤
npm run verify:step -- 08 --only

# 验证当前步骤及全部前置步骤
npm run verify:step -- 08
```

除步骤 00–01 直接检查仓库材料外，步骤 02–34 都需要创建对应的 `test/step-adapters/step-XX.adapter.ts`。Adapter 只把你的真实实现映射到验收接口，不能在里面重写功能。

## 阶段一：最小 Agent Kernel

- [步骤 00：范围、术语和不可变约束](00-scope-and-invariants.md)
- [步骤 01：项目骨架和质量基线](01-project-skeleton-and-quality-baseline.md)
- [步骤 02：消息和内容块协议](02-message-and-content-protocol.md)
- [步骤 03：异步事件流](03-async-event-stream.md)
- [步骤 04：Scripted/Fake Model](04-scripted-model.md)
- [步骤 05：ModelClient 和真实 Provider](05-model-client-and-real-provider.md)
- [步骤 06：无工具单轮 Agent](06-single-turn-agent.md)
- [步骤 07：工具协议和注册表](07-tool-contract-and-registry.md)
- [步骤 08：顺序工具 Agent Loop](08-sequential-tool-agent-loop.md)
- [步骤 09：状态型 AgentSession](09-stateful-agent-session.md)

阶段出口：能用 Fake Model 完成多轮文本与顺序工具调用；取消、错误和预算都可观察。

## 阶段二：本地能力与安全控制

- [步骤 10：Workspace 和路径安全](10-workspace-and-path-security.md)
- [步骤 11：只读文件工具](11-read-only-file-tools.md)
- [步骤 12：受控写入和补丁](12-controlled-writes-and-patches.md)
- [步骤 13：Shell Executor](13-shell-executor.md)
- [步骤 14：权限规则和审批](14-permissions-and-approvals.md)
- [步骤 15：取消、预算和重试](15-cancellation-budgets-and-retries.md)
- [步骤 16：安全工具并行](16-safe-tool-parallelism.md)

阶段出口：文件与进程副作用都有路径边界、权限决策、冲突检测、取消和资源收敛。

## 阶段三：持久化和上下文

- [步骤 17：Append-only Session 协议](17-append-only-session-protocol.md)
- [步骤 18：恢复、分支和重放](18-recovery-branching-and-replay.md)
- [步骤 19：Context Builder](19-context-builder.md)
- [步骤 20：上下文压缩](20-context-compaction.md)
- [步骤 21：配置、凭据和项目信任](21-configuration-credentials-and-project-trust.md)

阶段出口：Session 可重启、分支和零副作用重放；上下文选择与压缩可解释且不丢原始事实。

## 阶段四：扩展和交互

- [步骤 22：第二 Provider 一致性](22-second-provider-conformance.md)
- [步骤 23：Instructions 和 Skills](23-instructions-and-skills.md)
- [步骤 24：MCP Client](24-mcp-client.md)
- [步骤 25：Plugin/Extension 系统](25-plugin-extension-system.md)
- [步骤 26：用户输入、Steering、Plan 和 Todo](26-user-input-steering-plan-todo.md)

阶段出口：Provider、Skill、MCP 和 Plugin 都有来源、能力和信任边界，并且不能绕过 Tool Pipeline。

## 阶段五：平台化

- [步骤 27：最小多 Agent](27-minimal-multi-agent.md)
- [步骤 28：Headless Server 和协议](28-headless-server-protocol.md)
- [步骤 29：薄 CLI/TUI/IDE 客户端](29-thin-clients.md)
- [步骤 30：可替换 Sandbox Backend](30-sandbox-backends.md)

阶段出口：多 Agent 生命周期受限；客户端和内核解耦；执行 Backend 可替换；Policy 与 Sandbox 职责分离。

## 阶段六：验证和发布

- [步骤 31：Trace、日志、成本和审计](31-trace-logging-cost-audit.md)
- [步骤 32：分层测试体系](32-layered-testing.md)
- [步骤 33：Agent Eval](33-agent-eval.md)
- [步骤 34：综合项目验收](34-capstone-acceptance.md)

阶段出口：能从 trace 解释任意失败，用固定 Eval 比较版本，并通过 15 个产品级综合场景。

## 三种验证命令

```powershell
# 日常工程测试，不加载尚未实现的未来关卡
npm test

# 单步调试；仍会先运行 typecheck、lint 和日常测试
npm run verify:step -- 12 --only

# 累计回归；步骤 00 到目标步骤全部执行
npm run verify:step -- 12

# 最终全部步骤
npm run verify:all
```

如果某一步 adapter 尚不存在，测试会打印准确路径和缺少的 export。验收期望的最终权威来源是 `test/steps/step-XX.test.ts`；步骤文档解释为什么要满足这些行为以及推荐怎样实现。

