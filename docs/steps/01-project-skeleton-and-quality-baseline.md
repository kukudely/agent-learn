# 步骤 01：建立项目骨架和质量基线

## 新手任务卡：这一阶段到底写什么

当前项目骨架已经初始化，所以本步骤不是让你重新搭建项目，而是让你认识以后每天都会用到的工具。

| 文件 | 你只需要先看懂什么 |
| --- | --- |
| `package.json` | `scripts` 中每条 npm 命令叫什么 |
| `tsconfig.json` | `strict` 等严格类型选项是否开启 |
| `vitest.config.ts` | 普通 `npm test` 为什么不运行未来步骤 |
| `src/index.ts` | 项目对外导出的入口 |
| `src/cli.ts` | Node.js 从哪里启动 |
| `test/smoke.test.ts` | 最简单的 Vitest 测试长什么样 |

依次运行：

```powershell
npm run typecheck
npm test
npm run lint
npm run build
npm run verify:step -- 01
```

本步骤暂时不要求新增业务代码。你应该能回答：`src` 和 `test` 分别放什么；`npm test` 和 `verify:step` 有何区别；`dist` 为什么不能直接修改。不要修改 `test/steps/step-01.test.ts` 来绕过配置检查。

## 本步目标

建立一个可编译、可测试、可格式化的严格 TypeScript 项目。此时业务代码可以很少，但任何后续步骤都必须能够独立运行质量门禁。

预期结果：

- Node.js 22、ESM、严格 TypeScript；
- `src`、`test`、`docs` 的清晰边界；
- 统一公共入口；
- `start`、`build`、`typecheck`、`test`、`lint`、`format` 六个基础命令；
- `verify:step` 和 `verify:all` 步骤验收命令；
- 日常测试不会因未来步骤尚未实现而失败。

## 前置条件

- 已完成步骤 00。
- 已安装 Node.js 22 或兼容版本。

## 核心概念

- **质量门禁**：任何功能完成前都要经过类型、风格、单元和构建验证。
- **公共入口**：调用方只依赖稳定导出，不依赖内部文件路径。
- **显式依赖注入**：核心代码不直接读 `process.argv`、环境变量、全局 stdout 或真实网络。
- **日常测试与学习关卡分离**：`npm test` 只跑已存在的基础测试；`verify:step` 才加载课程契约。

## 推荐目录

```text
src/
  agent/
  core/
  model/
  tools/
  workspace/
  session/
  config/
  cli/
  testing/
test/
  steps/
  step-adapters/
  verification/
docs/
  adr/
  steps/
```

不要为了让目录“看起来完整”而创建大量空实现。模块在真正进入对应步骤时再加入。

## 推荐公开契约

`src/errors.ts`：

```ts
export type AgentErrorCode =
  | "INVALID_ARGUMENT"
  | "PROTOCOL_ERROR"
  | "MODEL_ERROR"
  | "TOOL_ERROR"
  | "PATH_VIOLATION"
  | "ABORTED"
  | "LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}
```

`src/cli/run-cli.ts`：

```ts
export interface CliIO {
  writeStdout(text: string): void | Promise<void>;
  writeStderr(text: string): void | Promise<void>;
}

export function runCli(
  argv: readonly string[],
  dependencies: { readonly io: CliIO },
): Promise<number>;
```

CLI 返回退出码，不在核心逻辑里调用 `process.exit()`。

## 实现步骤

1. 配置 `package.json` 的 ESM 和脚本。
2. 在 `tsconfig.json` 开启：
   - `strict`
   - `noUncheckedIndexedAccess`
   - `exactOptionalPropertyTypes`
   - `useUnknownInCatchVariables`
3. 配置 Vitest，明确排除 `test/steps/**`。
4. 配置 Biome 或等价工具统一 lint 与 format。
5. 创建最小 `src/index.ts` 和 CLI 入口。
6. 写一个不访问外部资源的 smoke test。
7. 确保 `.gitignore` 包含 `node_modules/`、`dist/`、`coverage/`。
8. 把总体计划和步骤索引链接到 `README.md`。
9. 理解 `src/verification/verify-step.ts` 如何选择累计步骤。
10. 分别运行所有基础命令。

## 测试契约

本步不需要 adapter。`test/steps/step-01.test.ts` 直接读取项目配置：

| 类别 | 验证内容 |
| --- | --- |
| 命令 | 六个基础 npm script 均存在 |
| 类型 | 四个严格选项为 `true` |
| Git | 依赖、构建、覆盖率目录被忽略 |
| 导航 | README 链接总体计划 |

运行本步：

```powershell
npm run verify:step -- 01 --only
```

运行 `--only` 是为了单独验收骨架；去掉它会累计执行步骤 00 和 01。

## 退出清单

- [ ] `npm run typecheck` 通过。
- [ ] `npm run lint` 通过。
- [ ] `npm test` 通过。
- [ ] `npm run build` 通过。
- [ ] 基础测试不访问真实网络。
- [ ] 核心模块没有直接使用全局 CLI I/O。
- [ ] `npm run verify:step -- 01 --only` 通过。

## 常见错误

- `npm test` 默认加载全部未来关卡，导致刚初始化就全红。
- 核心逻辑直接写 `console.log` 或调用 `process.exit`。
- TS 配置看似 strict，却关闭了关键检查。
- 公共入口把所有内部类型都导出。
- ESM 测试导入和构建导入使用不一致的扩展名。
- 格式化命令与 lint 使用冲突规则。

## 本地源码锚点

- Pi：`C:\code\projects\pi\package.json`
- Pi：`C:\code\projects\pi\packages\coding-agent\package.json`
- OpenCode：`C:\code\projects\opencode\package.json`
- OpenCode：`C:\code\projects\opencode\packages\opencode\package.json`
- Codex：`C:\code\projects\codex\codex-rs\Cargo.toml`
- Codex：`C:\code\projects\codex\codex-rs\core\Cargo.toml`

## 学习记录问题

1. 为什么依赖注入会直接提高测试质量？
2. 哪些内部导出一旦公开最难收回？
3. 为什么未来关卡不应混入日常测试？
4. 构建通过而类型检查失败时，哪个结果更可信？

