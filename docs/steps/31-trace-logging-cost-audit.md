# 步骤 31：实现 Trace、日志、成本和审计

## 本步目标

让任意一次成功或失败都能回答：发生了什么、在哪个 Session/Turn、调用了哪个 Provider/Tool、为什么被允许或拒绝、花费多少、最终状态是什么。

## 前置条件

- 全链路事件、Session IDs 和 Tool call IDs 已稳定。
- Secret redaction 是独立模块。
- Provider usage 和 pricing metadata 可用。

## 四类数据的区别

- **Event**：产品状态事实，可恢复。
- **Trace**：一次执行的因果和耗时结构。
- **Log**：供运维/调试阅读的结构化诊断。
- **Audit**：安全相关的不可抵赖决策记录。

不要把它们都写进一个日志文件，也不要让 best-effort telemetry 决定业务结果。安全审计持久化失败是否阻止高风险操作，需要明确策略。

## 统一关联 ID

- trace ID；
- session ID；
- turn/run ID；
- model request ID；
- tool call ID；
- approval ID；
- agent ID；
- parent span/agent ID。

所有跨层调用通过 Context 传递，不依赖全局变量。

## 推荐契约

```ts
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly agentId?: string;
}

export interface Span {
  setAttribute(name: string, value: string | number | boolean): void;
  recordException(error: unknown): void;
  end(status?: "ok" | "error" | "cancelled"): void;
}

export interface AuditRecord {
  readonly sequence: number;
  readonly timestamp: string;
  readonly subject: string;
  readonly action: string;
  readonly resource: string;
  readonly decision: string;
  readonly correlationIds: Readonly<Record<string, string>>;
}
```

## 指标

- 首 token 延迟和模型总耗时；
- input/output/cache/reasoning token；
- 成本；
- Tool 耗时和输出大小；
- retry 次数；
- compaction 次数；
- Agent steps；
- permission ask/allow/deny；
- Sandbox violations；
- MCP/Plugin failures。

## 实现步骤

1. 定义 correlation context 和传递方式。
2. 为 turn、context build、model、tool、policy、execution 建 span。
3. 建立确定的 parent-child 关系。
4. 失败和取消路径也 end span。
5. 实现结构化 Logger，所有字段先 redaction。
6. 大输出只记录 hash、size、artifact reference 和摘要。
7. 实现 usage aggregator。
8. 价格表版本化，成本保留 currency/model/rateVersion。
9. 实现 append-only AuditSink。
10. Audit 记录 request、decision、approval scope、execution outcome。
11. 多 Agent span 保留 parent agent。
12. 定义日志保留和删除策略。
13. 模拟 log sink 失败，核心运行仍按策略完成。
14. 在测试结束扫描所有 sink 中的秘密。

## 步骤 adapter

创建 `test/step-adapters/step-31.adapter.ts`：

```ts
export function runObservabilityScenario(scenario: string): Promise<{
  status: string;
  traceIds?: string[];
  spanParentsValid?: boolean;
  tokenTotals?: { input: number; output: number };
  costTotal?: number;
  auditSequence?: number[];
  secretExposed?: boolean;
  businessResultChangedByLogFailure?: boolean;
}>;
```

支持：

- `successful-run`
- `secret-redaction`
- `log-sink-failure`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 关联 | Session/turn/model/tool/approval IDs |
| 因果 | span parent tree 完整 |
| 失败 | Provider、Tool、Policy、cancel trace |
| usage | 多次模型调用准确汇总 |
| cost | rate version、未知 usage |
| audit | sequence、decision、outcome |
| 多 Agent | parent-child trace |
| 截断 | 大输出不撑爆日志 |
| 安全 | key/token/cookie 全 sink 扫描 |
| 故障 | telemetry sink 失败隔离 |

运行：

```powershell
npm run verify:step -- 31
```

## 退出清单

- [ ] E2E 运行可还原完整因果链。
- [ ] 失败和取消也有闭合 span。
- [ ] usage/cost 可按 Session 汇总。
- [ ] Audit 与普通日志分离。
- [ ] 大输出只存摘要和引用。
- [ ] 所有 sink 均脱敏。
- [ ] telemetry 失败策略明确。
- [ ] 本步测试通过。

## 常见错误

- 只给成功路径加 trace。
- 每层自己生成无关联 ID。
- 在日志中保存完整 Tool output。
- usage 缺失时填 0 并计算假成本。
- redaction 只用于 Logger，不用于 Trace/Audit。
- Logger 抛错导致业务 Run 失败。

## 本地源码锚点

- Pi：对照 `C:\code\projects\pi\packages\coding-agent\src` 的 Session/Event 和扩展通知。
- OpenCode：对照 `C:\code\projects\opencode\packages\opencode\src` 的日志、Session 和 Provider usage。
- Codex：`C:\code\projects\codex\codex-rs\otel`
- Codex：`C:\code\projects\codex\codex-rs\core\src`

## 学习记录问题

1. Event、Trace、Log、Audit 分别解决什么问题？
2. Audit sink 失败时高风险工具是否应继续？
3. 未知 usage 如何影响成本报告？
4. 大 Tool output 如何做到可定位又不泄密？

