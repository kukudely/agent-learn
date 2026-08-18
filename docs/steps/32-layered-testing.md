# 步骤 32：建立分层测试体系

## 本步目标

把已有步骤契约整理为完整测试金字塔，让不同层回答不同问题，并通过故障注入、资源泄漏检查和关键模块 mutation check 证明断言真的有效。

## 前置条件

- 步骤 00–31 的核心实现和步骤测试已存在。
- 外部依赖都有 Fake/recording transport。
- 测试能注入 clock、ID、随机数、文件系统根和 signal。

## 分层职责

### 单元测试

验证纯函数和小状态机：

- message/schema；
- EventStream；
- Rule Engine；
- Context Builder；
- Session Reducer；
- path boundary；
- budget/retry。

禁止真实网络、用户目录和真实模型。

### 契约测试

同一套行为验证多个实现：

- Provider Conformance；
- Tool Conformance；
- SessionRepository Conformance；
- ExecutionBackend Conformance；
- Client Transport/API Contract；
- Plugin/MCP adapter。

### 集成测试

组合真实本地模块和 Fake 外部边界：

- Scripted Provider + AgentLoop + ToolRegistry；
- Fake MCP Server；
- JSONL reopen/recovery；
- Shell + Policy + Backend；
- Plugin lifecycle。

### Failure/Security 测试

主动注入：

- 网络断开、429、流中断；
- 工具永不结束、输出过大；
- 磁盘满、JSONL 半行；
- 子进程崩溃；
- MCP Server 崩溃；
- Plugin Hook 抛错；
- approval 时取消；
- traversal、symlink、prompt injection。

### E2E

使用完全离线或录制模型完成真实任务流程。

### Live Smoke

只验证真实 Provider/MCP 基础协议仍可用，不作为核心行为唯一证据，默认不运行。

## 推荐目录

```text
test/
  unit/
  contract/
  integration/
  failure/
  security/
  e2e/
  fixtures/
  steps/
  step-adapters/
```

可以保持自己的布局，但每类测试必须可单独运行和统计。

## 测试基础设施

- `FakeClock` 和可取消 sleep；
- deterministic ID factory；
- temp workspace fixture；
- Scripted Model；
- recording fetch/transport；
- Fake Approval；
- Fake MCP Server；
- fault-injecting filesystem/repository；
- resource tracker；
- secret scanner；
- event recorder；
- test timeout 和 unhandled rejection guard。

## 实现步骤

1. 盘点现有测试并按职责分类。
2. 抽取可复用 conformance suites。
3. 禁止单元/核心集成测试真实网络。
4. 每个 fixture 使用独立 temp root。
5. 所有 clock、ID 和 retry delay 可注入。
6. 在测试 teardown 检查 process/timer/listener/lock。
7. 添加 unhandled rejection 和 console error guard。
8. 建立故障注入表，保证每个外部边界至少一个失败测试。
9. 把每个历史 Bug 转成回归测试。
10. 对 path、policy、budget、result ordering 等关键模块运行 mutation testing。
11. mutation survivor 必须解释或新增断言。
12. 分离 default、step、e2e、live 命令。
13. 生成 coverage 和 flaky test 报告，但不把行覆盖率当唯一目标。
14. 在 CI 重复运行关键并发测试。

## 步骤 adapter

创建 `test/step-adapters/step-32.adapter.ts`：

```ts
export function inspectTestingArchitecture(): Promise<{
  status: string;
  layers: Record<string, number>;
  realNetworkCalls: number;
  flakyTimerTests: number;
  sharedMutableFixtures: number;
  raceChecksPassed: boolean;
  leakChecksPassed: boolean;
  mutationSurvivorsInCriticalModules: number;
}>;
```

`layers` 至少包含：

- `unit`
- `contract`
- `integration`
- `failure`
- `security`
- `end_to_end`

adapter 应调用真实测试清单/报告检查器，而不是写死数字。

## 测试矩阵

| 类别 | 验证 |
| --- | --- |
| 单元 | 纯函数，无 I/O |
| 契约 | 每个多实现边界 |
| 集成 | 模块组合和真实本地 I/O |
| failure | 每个外部边界主动故障 |
| security | 路径、权限、注入、秘密 |
| E2E | 完整用户任务 |
| determinism | 重复结果一致 |
| race | 并发/取消压力 |
| leak | timer、process、listener、handle |
| mutation | 关键不变量 mutation 被测试杀死 |

运行：

```powershell
npm run verify:step -- 32
```

## 退出清单

- [ ] 六个测试层都有实质场景。
- [ ] 核心测试不依赖真实模型/网络。
- [ ] fixture 不共享可变状态。
- [ ] 并发与取消有重复压力测试。
- [ ] teardown 无资源泄漏。
- [ ] 关键模块 mutation survivor 为 0。
- [ ] live smoke 独立且 opt-in。
- [ ] 本步测试通过。

## 常见错误

- 所有测试都叫 integration。
- 用真实 sleep 和公网。
- fixture 共享 Session 导致顺序依赖。
- 只看覆盖率，不验证断言强度。
- 对并发只跑一次 happy path。
- 测试结束不检查后台进程。

## 本地源码锚点

- Pi：查看各 package 的 `test` 目录和 faux provider。
- OpenCode：查看 `packages/opencode/test` 的 Session/Tool/Provider fixtures。
- Codex：查看 `codex-rs` 各 crate 的 unit/integration tests 与 test support。

## 学习记录问题

1. 契约测试与集成测试的边界是什么？
2. 为什么行覆盖率不能证明测试有效？
3. 哪些模块最值得 mutation testing？
4. 如何发现只在 teardown 后出现的资源泄漏？

