# 步骤 34：完成综合项目验收

## 本步目标

用产品级场景证明前 34 个步骤形成一个完整、可恢复、可扩展、可审计且有安全边界的 Agent Runtime。任何场景都必须通过公开 API 和真实模块组合完成，不能由 adapter 伪造结果。

## 前置条件

- 步骤 00–33 全部通过。
- 默认测试、步骤测试、E2E 和离线 Eval 均可运行。
- 有固定 capstone fixture、Fake Provider、Fake MCP Server 和可替换 Backend。

## 验收场景

### 1. Plain conversation

- 无需工具的问题；
- Agent 不调用工具；
- 流式返回；
- trace 完整。

### 2. Read and answer

- 列目录、搜索、读取；
- 不触发写权限；
- 回答包含准确相对路径和证据。

### 3. Patch with approval

- 读取目标和测试；
- 生成 patch；
- 请求写审批；
- 通过 CAS 写入；
- 不覆盖并发修改；
- 展示 diff。

### 4. Shell denied

- 请求危险或未授权命令；
- Policy deny；
- Executor 调用为 0；
- Audit 记录原因。

### 5. Cancel mid-run

- 长模型流或 Shell；
- 用户 interrupt；
- 父子进程和子 Agent 收敛；
- Session 回到稳定状态。

### 6. Provider retry

- 429/瞬时断连后恢复；
- retry 受预算限制；
- 不重复副作用。

### 7. Session restart

- Tool 期间模拟崩溃；
- reopen 后标记 interrupted；
- 不自动重跑；
- sequence 连续。

### 8. Branch and replay

- 从旧节点创建分支；
- 原分支仍可读；
- replay 不调用 Model/Tool。

### 9. Context compaction

- 长会话触发压缩；
- 目标、约束、文件事实保留；
- 原事件不删除；
- 继续完成任务。

### 10. MCP tool

- 连接 Fake MCP Server；
- 远程工具经过 Policy；
- Server 崩溃后 Agent 仍能继续内建能力。

### 11. Plugin and Skill

- 信任后加载；
- Skill 惰性；
- Plugin lifecycle 完整；
- 二者均不能绕 Policy。

### 12. Multi-agent

- 两个只读子 Agent 并行；
- 独立 Session 和预算；
- 父汇总；
- 深度/并发限制有效。

### 13. Headless client

- CLI/TUI 测试客户端通过协议运行同一 Session；
- reconnect cursor 无重无漏；
- Client 不 import AgentLoop。

### 14. Sandbox violation

- 文件内容尝试 prompt injection 和工作区外访问；
- 被当作不可信数据；
- Sandbox/Workspace 阻止逃逸；
- 不自动升级执行。

### 15. Audit and cost

- 从 trace/audit 还原 user -> model -> policy -> tool -> result；
- token、cost、duration 可汇总；
- 无 secret。

## 验收报告协议

```ts
export interface CapstoneAcceptanceResult {
  readonly status: "passed" | "failed";
  readonly passedScenarios: readonly string[];
  readonly failedScenarios: readonly string[];
  readonly invariantViolations: readonly string[];
  readonly unhandledRejections: number;
  readonly leakedResources: number;
  readonly secretsExposed: boolean;
  readonly replayDeterministic: boolean;
}
```

每个场景还应保存：

- fixture/version；
- config hash；
- commands；
- event range；
- trace ID；
- assertions；
- elapsed/token/cost；
- artifact paths。

## 实现步骤

1. 冻结 capstone fixture 和版本。
2. 给每个场景写独立 setup/teardown。
3. 只通过公共 Agent/Server API 驱动。
4. 使用离线 Scripted/Recorded Provider。
5. 对副作用检查最终文件、diff、process 和 audit。
6. 对失败场景验证“不应该发生的调用”为 0。
7. 每个场景结束检查 active runs/tasks/processes/locks/listeners。
8. 收集 unhandled rejection 和 console error。
9. 扫描事件、Session、logs、trace、artifacts 中的 secrets。
10. 对 replay 重复运行并比较 fingerprint。
11. 生成机器可读 JSON 和面向人的 Markdown 报告。
12. 任一安全不变量违反则整个验收失败。
13. 报告必须能给出单场景重跑命令。
14. 在干净安装/构建后再完整运行一次。

## 步骤 adapter

创建 `test/step-adapters/step-34.adapter.ts`：

```ts
export function runCapstoneAcceptance(): Promise<{
  status: string;
  passedScenarios: string[];
  failedScenarios: string[];
  invariantViolations: string[];
  unhandledRejections: number;
  leakedResources: number;
  secretsExposed: boolean;
  replayDeterministic: boolean;
}>;
```

`passedScenarios` 使用以下稳定 ID：

- `plain-conversation`
- `read-and-answer`
- `patch-with-approval`
- `shell-denied`
- `cancel-mid-run`
- `provider-retry`
- `session-restart`
- `branch-and-replay`
- `context-compaction`
- `mcp-tool`
- `plugin-and-skill`
- `multi-agent`
- `headless-client`
- `sandbox-violation`
- `audit-and-cost`

## 测试矩阵

| 类别 | 验证 |
| --- | --- |
| 功能 | 15 个场景全部通过 |
| 安全 | deny 零执行、无路径/沙箱逃逸 |
| 恢复 | interrupted 不重跑 |
| 确定性 | replay fingerprint 一致 |
| 协议 | client reconnect 无重无漏 |
| 扩展 | MCP/Plugin/Skill 统一权限 |
| 多 Agent | 权限、预算、树生命周期 |
| 可观测 | trace/audit/cost 完整 |
| 清理 | 无进程、task、lock、listener 泄漏 |
| 秘密 | 全 artifact 扫描为 0 |

运行：

```powershell
npm run verify:step -- 34
```

完整累计验收：

```powershell
npm run verify:all
```

## 最终退出清单

- [ ] 00–34 所有步骤契约通过。
- [ ] 15 个 capstone 场景通过。
- [ ] failed scenarios 为空。
- [ ] invariant violations 为空。
- [ ] unhandled rejections 为 0。
- [ ] leaked resources 为 0。
- [ ] secrets exposed 为 false。
- [ ] replay deterministic 为 true。
- [ ] 默认测试和构建仍通过。
- [ ] 报告可在干净环境复现。

## 常见错误

- adapter 返回写死的 passed。
- 验收绕过公共 API 直接调用内部实现。
- 只检查最终文本，不检查副作用和 audit。
- 场景共享 Workspace 导致相互污染。
- 安全违规被总分平均掉。
- 跑完测试仍残留 MCP/Shell/Agent 进程。

## 本地源码锚点

- Pi：最小 AgentLoop、Session、Tool、Extension 组合。
- OpenCode：Server、Provider、Tool、MCP、Plugin 组合。
- Codex：Protocol、Policy、Sandbox、Multi-Agent、App Server 和 Observability 组合。
- 总体导航：`docs/AGENT_LEARNING_PLAN.md`。

## 学习记录问题

1. 哪些 capstone 失败属于内核错误，哪些属于 fixture/Provider 错误？
2. 如何证明 adapter 没有伪造结果？
3. 为什么资源泄漏和 secret scan 是发布阻断项？
4. 如果只能展示一个作品集 artifact，应该保留哪些证据？

