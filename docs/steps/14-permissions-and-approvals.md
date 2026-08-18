# 步骤 14：实现权限规则和审批流程

## 本步目标

在所有副作用工具前建立统一的 Policy Pipeline，以可解释的规则得到 `allow | ask | deny`。只有 `allow` 或用户明确批准后才执行能力。

## 前置条件

- 写入和 Shell Executor 已能独立工作。
- ToolRegistry 支持在执行前提取规范化请求。
- Session 能发出并记录结构化事件。

## 核心分层

```text
Tool Request
  -> schema validation
  -> normalize resource/action
  -> policy evaluation
  -> optional approval
  -> executor
  -> audit event
```

Policy、Approval 和 Executor 不应揉成一个函数。

## 推荐契约

```ts
export interface PermissionRequest {
  readonly capability: string;
  readonly action: string;
  readonly resource: string;
  readonly risk: "low" | "medium" | "high";
  readonly summary: string;
}

export interface PermissionRule {
  readonly id: string;
  readonly effect: "allow" | "ask" | "deny";
  readonly capability?: string;
  readonly resourcePattern?: string;
  readonly priority: number;
}

export interface PolicyDecision {
  readonly effect: "allow" | "ask" | "deny";
  readonly matchedRuleId?: string;
  readonly reason: string;
}

export interface ApprovalManager {
  request(
    request: PermissionRequest,
    signal: AbortSignal,
  ): Promise<
    | {
        approved: true;
        scope: "once" | "session" | "project";
      }
    | {
        approved: false;
        reason?: string;
      }
  >;
}
```

## 规则语义

- 优先级必须确定且可解释。
- 同等具体度/优先级发生冲突时，建议 deny 胜出。
- 无规则时默认 ask 或 deny，不默认 allow。
- `once` 只覆盖一次等价请求。
- `session` 只在当前 Session 内有效。
- `project` 需要独立持久化和更严格的确认。
- Approval 等待期间不得先执行工具。
- deny 路径必须证明 executor 调用次数为 0。

## 实现步骤

1. 从工具输入提取规范化 PermissionRequest。
2. 规范化路径、命令和资源标识，避免同义字符串绕规则。
3. 定义 rule match 和 specificity。
4. 纯函数实现 evaluator，并返回匹配规则和原因。
5. 建立 ApprovalManager 接口，测试使用 Scripted Approval。
6. 实现 approval scope 缓存，key 包含 capability/action/resource。
7. 在统一 Pipeline 中保证顺序。
8. 取消审批时终止请求，不自动 deny 后继续。
9. 记录 requested、decided、executed 等事件。
10. 日志和 UI 摘要不得包含秘密。
11. Policy 错误默认安全失败。
12. 写入、Shell 和未来 MCP 工具都必须走同一 Pipeline。

## 步骤 adapter

创建 `test/step-adapters/step-14.adapter.ts`：

```ts
export function runPolicyScenario(scenario: string): Promise<{
  decision: "allow" | "ask" | "deny";
  executed: boolean;
  approvalRequests: number;
  matchedRule?: string;
  persistedScope?: string;
}>;
```

支持：

- `explicit-allow`
- `explicit-deny`
- `ask-approved`
- `ask-denied`
- `conflicting-rules`
- `approve-once`
- `approve-session`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| allow | 不请求审批，执行一次 |
| deny | 不请求审批，不执行 |
| ask | 批准/拒绝/取消 |
| precedence | deny 与 allow 冲突 |
| scope | once、session、project |
| 规范化 | 等价路径、命令和大小写 |
| 竞态 | 等待审批时 Session 取消 |
| 安全 | evaluator 异常时不执行 |
| 审计 | request、decision、execution 关联 |

运行：

```powershell
npm run verify:step -- 14
```

## 退出清单

- [ ] 所有副作用走统一 Pipeline。
- [ ] deny 路径 executor 调用为 0。
- [ ] ask 必须等待用户结果。
- [ ] 规则优先级确定且可解释。
- [ ] scope 不会意外扩大。
- [ ] 取消能中断审批等待。
- [ ] 本步测试通过。

## 常见错误

- 工具执行后再询问用户。
- 不同工具各自实现权限逻辑。
- 用未经规范化的字符串匹配规则。
- 把“信任项目”等同“允许所有工具”。
- approval scope key 太宽泛。
- evaluator 失败时默认 allow。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\project-trust.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\permission\index.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\approvals.rs`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`

## 学习记录问题

1. 为什么 Trust、Permission 和 Sandbox 是三种边界？
2. 规则 specificity 如何定义才可预测？
3. approval once 的等价请求 key 应包含什么？
4. 为什么 Policy 错误必须安全失败？

