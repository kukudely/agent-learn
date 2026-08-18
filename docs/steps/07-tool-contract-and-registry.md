# 步骤 07：定义工具协议、Schema 和注册表

## 本步目标

让模型可见的工具 schema 和本地执行函数来自同一份定义，并通过注册表完成查找、参数校验、执行和错误规范化。

## 前置条件

- 步骤 02 的 ToolCall/ToolResult 协议。
- 步骤 06 的 Agent 事件。
- 选择一个 JSON Schema 运行时，例如 TypeBox + AJV，或 Zod 转 JSON Schema。

## 推荐契约

```ts
export interface ToolContext {
  readonly signal: AbortSignal;
  readonly runId: string;
}

export interface ToolDefinition<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  parseInput(value: unknown): TInput;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

export interface ToolExecutionResult {
  readonly toolCallId: string;
  readonly name: string;
  readonly output: unknown;
  readonly isError: boolean;
}

export class ToolRegistry {
  register(tool: ToolDefinition<unknown, unknown>): void;
  list(): readonly ToolDefinition<unknown, unknown>[];
  toModelSpecs(): readonly ModelToolSpec[];
  invoke(
    invocation: ToolInvocation,
    context: ToolContext,
  ): Promise<ToolExecutionResult>;
}
```

## 错误分类

- 未知工具：结构化错误结果，`executed = false`。
- 参数无效：结构化 validation error，执行器不能被调用。
- 普通工具异常：结构化错误结果，`executed = true`。
- 取消：继续抛出取消错误，不能伪装成普通工具结果。
- Registry 内部不变量破坏：终止 Run。

## 实现步骤

1. 固定工具名称格式和大小写规则。
2. `defineTool` 同时产生类型推导和模型 schema。
3. 注册时验证名称、描述、schema。
4. 注册时编译 schema，一次编译，多次调用。
5. 拒绝重复工具名。
6. `list()` 返回稳定排序的只读快照。
7. `toModelSpecs()` 去除执行函数。
8. 调用顺序固定为：查找 -> 校验 -> 执行 -> 输出序列化检查。
9. 限制错误输出大小。
10. 验证工具输出可以 JSON 序列化。
11. 让执行器始终观察 AbortSignal。

## 步骤 adapter

创建 `test/step-adapters/step-07.adapter.ts`：

```ts
export function runToolRegistryScenario(scenario: string): Promise<{
  status: string;
  executed: boolean;
  isError?: boolean;
  toolCallId?: string;
}>;
```

必须支持：

- `success`
- `invalid-arguments`
- `unknown-tool`
- `tool-error`
- `duplicate-registration`

最后一个场景应 reject。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 注册 | 添加、查询、稳定 list |
| schema | 有效、缺字段、错类型、额外字段 |
| 调用 | call ID 原样关联 |
| 未知 | 未知工具不执行 |
| 异常 | executor 抛错后规范化 |
| 重复 | 注册同名工具失败 |
| 输出 | 不可序列化值、超大错误 |
| 取消 | ABORTED 不被包装 |

运行：

```powershell
npm run verify:step -- 07
```

## 退出清单

- [ ] 模型 schema 和执行输入来自同一定义。
- [ ] 所有调用先校验再执行。
- [ ] schema 只编译一次。
- [ ] 错误语义稳定。
- [ ] list 不暴露内部 Map。
- [ ] 本步测试通过。

## 常见错误

- TS interface 和 JSON Schema 手写两份。
- 每次调用都重新编译 schema。
- 所有错误都变成字符串。
- 未知工具仍尝试执行。
- 取消被变成 `isError: true` 后循环继续。
- 允许模型拿到执行函数。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\index.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\registry.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\tools.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\spec_plan.rs`

## 学习记录问题

1. 工具验证应在 Provider、Loop 还是 Registry 完成？
2. 什么错误应回传模型，什么错误必须终止 Run？
3. 为什么取消不能作为普通工具错误？
4. 如何证明模型看到的 schema 与真实校验一致？

