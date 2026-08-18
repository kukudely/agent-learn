# JS/TS 初学者从这里开始

这不是一个“读完所有文档再动手”的课程。正确用法是：**一次只做一个步骤，每一步都在指定文件中写一点内容，然后运行测试获取反馈。**

如果你现在只想知道下一步做什么，请看本文的“你当前应该做什么”。

## 先认清四类目录

```text
agent-learn/
├─ src/                         你写 Agent 正式代码的主要位置
├─ test/
│  ├─ steps/                   预置验收题，不要为了通过而修改
│  ├─ step-adapters/           把你的 src 实现接到验收题
│  └─ 其他目录                 你自己写的单元测试
└─ docs/
   ├─ adr/                     架构决定，记录“为什么这样设计”
   └─ steps/                   每一步的任务说明
```

最重要的规则：

- 正式实现写在 `src/`。
- 自己的单元测试写在 `test/`，但不要写进 `test/steps/`。
- `test/steps/` 相当于老师出的验收题，通常只读不改。
- Step 02 以后，每一步还要写一个很薄的 `test/step-adapters/step-XX.adapter.ts`。
- Adapter 只负责调用 `src/` 中的代码，不能把功能偷偷实现到 Adapter 里。

## 一个步骤到底怎么做

以后每一步都按这个固定循环进行：

```text
阅读当前步骤
  -> 找到“新手任务卡”
  -> 在任务卡列出的 src 文件中实现
  -> 给实现写单元测试
  -> 编写 step adapter
  -> 运行当前步骤验收
  -> 根据第一条错误继续修改
  -> 当前步骤通过
  -> 运行累计验收
```

对应命令：

```powershell
# 1. 开发过程中随时运行，检查你自己的代码
npm run typecheck
npm test

# 2. 只检查当前步骤，例如 Step 02
npm run verify:step -- 02 --only

# 3. 当前步骤通过后，再检查 Step 00 到 Step 02
npm run verify:step -- 02
```

`--only` 只表示“步骤验收只选择当前步骤”。命令仍会先运行类型检查、lint 和普通单元测试，这是正常的。

## 测试失败时怎么看

不要从整屏输出的第一行开始猜，先找最下面的 `FAIL`：

```text
FAIL  test/steps/step-02.test.ts > ... > ...
```

然后看错误属于哪一类：

| 错误 | 含义 | 应该去哪里改 |
| --- | --- | --- |
| `Cannot find module` | 文件还没创建或导入路径错误 | 对应的 `src/...` 或 Adapter |
| `Missing export` | Adapter 没导出测试要求的函数 | `test/step-adapters/step-XX.adapter.ts` |
| `expected ...` | 实际行为与契约不同 | 通常修改 `src/...` 的真实实现 |
| TypeScript 报错 | 类型不一致 | 报错指向的 `.ts` 文件 |
| lint 报错 | 格式或代码规则不符合 | 运行 `npm run format`，再处理剩余问题 |

一次只处理第一条真正的失败。第一条修复后，后面的错误经常会一起消失。

## 你当前应该做什么

当前仓库状态：

- Step 00 的 ADR 已创建并通过测试；
- Step 01 的工程骨架已初始化；
- Agent 功能尚未开始实现；
- Step 02 是第一个真正需要你编写 TypeScript 的步骤。

但如果你是 JS/TS 初学者，不要直接跳过前两步。按下面顺序操作。

### 任务 A：理解 Step 00，不写 TypeScript

打开：

```text
docs/adr/0001-agent-scope.md
```

用自己的话修改其中三处：

1. 在“背景与学习目标”中写一句你想实现 Agent 的原因；
2. 在“非目标”中补一项你暂时不准备实现的能力；
3. 在“不可变约束”中选一条，追加一句你认为应该怎样测试。

然后运行：

```powershell
npm run verify:step -- 00 --only
```

这一步的目的不是练 TypeScript，而是先确定“要做什么”和“暂时不做什么”。

### 任务 B：理解 Step 01 的工程工具

依次打开以下文件，不需要重写：

```text
package.json
tsconfig.json
vitest.config.ts
src/index.ts
src/cli.ts
test/smoke.test.ts
```

分别运行：

```powershell
npm run typecheck
npm test
npm run lint
npm run build
npm run verify:step -- 01
```

你只需要能够回答：

- `src` 和 `test` 分别放什么？
- `npm test` 和 `verify:step` 有什么区别？
- TypeScript 为什么要先 typecheck 再运行？

### 任务 C：从 Step 02 开始写 Agent 代码

打开 [Step 02](02-message-and-content-protocol.md)，先看其中的“新手任务卡”。它会明确告诉你：

- 创建哪些文件；
- 每个文件写什么；
- 先实现哪个最小函数；
- 单元测试写在哪里；
- Adapter 写在哪里；
- 最后运行哪条命令。

后续步骤不知道文件放哪里时，查看 [Step 00–34 实现文件地图](IMPLEMENTATION_MAP.md)。

## JS/TS 不熟时的最低知识清单

开始 Step 02 前，只需先理解这些语法：

- `type` 和 `interface`：描述数据形状；
- `export` / `import`：跨文件使用代码；
- 联合类型 `A | B`；
- 字面量类型，例如 `"user" | "assistant"`；
- 数组 `T[]` 和只读数组 `readonly T[]`；
- `unknown`：尚未验证的外部数据；
- 类型收窄：用 `if (value.type === "text")` 判断联合分支；
- `async` / `await` 和 `Promise`；
- Vitest 的 `describe`、`it`、`expect`。

不需要先学完高级泛型、装饰器、前端框架或 Node.js 全部 API。遇到一个语法再补一个即可。

## 什么时候算真正完成一步

同时满足以下条件才算完成：

- 你能用自己的话解释本步解决了什么问题；
- 真实功能写在 `src/`，不是写在 Adapter；
- 至少有一个自己编写的单元测试；
- `npm run verify:step -- XX --only` 通过；
- `npm run verify:step -- XX` 累计通过。
