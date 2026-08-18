# 步骤 05：建立最小 ModelClient 和真实 Provider

## 本步目标

实现一个 OpenAI-compatible 流式 Provider 适配器，同时保持核心层完全不知道厂商 wire format。默认测试全部离线，真实请求只能作为显式启用的 smoke test。

## 前置条件

- 步骤 02–04 通过。
- 熟悉 Fetch、ReadableStream、UTF-8 和 SSE。

## 推荐模块

```text
src/model/openai-compatible/config.ts
src/model/openai-compatible/request-mapper.ts
src/model/openai-compatible/sse-parser.ts
src/model/openai-compatible/event-mapper.ts
src/model/openai-compatible/client.ts
src/model/provider-errors.ts
```

把 wire types 留在 Provider 目录中，不从 `src/index.ts` 导出。

## 推荐契约

```ts
export interface OpenAICompatibleConfig {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export class OpenAICompatibleModel implements ModelClient {
  readonly id: string;

  constructor(
    config: OpenAICompatibleConfig,
    dependencies?: { readonly fetch?: FetchLike },
  );

  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}
```

## SSE 解析要求

- 正确处理 UTF-8 字符跨字节 chunk；
- 一条 `data:` 可能跨多个网络 chunk；
- 一个网络 chunk 可能包含多条 event；
- 处理 CRLF 和 LF；
- 忽略注释行；
- 识别 `[DONE]`；
- 连接中断时不能伪造 finish；
- AbortSignal/timeout 后停止读取 body。

## 实现步骤

1. 实现内部消息到 Provider 请求的纯映射。
2. 独立实现 SSE parser，不在 parser 中做业务映射。
3. 把 Provider delta 映射为内部 ModelStreamEvent。
4. 明确 finish reason 映射，未知值产生协议错误。
5. 合并调用方取消和请求超时，但保留不同错误分类。
6. 把 401/403 分类为 authentication。
7. 把 429 分类为 rate limit 且标记 retryable。
8. 把 5xx、断流、坏 JSON 和无 body 规范化。
9. 错误只保留安全摘要；不得包含 API key、Authorization 或完整 headers。
10. 用注入的 fake fetch 构造所有默认测试。
11. 可选 live smoke 必须由环境变量显式开启，且不计入正常验收。

## 步骤 adapter

创建 `test/step-adapters/step-05.adapter.ts`：

```ts
export function runProviderScenario(scenario: string): Promise<{
  status: string;
  eventTypes?: string[];
  toolArguments?: unknown;
  errorKind?: string;
  retryable?: boolean;
  credentialsExposed?: boolean;
}>;
```

至少支持这些 scenario：

- `text`
- `fragmented-tool-call`
- `unauthorized`
- `rate-limit`

建议 adapter 内部使用 fake fetch 返回真实格式的 SSE 字节流，不要直接伪造归一化事件。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 请求 | role、content、tool schema、model、header 映射 |
| 文本 | 任意字节分块后仍得到 text delta |
| 工具 | arguments 跨多个 frame 后得到对象 |
| 状态 | stop、length、tool calls |
| HTTP | 401、403、429、500 |
| 流 | 无 body、坏 JSON、断流、缺 DONE |
| 控制 | timeout、外部 abort |
| 安全 | 错误和事件中不出现 API key |

运行：

```powershell
npm run verify:step -- 05
```

## 退出清单

- [ ] Agent/core 不导入 Provider wire type。
- [ ] 默认测试零网络。
- [ ] SSE parser 有跨 chunk 测试。
- [ ] 取消与超时能停止 body 消费。
- [ ] 错误分类稳定且可用于后续重试策略。
- [ ] 凭据不进入错误、日志或测试快照。
- [ ] 本步测试通过。

## 常见错误

- AgentLoop 直接理解 OpenAI chunk。
- 简单按换行拆 SSE，忽略网络 chunk。
- timeout 和用户取消使用相同重试分类。
- 未知 finish reason 被猜成 stop。
- 把完整响应 headers 放进错误 details。
- 把真实公网测试作为唯一证据。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\model-runtime.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\provider-composer.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\provider\provider.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\session\turn.rs`
- Codex：`C:\code\projects\codex\codex-rs\model-provider\src\provider.rs`

## 学习记录问题

1. Provider 适配层应吸收哪些差异？
2. SSE parser 和 event mapper 为什么要分开？
3. timeout 与用户取消为何不能使用相同重试策略？
4. 哪些错误信息对调试有价值但又可能泄密？

