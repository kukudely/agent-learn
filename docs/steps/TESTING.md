# 分步骤验证机制

## 先说结论：你应该改哪里

| 目的 | 文件位置 | 是否由你编写 |
| --- | --- | --- |
| 实现 Agent 功能 | `src/**/*.ts` | 是 |
| 给自己的实现写单元测试 | `test/**/*.test.ts`，但排除 `test/steps` | 是 |
| 连接步骤验收 | `test/step-adapters/step-XX.adapter.ts` | Step 02 起需要 |
| 步骤验收题 | `test/steps/step-XX.test.ts` 和 `_contracts` | 否，默认只读 |
| 学习记录和架构决定 | `docs/` | 是 |

不要修改 `test/steps` 中的期望值来让失败消失。验收失败时，通常修改 `src` 中的真实实现；只有出现 `Missing export` 或 Adapter 导入错误时，才修改对应 Adapter。
## 为什么使用测试适配器

每个步骤都规定“可观察行为”，但不强制你的内部目录、类名或设计模式完全照搬参考项目。
因此，步骤测试通过一个很薄的适配器连接真实实现：

```text
真实实现
→ test/step-adapters/step-XX.adapter.ts
→ test/steps/step-XX.test.ts
```

适配器只能转接真实实现，不应重新实现功能。否则即使测试通过，也不能说明 Agent 本身正确。
每一步基础与扩展测试会调用的精确 scenario ID 见 [Adapter 场景目录](ADAPTER_SCENARIOS.md)。

## 命令

累计验证目标步骤以及所有前置步骤：

```powershell
npm run verify:step -- 08
```

只运行当前步骤，方便定位失败：

```powershell
npm run verify:step -- 08 --only
```

验证全部步骤：

```powershell
npm run verify:all
```

普通工程验证：

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

`npm test` 不会运行尚未开始的步骤契约。步骤契约只有通过 `verify:step` 或
`verify:all` 才会执行。

## 完成一个步骤的标准动作

1. 阅读对应的 `docs/steps/XX-*.md`。
2. 实现文档要求的能力。
3. 编写实现自己的单元测试。
4. 创建 `test/step-adapters/step-XX.adapter.ts`。
5. 先运行 `npm run verify:step -- XX --only`。
6. 修复当前步骤问题。
7. 运行 `npm run verify:step -- XX` 做累计回归。
8. 全部通过后，勾选文档中的退出条件。

## 三层测试职责

### 实现单元测试

由你随实现一起编写，覆盖内部算法和边界条件。

### 步骤验收测试

仓库预置，验证该步骤对外承诺的行为，不关心内部实现。

### 综合评测

后期步骤使用真实临时仓库、故障注入和固定任务集验证整个 Agent。

## 失败信息

如果适配器不存在，测试会提示需要创建的准确路径。如果导出缺失，测试会提示准确的
export 名称。行为不符合契约时，直接查看对应步骤测试中的输入和期望值。
