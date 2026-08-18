# 步骤 00：定义范围、术语和不可变约束

## 新手任务卡：这一阶段到底写什么

**本步骤不写任何 JS/TS 代码。**

你只需要编辑 `docs/adr/0001-agent-scope.md`。当前仓库已经提供了一份可运行的初稿。为了真正完成学习，请打开它并做三次自己的修改：

1. 在“背景与学习目标”中写一句你为什么要实现 Agent；
2. 在“非目标”中增加一项你第一版明确不做的能力；
3. 从“不可变约束”中选一条，补充一句准备怎样用测试证明它。

不要修改 `test/steps/step-00.test.ts` 或 `test/steps/_contracts/steps-00-11.ts`，它们是验收题。完成编辑后，在项目根目录运行：

```powershell
npm run verify:step -- 00 --only
```

看到 `Tests 2 passed` 表示本步骤通过。

## 本步目标

先写清楚要构建的系统，再开始编码。本项目的第一版是一个**单进程、单 Agent、单 Provider、工具顺序执行、可取消且可测试的 Agent 内核**。它不是 IDE、聊天产品、分布式任务平台，也不是完整的权限沙箱。

本步完成后应得到：

- `docs/adr/0001-agent-scope.md`；
- 一张从用户输入到最终结果的最小数据流；
- 一份不会在后续步骤反复改名的术语表；
- 一组能映射到代码和测试的不可变约束；
- 清楚列出的非目标和副作用边界。

## 前置条件

无。这一步只需要阅读三个参考项目的核心类型和安全说明，不需要安装新的运行时依赖。

## 必须掌握的概念

- **AgentLoop**：本地控制流，决定何时调用模型、何时调用工具以及何时结束。
- **Provider**：把厂商协议适配成内部统一模型接口的边界。
- **Tool**：模型能请求、本地运行时实际执行的能力。
- **Policy**：在副作用发生前作出 allow、ask 或 deny 决策。
- **Sandbox**：操作系统级或进程级隔离；它不能替代 Policy。
- **Run**：一次可终止的执行。
- **Session**：跨多个 Run 保存状态的容器。
- **Workspace**：所有文件能力的根边界，不只是一个路径字符串。
- **Event**：运行期间的可观察事实。
- **maxSteps**：循环最多推进多少次；检查必须发生在下一次操作之前。

建议的数据流：

```text
User Input
  -> AgentSession
  -> AgentLoop
  -> ModelClient
  -> ToolRegistry
  -> Policy
  -> Workspace / Sandbox
  -> Event Stream + Final Result
```

## 要写的 ADR

在 `docs/adr/0001-agent-scope.md` 至少包含以下章节：

1. 背景与学习目标；
2. 范围；
3. 非目标；
4. 数据流；
5. 术语表；
6. 不可变约束；
7. 副作用提交点；
8. 测试策略；
9. 何时允许改变这些决定。

ADR 中必须原样出现 `AgentLoop`、`Provider`、`Tool`、`Policy`、`Sandbox`、`maxSteps`，因为验收测试会检查这些核心概念是否被明确记录。

## 建议固化的约束

- 核心模块通过构造参数接收依赖，不直接读取全局配置。
- Model 和 Tool 都必须能被离线 Fake 替换。
- 第一版工具严格顺序执行。
- 所有文件能力必须经过 Workspace。
- 所有循环、输出、事件缓冲和外部请求都有上限。
- 所有长操作都接收同一个根 `AbortSignal`。
- 错误是结构化数据，不能只靠字符串匹配。
- 工具副作用一旦可能发生，自动重试必须非常保守。
- Session 历史和运行事件是不同的概念。
- 默认测试不得访问真实网络。

## 实现步骤

1. 用自己的话描述一个最小 Agent 从输入到输出的完整路径。
2. 分别写出 Model、AgentLoop、Tool、Session 和 Workspace 的职责。
3. 为每个职责写一个明确的“不负责什么”。
4. 标出模型调用、文件写入和 Shell 执行的副作用提交点。
5. 列出首版限制：单 Agent、单 Provider、顺序工具、内存 Session。
6. 为每条不可变约束补一句“如何用测试证明”。
7. 记录未来如果引入并行、多 Agent 或远程服务器，哪些协议必须版本化。
8. 运行本步验收，直到 ADR 内容而非代码通过。

## 测试契约

本步不需要 adapter。`test/steps/step-00.test.ts` 直接检查 ADR：

| 类别 | 验证内容 |
| --- | --- |
| 文档存在性 | `docs/adr/0001-agent-scope.md` 存在 |
| 术语 | 六个核心术语均被解释 |
| 非目标 | 明确出现“非目标/不实现/out of scope” |
| 副作用 | 明确说明副作用边界 |
| 首版范围 | 明确单 Agent 和单 Provider |

运行：

```powershell
npm run verify:step -- 00
```

## 退出清单

- [ ] ADR 文件存在。
- [ ] 数据流中的每个组件职责单一。
- [ ] 非目标足够具体，能阻止提前做 UI、分布式和多 Agent。
- [ ] 副作用提交点可以被测试。
- [ ] 所有限制都能映射到未来代码字段。
- [ ] `npm run verify:step -- 00` 通过。

## 常见错误

- 一开始就实现 UI 或接真实模型。
- 把 Run、Turn、Session 混为一谈。
- 把 Policy 和 Sandbox 当成同一个安全层。
- 只写“必须安全”，没有可验证的边界。
- 没有定义副作用何时视为已经发生。
- 把并行执行写进首版，导致后续调试困难。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\agent\src\types.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\docs\security.md`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\message-v2.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\permission\index.ts`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`
- Codex：`C:\code\projects\codex\codex-rs\sandboxing\src\manager.rs`

## 学习记录问题

1. 哪些约束属于产品策略，哪些必须成为内核不变量？
2. 为什么 Policy 通过后仍可能需要 Sandbox？
3. 工具调用的哪个时刻决定了它是否能安全重试？
4. 如果未来支持并行工具，哪些事件字段必须保持兼容？

