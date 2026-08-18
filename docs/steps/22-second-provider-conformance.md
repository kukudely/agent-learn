# 步骤 22：增加第二个 Provider 和一致性测试

## 本步目标

接入一个 wire protocol 明显不同的第二 Provider，并用统一 conformance suite 证明 AgentLoop 不需要修改。第二实现的价值是暴露抽象泄漏，而不是增加厂商数量。

## 前置条件

- 第一个 Provider 的 mapping 和错误分类稳定。
- Context Builder 输出 canonical ModelContext。
- CredentialProvider 可用。

## 推荐契约

```ts
export interface ModelCapabilities {
  readonly toolCalling: boolean;
  readonly parallelToolCalls: boolean;
  readonly reasoning: boolean;
  readonly vision: boolean;
  readonly structuredOutput: boolean;
  readonly contextLimit?: number;
  readonly outputLimit?: number;
}

export interface ModelInfo {
  readonly id: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;
}

export interface ProviderFactory {
  create(
    config: unknown,
    credentials: CredentialProvider,
    transport: unknown,
  ): ModelClient;
}
```

不支持能力必须在网络请求前抛 `UnsupportedCapabilityError`，不能静默删除图片、工具或结构化输出要求。

## 归一化规则

- stop/tool_calls/length/error/aborted 清晰映射。
- usage 缺失使用 `undefined`，不能填 0 冒充已知。
- 工具参数跨 frame 以 call ID/index 组装。
- 完整 JSON 后才发 completed call。
- Provider 原始对象只放可选 metadata，不影响 replay。
- Provider-specific prompt transform 只在 adapter 内。

## 实现步骤

1. 冻结现有 canonical ModelClient。
2. 选择差异足够大的第二协议。
3. 分离其 wire types、request mapper、stream parser 和 event mapper。
4. 认证只通过 CredentialProvider。
5. 映射 401、429、5xx、timeout、malformed、context overflow。
6. 在请求前做 capability preflight。
7. 注册 ProviderFactory。
8. 抽取第一个 Provider 也能运行的 conformance fixture。
9. 为两者提供 fake transport 和录制响应。
10. 对 canonical event 进行跨 Provider snapshot 比较。
11. 检查 AgentLoop 不导入或分支具体 Provider。
12. live smoke 独立标记且非验收必需。

## 步骤 adapter

创建 `test/step-adapters/step-22.adapter.ts`：

```ts
export function runProviderConformance(): Promise<{
  providers: Array<{
    id: string;
    protocol: string;
    passedScenarios: string[];
    secretsExposed: boolean;
  }>;
  agentLoopProviderBranches: number;
  canonicalSnapshotsEqual: boolean;
}>;
```

每个 Provider 至少通过：

- `text`
- `tool-call-fragments`
- `abort`
- `timeout`
- `authentication-error`
- `rate-limit`
- `malformed-stream`
- `unsupported-capability`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 文本 | 流式 delta |
| 工具 | single/multi、参数 fragment |
| 内容 | mixed content |
| 控制 | abort、timeout |
| HTTP | 401、429、5xx |
| 流错误 | premature、malformed |
| usage | 已知、未知、cache/reasoning |
| capability | tools、vision、structured output |
| 安全 | 凭据不泄露 |
| 架构 | AgentLoop provider branches = 0 |

运行：

```powershell
npm run verify:step -- 22
```

## 退出清单

- [ ] 至少两个不同协议 Provider。
- [ ] 两者运行同一 conformance suite。
- [ ] canonical snapshot 兼容。
- [ ] 不支持能力显式失败。
- [ ] AgentLoop 无 Provider 分支。
- [ ] 默认测试零网络。
- [ ] 本步测试通过。

## 常见错误

- 第二 Provider 复制第一协议，没有验证抽象。
- AgentLoop 按 Provider 名称 if/else。
- 不支持 vision 时静默删图。
- 缺 usage 填 0。
- vendor SDK 类型扩散到 core。
- live test 成为唯一证据。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\model-runtime.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\provider-composer.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\provider\provider.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\llm.ts`
- Codex：`C:\code\projects\codex\codex-rs\model-provider\src\provider.rs`
- Codex：`C:\code\projects\codex\codex-rs\model-provider-info\src\lib.rs`

## 学习记录问题

1. 第二协议暴露了哪处抽象泄漏？
2. 哪些 usage 能归一，哪些只能保持 unknown？
3. capability 应在何时检查？
4. Conformance test 与 live smoke 的职责有何不同？

