# 步骤 13：实现 Shell Executor

## 本步目标

提供受限、结构化、可取消的本地进程执行能力。默认接口接收 `executable + args`，并使用 `shell: false`，避免把模型文本直接交给命令解释器。

## 前置条件

- Workspace 可提供受控 cwd。
- Agent 的根 AbortSignal 和输出预算可用。
- 你已明确 Shell 是高风险副作用能力。

## 推荐契约

```ts
export interface ExecutionRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export type ExecutionEvent =
  | { readonly type: "process.started"; readonly pid: number }
  | { readonly type: "stdout"; readonly chunk: string }
  | { readonly type: "stderr"; readonly chunk: string }
  | { readonly type: "process.exited"; readonly exitCode: number | null };

export interface ExecutionResult {
  readonly status: "completed" | "failed" | "cancelled";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}
```

## 安全边界

- Shell Executor 不决定是否允许执行；Policy 在它之前。
- cwd 必须来自 Workspace。
- env 使用 allowlist，不继承全部进程环境。
- executable 和 args 分离，不拼成字符串。
- 如果产品需要真正的 shell command，必须作为单独能力、单独策略和单独测试。
- 输出截断必须显式，不得无限缓冲。

## 实现步骤

1. 定义执行请求和事件。
2. 使用 `spawn(executable, args, { shell: false })`。
3. 过滤环境变量，只注入明确允许项。
4. 同时消费 stdout 和 stderr，避免任一管道阻塞。
5. 按 UTF-8 字节计算总输出上限。
6. 达到上限后标记 truncated，并按策略停止读取或终止进程。
7. 连接 timeout 和外部 AbortSignal。
8. 取消时先正常终止，再在短 grace period 后强制终止。
9. 尽力终止整个进程树，而不只是父进程。
10. 等待 exit、close、流完成和清理全部收敛。
11. 非零 exit 是结构化结果，不是 Executor 自身异常。
12. spawn 失败、cwd 无效等才是执行基础设施错误。
13. 事件和最终结果使用同一份收集状态。

## 步骤 adapter

创建 `test/step-adapters/step-13.adapter.ts`：

```ts
export function runShellScenario(scenario: string): Promise<{
  status: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  aborted?: boolean;
  activeProcessesAfter?: number;
  receivedArguments?: string[];
}>;
```

支持：

- `structured-arguments`
- `non-zero`
- `timeout`
- `abort`

结构化参数场景必须证明 `$(not-executed)` 和 `; still-an-argument` 没有被解释。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 正常 | stdout/stderr、exit 0 |
| 参数 | 空格、引号、分号、命令替换文本 |
| 退出 | 非零 exit code |
| 启动 | executable 不存在、cwd 无效 |
| 输出 | 大量 stdout/stderr、UTF-8 分块、截断 |
| 控制 | timeout、外部 abort |
| 进程树 | 子进程随取消收敛 |
| 环境 | 未授权变量不可见 |
| 清理 | 活跃进程、timer、listener 归零 |

运行：

```powershell
npm run verify:step -- 13
```

## 退出清单

- [ ] 默认 `shell: false`。
- [ ] 参数不会被 shell 展开。
- [ ] stdout/stderr 同时受限收集。
- [ ] 非零退出是结构化结果。
- [ ] timeout 和 abort 能终止进程树。
- [ ] 结束后活跃资源归零。
- [ ] 本步测试通过。

## 常见错误

- 把命令拼接成一个字符串。
- 默认继承全部环境变量。
- 只 kill 父进程。
- 只读 stdout 导致 stderr 填满后死锁。
- 取消后立刻返回，不等待资源清理。
- 把非零 exit 当 Executor 崩溃。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\bash.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\shell.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\exec.rs`
- Codex：`C:\code\projects\codex\codex-rs\process-hardening\src`

## 学习记录问题

1. 结构化 args 能防止哪些注入，不能防止哪些风险？
2. 非零退出为何不是 Executor 异常？
3. Windows 和 POSIX 的进程树终止有何不同？
4. 输出达到上限时应截断、取消还是两者都做？

