# 步骤 02：定义内部消息和内容块协议

## 新手任务卡：第一个真正的 TypeScript 任务

这是你第一次编写 Agent 正式代码。本步骤只做“消息数据结构和校验”，**不调用模型、不执行工具、不写循环**。

### 你要创建的文件

```text
src/core/messages.ts                  定义消息和内容块的 TypeScript 类型
src/core/message-validation.ts        检查运行时数据是否合法
src/core/protocol-version.ts          JSON 序列化、解析和版本检查
src/core/usage.ts                     校验并汇总 token usage
test/core/messages.test.ts            你自己编写的单元测试
test/step-adapters/step-02.adapter.ts 连接预置验收题
```

如果 `src/core` 或 `test/core` 不存在，直接创建目录。不要把实现写到 `test/steps/step-02.test.ts`。

### 按这个顺序写，不要一次实现全部

1. 创建 `src/core/messages.ts`，先照“核心设计”定义 `ContentPart` 和 `AgentMessage`。
2. 在 `test/core/messages.test.ts` 写最小测试：创建 user 消息，断言 role 是 `"user"`。
3. 创建 `src/core/message-validation.ts`，先实现 `assertAgentMessage(value: unknown)`；第一版只验证对象、role 和 content 数组。
4. 增加两个测试：合法 user 消息不抛错，未知 role 必须抛错。
5. 再逐项加入 text、tool_call、tool_result 的字段验证。
6. 创建 `protocol-version.ts`，完成 JSON round-trip 和未知版本拒绝。
7. 创建 `usage.ts`，最后处理非负安全整数和 token 汇总。
8. 真实逻辑完成后，再创建 Step 02 Adapter，从 `src/core` 导入并调用你的函数。

每完成一小段就运行 `npm run typecheck` 和 `npm test`。写完 Adapter 后运行：

```powershell
npm run verify:step -- 02 --only
npm run verify:step -- 02
```

如果提示缺少 Adapter export，就查看下面“步骤 adapter”章节要求的四个函数。

## 本步目标

建立 Provider、AgentLoop、Tool 和 Session 共用的内部协议。内部协议必须独立于任一厂商 wire format，并能稳定序列化、校验和演进。

## 前置条件

- 步骤 00–01 已通过。
- 熟悉 TypeScript 判别联合和运行时校验。

## 核心设计

内部消息统一使用内容块数组，不使用 `string | object` 双形态：

```ts
export type ContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_call";
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool_result";
      readonly toolCallId: string;
      readonly name: string;
      readonly output: unknown;
      readonly isError: boolean;
    };

export interface AgentMessage {
  readonly id: string;
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: readonly ContentPart[];
}
```

需要同时实现：

- 局部结构校验；
- 角色与内容块的组合规则；
- 工具调用 ID 的跨消息关联；
- JSON round-trip；
- 协议版本 envelope；
- usage 安全汇总。

## 推荐模块

```text
src/core/messages.ts
src/core/message-validation.ts
src/core/usage.ts
src/core/protocol-version.ts
```

Provider 适配器只能把厂商数据映射到这些类型，不能把 SDK 类型传入 core。

## 实现步骤

1. 定义 role、content part、stop reason 和 usage。
2. 为联合中的每种类型写穷尽分支。
3. 拒绝空 ID、空工具名、未知 role 和未知 content type。
4. 规定 `tool` 消息只能包含 `tool_result`。
5. 实现 `assertAgentMessage(value)`。
6. 实现 `validateToolLinks(messages)`：
   - tool result 必须引用先前调用；
   - 调用 ID 不得重复；
   - 工具名必须一致；
   - 每个结果最多提交一次。
7. 用版本 envelope 实现 parse/serialize。
8. JSON 只保存数据，不保存 `Error`、函数或类实例。
9. 对输入做防御性复制或冻结，避免调用方后续修改。
10. 为 usage 检查非负安全整数和总和。

## 步骤 adapter

创建 `test/step-adapters/step-02.adapter.ts`，导出：

```ts
export function createMessageExamples(): {
  user: unknown;
  assistantWithToolCall: unknown;
  toolResult: unknown;
};

export function roundTripMessage(message: unknown): unknown;

export function extractToolLink(
  assistant: unknown,
  toolResult: unknown,
): { callId: string; resultCallId: string };

export function parseMessage(value: unknown): unknown;
```

adapter 应只调用你的真实实现，不要在 adapter 里重新实现校验器。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 正常 | user、assistant text、tool call、tool result |
| round-trip | 序列化后深度相等，原对象不变 |
| 关联 | call ID 与 result call ID 一致 |
| 边界 | 空文本策略、多个内容块、usage 为 0 |
| 失败 | 未知 role、孤立结果、重复 ID、未知版本、坏 JSON |
| 安全 | 错误中不序列化任意输入对象或秘密 |

运行：

```powershell
npm run verify:step -- 02
```

## 退出清单

- [ ] 内部类型没有 Provider 专属字段。
- [ ] 所有联合分支可穷尽。
- [ ] round-trip 不丢字段。
- [ ] 工具调用关系可跨消息验证。
- [ ] 无效数据在公共边界被拒绝。
- [ ] adapter 只做映射。
- [ ] 本步累计测试通过。

## 常见错误

- 直接把 OpenAI message 当内部协议。
- 用大量可选字段模拟多个事件类型。
- 忽略 tool call ID。
- 把 `Error` 实例塞进消息。
- parse 只做 `JSON.parse`，没有运行时校验。
- 校验器修改了调用方传入对象。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\ai\src\types.ts`
- Pi：`C:\code\projects\pi\packages\agent\src\types.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\message-v2.ts`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`

## 学习记录问题

1. 为什么内部协议不应等同 Provider wire format？
2. 判别联合在哪些地方比可选字段更安全？
3. 工具结果关联校验为什么不能只做局部验证？
4. 未知协议版本应拒绝、迁移还是保留为 opaque？

