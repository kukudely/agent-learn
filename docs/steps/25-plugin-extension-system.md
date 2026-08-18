# 步骤 25：实现 Plugin/Extension 系统

## 本步目标

定义少量稳定扩展点，让插件注册工具、Provider 和 Hook，而不是把整个内部对象图暴露给任意代码。插件代码默认拥有宿主进程权限，因此信任和生命周期必须明确。

## 前置条件

- Project Trust、Tool Pipeline、Provider Registry 和 Session Event 已完成。
- 核心模块已有稳定公共接口。

## Manifest

```ts
export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly hostCompatibility: string;
  readonly entrypoint: string;
  readonly capabilities: readonly PluginCapability[];
}
```

第一版只开放：

- 注册 Tool；
- 注册 Provider；
- 订阅只读事件；
- `beforeToolCall`；
- `afterToolCall`；
- system/chat transform；
- setup/dispose。

不要开放 Workspace 原始文件系统句柄、Policy 内部 Map、Credential 明文或 AgentLoop 可变状态。

## 生命周期

```text
resolve
-> manifest validate
-> trust check
-> compatibility check
-> load
-> setup
-> run
-> dispose
```

每个阶段都有明确状态和错误。

## 推荐契约

```ts
export interface PluginContext {
  readonly tools: ToolRegistrationApi;
  readonly providers: ProviderRegistrationApi;
  readonly events: ReadonlyEventApi;
  readonly hooks: HookRegistrationApi;
  readonly logger: RedactedLogger;
}

export interface Plugin {
  setup(context: PluginContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface Disposable {
  dispose(): void | Promise<void>;
}
```

所有注册函数返回 Disposable，由 PluginHost 统一回收。

## 冲突和失败规则

- 插件 ID 唯一。
- 工具/Provider 名称重复不能靠加载顺序静默覆盖。
- Hook 顺序使用显式 priority，再按插件 ID 稳定排序。
- `beforeToolCall` 可返回结构化 deny/transform，但不能直接执行副作用。
- 一个插件 setup 失败不阻止健康插件和核心启动。
- pure mode 禁用所有外部插件。
- 未信任项目插件不得 resolve/execute。
- 插件工具仍进入 Tool Pipeline。

## 实现步骤

1. 定义 manifest schema 和 compatibility 规则。
2. 发现阶段只读 manifest，不执行 entrypoint。
3. 按 ID/来源建立 catalog 和冲突诊断。
4. trust + compatibility 通过后动态加载。
5. 给插件一个最小 capability-scoped context。
6. setup 期间收集所有 Disposable。
7. 注册工具和 Provider 时走现有 Registry API。
8. Hook runner 固定顺序和超时。
9. 明确 Hook 抛错策略：
   - before hook 安全失败；
   - after/telemetry hook 可隔离记录。
10. dispose 逆序执行全部资源。
11. setup 半途失败也 dispose 已注册项。
12. pure mode 下验证没有外部模块执行。

## 步骤 adapter

创建 `test/step-adapters/step-25.adapter.ts`：

```ts
export function runPluginScenario(
  root: string,
  scenario: string,
): Promise<{
  status: string;
  activePlugins?: string[];
  shadowedPlugins?: string[];
  failedPlugins?: string[];
  registrations?: string[];
  projectPluginActivated?: boolean;
  disposedResources?: number;
}>;
```

支持：

- `discover-and-activate`
- `invalid-and-duplicate`
- `untrusted-project`
- `unload`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| manifest | 有效、缺字段、不兼容版本 |
| 注册 | tool、provider、duplicate |
| Hook | 顺序、阻断、transform、抛错、timeout |
| 隔离 | 坏插件不影响健康插件 |
| trust | 未信任项目不加载 |
| pure | 外部插件全部禁用 |
| 权限 | 插件 Tool 不能绕 Pipeline |
| 生命周期 | setup、半失败、dispose、重复 dispose |
| 清理 | handler 和注册项全部移除 |

运行：

```powershell
npm run verify:step -- 25
```

## 退出清单

- [ ] 添加插件不修改 AgentLoop。
- [ ] 扩展 API 小而稳定。
- [ ] 冲突规则确定。
- [ ] 坏插件被隔离。
- [ ] 未信任项目不执行插件。
- [ ] Plugin Tool 经过 Policy。
- [ ] unload 后无 handler/registration 残留。
- [ ] 本步测试通过。

## 常见错误

- 将整个 AgentSession 暴露给插件。
- 发现 manifest 时就执行 entrypoint。
- 用目录顺序决定重复 ID。
- Hook 抛错导致核心无法启动。
- setup 失败不清理已注册资源。
- 插件直接拿到 Tool Executor 绕 Policy。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\extensions\loader.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\extensions\runner.ts`
- OpenCode：`C:\code\projects\opencode\packages\plugin\src\index.ts`
- Codex：`C:\code\projects\codex\codex-rs\plugin\src\manifest.rs`

## 学习记录问题

1. 稳定扩展点和暴露内部对象有何差别？
2. 哪些 Hook 失败必须安全阻断，哪些可以隔离？
3. pure mode 如何证明插件 entrypoint 没执行？
4. 插件代码与 Skill 文本的安全模型为何不同？

