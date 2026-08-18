# 步骤 30：引入可替换的 Sandbox Backend

## 本步目标

把 Shell Executor 的“如何执行”抽象为可替换 Backend，并引入真正的执行 containment。Policy 决定“是否允许尝试”，Sandbox 决定“即使被允许，进程实际能触达什么”。

## 前置条件

- Structured Shell Executor 已稳定。
- Policy 和 Approval 独立于 Executor。
- Headless Server 能显式传 Workspace 和执行 profile。

## 威胁模型

至少记录：

- 恶意命令读取工作区外文件；
- 写入未授权目录；
- 访问网络或本机服务；
- 创建逃逸子进程；
- symlink/mount 路径逃逸；
- CPU、内存、进程数、磁盘耗尽；
- 通过环境变量或继承句柄获取秘密；
- Sandbox denied 后诱导系统自动升级权限。

不要因为传入几条路径字符串就宣称“已沙箱化”。平台安全机制和已知限制必须写入 ADR。

## 推荐契约

```ts
export interface SandboxProfile {
  readonly readableRoots: readonly string[];
  readonly writableRoots: readonly string[];
  readonly network: "none" | "restricted" | "full";
  readonly maxMemoryBytes?: number;
  readonly maxCpuTimeMs?: number;
  readonly maxProcesses?: number;
}

export interface ExecutionBackend {
  readonly name: string;
  readonly capabilities: readonly string[];
  execute(
    request: ExecutionRequest,
    profile: SandboxProfile,
    signal: AbortSignal,
  ): AsyncIterable<ExecutionEvent>;
}
```

提供：

1. `LocalExecutionBackend`：用于开发和 contract 基准，明确不是强隔离；
2. 一个真实隔离 Backend：容器或平台专用方案；
3. Fake Backend：用于错误和能力测试。

## 平台方向

- Linux：容器、namespace、bubblewrap、seccomp 等。
- macOS：Seatbelt 或外部容器。
- Windows：Restricted Token、Job Object、AppContainer 或外部虚拟化。

优先集成经过验证的现有方案，不轻易自制内核级机制。

## 实现步骤

1. 写 Sandbox Threat Model ADR。
2. 从 Shell Executor 抽取 ExecutionBackend。
3. 为 Backend 定义 capability discovery。
4. 实现 Local Backend 并跑现有回归。
5. 选择一个平台隔离 Backend。
6. 把 Workspace roots 映射到 sandbox mounts/rules。
7. 默认网络关闭，按 profile 显式开启。
8. 过滤 env、handles 和 host paths。
9. 设置 CPU、内存、进程数和 wall time 限制。
10. 子进程必须留在隔离/Job/cgroup 中。
11. denied 是结构化 SandboxViolation。
12. 如需升级 profile，重新走 Policy 和 Approval，不能自动 fallback Local。
13. 为所有 Backend 抽取 conformance suite。
14. 报告每个平台的已知限制和不可测试假设。

## 步骤 adapter

创建 `test/step-adapters/step-30.adapter.ts`：

```ts
export function runSandboxConformance(): Promise<{
  backends: Array<{
    name: string;
    passedScenarios: string[];
    capabilities: string[];
  }>;
  hostEscapeSucceeded: boolean;
  policyBypassSucceeded: boolean;
  activeProcessesAfter: number;
}>;
```

至少两个 Backend 通过：

- `stdout-stderr`
- `non-zero-exit`
- `working-directory`
- `environment-filtering`
- `timeout`
- `abort`
- `output-limit`
- `filesystem-policy`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 文件 | 读/写允许目录与拒绝目录 |
| 网络 | no network、restricted、allowed |
| 路径 | symlink、mount、prefix escape |
| 进程 | child/grandchild、进程数限制 |
| 资源 | CPU、内存、输出、wall time |
| 环境 | secret env 不继承 |
| fallback | denied 后不自动 Local |
| 审批 | profile 升级重新审批 |
| conformance | Local/isolated 共用执行语义 |
| 清理 | active process/cgroup/job 为 0 |

运行：

```powershell
npm run verify:step -- 30
```

## 退出清单

- [ ] ToolExecutor 可切换 Backend。
- [ ] 至少一个真实隔离 Backend。
- [ ] Policy allow 不等于 Sandbox unrestricted。
- [ ] denied 不自动降级到 Local。
- [ ] 网络和文件系统分别测试。
- [ ] 资源限制和子进程收敛。
- [ ] Threat Model 与已知限制已记录。
- [ ] 本步测试通过。

## 常见错误

- 把路径 allowlist 称为完整 Sandbox。
- Policy allow 后自动关闭 Sandbox。
- 隔离失败时静默使用 Local。
- 只测试父进程，不测试子进程。
- 网络与文件隔离混为一个开关。
- 自制平台安全机制但没有威胁模型。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\docs\security.md`
- Codex：`C:\code\projects\codex\codex-rs\sandboxing\src\manager.rs`
- Codex：`C:\code\projects\codex\codex-rs\linux-sandbox\src\lib.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\orchestrator.rs`
- OpenCode：对照其 Shell/Permission 实现，辨别权限控制与强隔离的边界。

## 学习记录问题

1. Policy 与 Sandbox 分别假设攻击者是谁？
2. 为什么 Sandbox denied 后不能自动 fallback？
3. Local Backend 的 conformance 价值是什么？
4. 哪些平台限制必须明确告诉用户？

