# 步骤 19：实现 Context Builder

## 本步目标

把完整 Session history 转换为一次模型请求所需的、受预算限制且可解释的 canonical context。History 是事实全集，Context 是本次模型看到的选择结果。

## 前置条件

- Session graph 和 active leaf 可用。
- 消息工具关联校验稳定。
- Provider adapter 能接收厂商无关 ModelContext。

## 不变量

- 只取 active branch。
- system/security、当前用户输入是 required。
- tool call/result 是原子组，不能孤立。
- 工具 schema、Skill 和图片等也计入预算。
- 相同状态、相同预算必须得到相同输出。
- Provider transform 在 Context Builder 之后。
- 必选组超预算时抛明确错误，不截断系统或当前用户。

## 推荐契约

```ts
export interface ContextGroup {
  readonly id: string;
  readonly parts: readonly unknown[];
  readonly priority: number;
  readonly required: boolean;
  readonly estimatedTokens: number;
  readonly reason: string;
}

export interface ContextBuildReport {
  readonly budget: number;
  readonly estimatedTokens: number;
  readonly included: readonly string[];
  readonly dropped: readonly {
    id: string;
    reason: string;
    tokens: number;
  }[];
  readonly replaced: readonly string[];
  readonly invariants: readonly string[];
}

export function buildContext(input: ContextBuildInput): {
  readonly context: ModelContext;
  readonly report: ContextBuildReport;
};
```

## 推荐优先级

1. system/security；
2. 当前用户任务；
3. 必要的 tool call/result 配对；
4. 近期且相关的历史；
5. compaction summary；
6. 可丢弃的旧 observation。

具体数字由你定义，但排序规则必须稳定：priority 相同后使用 chronology，再使用稳定 ID。

## 实现步骤

1. 从 root 到 active leaf 投影 canonical messages。
2. 验证所有工具调用关系。
3. 构造 required/optional 原子 groups。
4. 使用可注入 TokenEstimator。
5. 把工具定义和 Skill 内容纳入估算。
6. 先求 required 总量；超预算立即失败。
7. 稳定排序 optional groups。
8. 在剩余预算中逐组加入，不能拆 tool pair。
9. 大工具结果只使用已经持久化的摘要/引用替换。
10. 最终再次验证消息协议。
11. 生成 BuildReport，解释每个 drop/replace。
12. Provider adapter 再做 wire transform 和 capability check。
13. debug 输出必须脱敏。

## 步骤 adapter

创建 `test/step-adapters/step-19.adapter.ts`：

```ts
export function buildContextScenario(scenario: string): Promise<{
  status: string;
  includedIds?: string[];
  droppedIds?: string[];
  toolPairsValid?: boolean;
  estimatedTokens?: number;
  budget?: number;
  reportComplete?: boolean;
  providerWireTypesPresent?: boolean;
  fingerprint?: string;
}>;
```

支持：

- `budgeted-history`
- `deterministic`
- `required-over-budget`

最后一个场景应 reject。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 空历史 | 只有 required 内容 |
| 预算 | 正好边界、少 1 token、required 超限 |
| 配对 | tool call/result 同进同出 |
| 分支 | 其他 branch 不进入上下文 |
| 确定性 | 重复构建 fingerprint 相同 |
| 大结果 | 使用可信摘要而非随意截断 |
| 能力 | canonical context 无 Provider wire type |
| 报告 | included+dropped 与候选全集一致 |

运行：

```powershell
npm run verify:step -- 19
```

## 退出清单

- [ ] History 与 Context 明确分层。
- [ ] active branch 投影正确。
- [ ] required 和 tool pair 不被拆。
- [ ] 相同输入产生相同 fingerprint。
- [ ] report 可解释所有选择。
- [ ] Provider transform 不在 Builder 内。
- [ ] 本步测试通过。

## 常见错误

- 直接取最近 N 条消息。
- 只删 ToolResult，保留孤立 ToolCall。
- 工具 schema 不计预算。
- 在 Builder 里分支判断 Provider 名称。
- 让模型临时猜大输出摘要。
- 使用 Map 枚举或当前时间导致不确定。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\session-manager.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\agent-session.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\llm.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\context_manager\mod.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\session\turn.rs`

## 学习记录问题

1. History 和 Context 的根本区别是什么？
2. 哪些消息必须成为原子组？
3. required 已超预算时为何不能偷偷截断？
4. Provider capability 属于 Builder 还是 Adapter？

