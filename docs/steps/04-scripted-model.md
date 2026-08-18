# 步骤 04：先实现 Scripted/Fake Model

## 本步目标

在接入真实网络前固定最小 `ModelClient` 契约，并实现高保真的 Scripted Model。后续 AgentLoop、Session、恢复和并发测试都优先依赖它。

## 前置条件

- 步骤 02 的消息协议。
- 步骤 03 的异步事件流。

## 推荐模型契约

```ts
export interface ModelRequest {
  readonly messages: readonly AgentMessage[];
  readonly tools?: readonly ModelToolSpec[];
  readonly signal?: AbortSignal;
}

export type ModelStreamEvent =
  | { readonly type: "text_delta"; readonly delta: string }
  | {
      readonly type: "tool_call_delta";
      readonly index: number;
      readonly id?: string;
      readonly name?: string;
      readonly argumentsDelta?: string;
    }
  | {
      readonly type: "finish";
      readonly stopReason: StopReason;
      readonly usage: Usage;
    };

export interface ModelClient {
  readonly id: string;
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}
```

Scripted Model 不只是“返回固定字符串”。它必须能：

- 流式发文本；
- 把工具参数拆成任意片段；
- 注入延迟；
- 在部分事件之后抛错；
- 观察取消；
- 记录请求快照；
- 发现意外的额外模型调用。

## 推荐模块

```text
src/model/types.ts
src/model/collect-response.ts
src/testing/scripted-model.ts
src/testing/model-script.ts
```

## 实现步骤

1. 冻结 Provider 无关的 ModelClient 契约。
2. 实现 response collector：
   - 拼接 text delta；
   - 按 index/call ID 聚合工具参数；
   - 工具 JSON 完整后才解析；
   - 每次响应必须恰有一个 finish。
3. 定义 `ScriptedExchange`，一条 exchange 对应一次模型请求。
4. FIFO 消费脚本，脚本耗尽必须失败。
5. 记录请求的不可变快照，不保存调用方可修改引用。
6. 支持 `assertRequest` 检查调用内容。
7. 支持分片、错误位置、延迟和 AbortSignal。
8. 实现 `remaining()` 与 `assertExhausted()`。
9. 所有默认测试使用短且可控的延迟。
10. 不在本步引入任何 API key 或真实 endpoint。

## 步骤 adapter

创建 `test/step-adapters/step-04.adapter.ts`：

```ts
export function runScriptedModel(
  events: unknown[],
  request: unknown,
): Promise<{ events: unknown[]; requests: unknown[] }>;

export function runFragmentedToolCall(): Promise<{
  arguments: unknown;
  fragments: string[];
}>;

export function runAbortScenario(): Promise<{
  status: string;
  eventsAfterAbort: number;
}>;
```

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 文本流 | 多个 delta 正确拼接 |
| 工具流 | `{"a":1,"b":2}` 被拆成多个 fragment 后恢复 |
| 请求记录 | 一次调用只消费一个 exchange |
| 失败 | 脚本耗尽、重复 finish、缺 finish、非法 JSON |
| 流中断 | 若干 delta 后抛错 |
| 取消 | 延迟期间 abort，之后事件数为 0 |
| 严格性 | `assertExhausted` 发现漏掉的模型调用 |

运行：

```powershell
npm run verify:step -- 04
```

## 退出清单

- [ ] 后续核心测试无需真实网络。
- [ ] Fake 支持文本和工具增量。
- [ ] Fake 能确定性重现错误和取消。
- [ ] 多余或缺失模型请求会让测试失败。
- [ ] 请求记录不会被调用方事后修改。
- [ ] 本步测试通过。

## 常见错误

- Fake 只返回完整字符串。
- Fake 对多余请求保持沉默。
- 记录请求时保留可变引用。
- 使用很长的真实 sleep。
- collector 接受 finish 后的事件。
- 把工具 JSON 在每个 fragment 到达时就解析。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\ai\src\providers\faux.ts`
- Pi：`C:\code\projects\pi\packages\ai\src\utils\event-stream.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`

## 学习记录问题

1. 高保真 Fake 最重要的是模拟返回值还是强制调用协议？
2. 为什么“脚本必须消费完”能发现 AgentLoop 缺陷？
3. 哪些 Provider 差异不应该进入 Scripted Model？
4. 工具参数应在哪个边界从字符串变为对象？

