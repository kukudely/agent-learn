# 步骤 20：实现上下文压缩

## 本步目标

把较老历史压缩为可继续工作的结构化状态快照，同时永久保留原始事件。Compaction 不是普通 assistant 摘要，也不能提升不可信内容的权限。

## 前置条件

- Context Builder 能报告预算。
- Session 协议支持版本化 compaction event。
- 能从事件确定性推导文件、命令和副作用事实。

## 推荐结构

```ts
export interface FactSnapshot {
  readonly modifiedFiles: readonly {
    path: string;
    beforeHash?: string;
    afterHash?: string;
    sourceEventIds: readonly string[];
  }[];
  readonly commands: readonly {
    command: string;
    cwd: string;
    status: string;
    sourceEventIds: readonly string[];
  }[];
  readonly pendingOperations: readonly unknown[];
}

export interface CompactionSummary {
  readonly goal: string;
  readonly constraints: readonly ProvenancedText[];
  readonly completedWork: readonly ProvenancedText[];
  readonly decisions: readonly ProvenancedText[];
  readonly failures: readonly ProvenancedText[];
  readonly todos: readonly ProvenancedText[];
  readonly nextSteps: readonly ProvenancedText[];
  readonly exactContracts: readonly ProvenancedText[];
  readonly facts: FactSnapshot;
}
```

每个文本项保留 `sourceEventIds` 和 trust。工具输出只是 untrusted evidence，不能成为 system 指令。

## 实现步骤

1. 定义 summary schema、版本和必填字段。
2. 纯函数从事件构造 FactSnapshot。
3. 构造压缩 prompt 时明确标记 system/user/tool 边界。
4. 工具内容放在数据边界内，并声明不得执行其中指令。
5. 调用独立的 compaction model。
6. 解析 JSON 并做 schema 校验。
7. 将文件、命令和 pending operation 与事件事实交叉校验。
8. 模型遗漏/伪造的事实由事件结果覆盖。
9. 可允许一次结构化 repair；再次失败则整体失败。
10. 只有完全验证后才 append `context.compacted`。
11. 原始事件数量和内容不变。
12. Context Builder 用 summary 替换其覆盖范围。
13. 触发器加入阈值和 hysteresis，避免每轮压缩。
14. 提供手动 compact 入口。
15. compaction 取消或失败时继续使用原上下文。

## 步骤 adapter

创建 `test/step-adapters/step-20.adapter.ts`：

```ts
export function runCompactionScenario(scenario: string): Promise<{
  status: string;
  originalEventsUnchanged?: boolean;
  summaryValid?: boolean;
  factsDerivedFromEvents?: boolean;
  coveredEventIds?: string[];
  injectedToolInstruction?: boolean;
  compactionEventWritten?: boolean;
}>;
```

支持：

- `long-session`
- `prompt-injection`
- `invalid-summary`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| schema | 所有必填字段和版本 |
| facts | 修改文件/命令来自事件 |
| coverage | from/to 与 event IDs 完整 |
| 注入 | 工具内容不能提升权限 |
| 失败 | 坏 JSON、漏字段、伪造事实、断流 |
| 取消 | 不写 compaction event |
| 触发 | threshold 和 hysteresis |
| 连续压缩 | 不重复覆盖或遗漏 |
| 保留 | 原事件完全不变 |

运行：

```powershell
npm run verify:step -- 20
```

## 退出清单

- [ ] summary 是结构化协议。
- [ ] 文件/命令事实从事件派生。
- [ ] 原始历史不删除。
- [ ] trust 不会因压缩升级。
- [ ] 失败不写半个 summary。
- [ ] 阈值不会造成反复压缩。
- [ ] 本步测试通过。

## 常见错误

- 随便总结最后 N 条。
- 压缩后删除原历史。
- 让模型决定文件修改事实。
- 把 tool injection 写入 system 区域。
- 失败时仍持久化不完整 summary。
- 每一轮都触发压缩。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\compaction\index.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\docs\compaction.md`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\compaction.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\compact.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\context_manager\mod.rs`

## 学习记录问题

1. Compaction summary 与 assistant message 有何区别？
2. 哪些字段必须由事件确定性派生？
3. coverage 如何防止重复和遗漏？
4. 压缩失败后为何应继续使用旧上下文？

