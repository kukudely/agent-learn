# 步骤 33：建立 Agent Eval

## 本步目标

评测 Agent 的行为结果和安全性，而不是要求回答文本逐字一致。Eval 数据集需要版本化、可重复、可比较，并把安全回归设为独立阻断项。

## 前置条件

- 分层测试已稳定。
- Trace/Audit 能导出结构化运行 artifact。
- 有离线 Scripted/Recorded Provider，必要时可重复多次。

## 任务集

### A. 纯问答

- 根据给定文件回答事实；
- 不应调用写工具。

### B. 代码检索

- 找到入口；
- 追踪调用链；
- 引用准确文件位置。

### C. 小型编辑

- 修改明确函数；
- 不改无关文件；
- diff 满足约束。

### D. 调试修复

- 运行失败测试；
- 定位根因；
- 修改并验证。

### E. 安全对抗

- prompt injection；
- 工作区外凭据；
- 危险删除；
- 恶意 Skill/MCP description；
- symlink escape。

### F. 恢复

- Provider 断流；
- Tool timeout；
- Session restart；
- compaction 后继续。

### G. 多 Agent

- 合理拆分；
- 避免重复；
- 子失败处理；
- 汇总结果。

## 推荐数据协议

```ts
export interface EvalCase {
  readonly id: string;
  readonly category: string;
  readonly fixtureVersion: string;
  readonly prompt: string;
  readonly setup: EvalSetup;
  readonly assertions: readonly EvalAssertion[];
  readonly maxBudget: EvalBudget;
}

export interface EvalCaseResult {
  readonly caseId: string;
  readonly passed: boolean;
  readonly score: number;
  readonly assertionResults: readonly AssertionResult[];
  readonly metrics: EvalMetrics;
  readonly artifacts: EvalArtifacts;
}
```

## 判定优先级

优先使用：

- 最终文件状态；
- Git diff；
- 测试结果；
- 结构化 events；
- Policy/Audit；
- 资源和预算指标。

谨慎使用：

- 文本完全匹配；
- 只用 LLM-as-Judge。

如果使用 Judge，保存 rubric、model/version、prompt、原始评分，并与确定性断言分开。

## 指标

- task success；
- diff correctness；
- unrelated file changes；
- tool selection/argument errors；
- steps/token/cost/time；
- retries；
- permission prompts；
- safety violations；
- recovery success；
- multi-agent duplication。

## 实现步骤

1. 定义版本化 EvalCase schema。
2. 每个 case 使用隔离 fixture 和固定 seed。
3. 实现 setup/teardown 和 artifact collection。
4. 先写确定性 assertions。
5. 对文本质量再加入 rubric/judge。
6. 每个 category 计算独立 score。
7. 安全 violation 一票阻断，不能被平均分掩盖。
8. 重复运行至少三次，记录 variance。
9. 保存版本、配置 hash、模型信息、成本和 trace。
10. 实现 baseline 与 candidate diff。
11. 定义 category regression threshold。
12. 报告失败 case 的最小可复现命令。
13. artifact 和报告经过 secret scan。
14. 在核心改动后运行固定离线 Eval 集。

## 步骤 adapter

创建 `test/step-adapters/step-33.adapter.ts`：

```ts
export function runAgentEval(scenario: string): Promise<{
  status: string;
  datasetVersion: string;
  repeatScores: number[];
  aggregateScore: number;
  categoryScores: Record<string, number>;
  regressions: string[];
  artifactsWritten: boolean;
  secretExposed: boolean;
}>;
```

支持：

- `baseline`
- `safety-regression`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| schema | case/version/assertion 校验 |
| reproducibility | 固定数据重复三次 |
| scoring | pass/partial/fail |
| category | tool、safety、recovery、instruction |
| regression | 平均分升高但 safety 降低 |
| budget | 超 token/cost/time 失败 |
| artifact | diff/test/events/audit 完整 |
| 安全 | artifact 不泄露凭据 |
| judge | timeout、坏 JSON、分歧 |

运行：

```powershell
npm run verify:step -- 33
```

## 退出清单

- [ ] 数据集和 fixture 均版本化。
- [ ] 主要判定基于行为事实。
- [ ] 重复运行方差可见。
- [ ] category regression 单独报告。
- [ ] 安全违规独立阻断。
- [ ] artifact 可复现且已脱敏。
- [ ] 本步测试通过。

## 常见错误

- 只比较最终文字。
- 只看一个 aggregate score。
- 用 Judge 替代可确定性检查。
- fixture 未隔离，case 相互污染。
- 结果不记录模型/config 版本。
- Eval artifact 中保存 secrets。

## 本地源码锚点

- Pi：用其最小 Agent/Faux Provider 设计离线任务 fixture。
- OpenCode：对照其 Tool/Session 测试构造项目任务。
- Codex：查看 `C:\code\projects\codex` 中的 eval、exec 与 protocol 测试基础设施。

## 学习记录问题

1. 哪些 Eval 断言必须确定性完成？
2. 安全得分为何不能被平均？
3. 如何区分模型随机性与运行时回归？
4. 一个有价值的失败 artifact 至少包含什么？

