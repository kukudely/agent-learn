# 步骤 10：建立 Workspace 和路径安全模型

## 本步目标

建立唯一的文件路径解析边界，防止 traversal、绝对路径、盘符、UNC、路径前缀混淆和符号链接逃逸。后续所有文件工具只能依赖 Workspace，不能接收裸 root。

## 前置条件

- 步骤 00 中已定义 Workspace 为能力边界。
- 熟悉 `path.resolve`、`path.relative`、`realpath` 和符号链接。

## 推荐契约

```ts
export interface ResolvedWorkspacePath {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly rootPath: string;
}

export class Workspace {
  readonly rootPath: string;

  static open(rootPath: string): Promise<Workspace>;

  resolveExisting(
    userPath: string,
    options?: { kind?: "file" | "directory" | "any" },
  ): Promise<ResolvedWorkspacePath>;

  resolveForCreation(userPath: string): Promise<ResolvedWorkspacePath>;
  contains(absolutePath: string): Promise<boolean>;
}
```

## 安全算法

1. root 必须存在，并在创建 Workspace 时 `realpath`。
2. 输入拒绝：
   - 空值和 NUL；
   - POSIX 绝对路径；
   - Windows 盘符路径；
   - UNC 路径。
3. 使用平台路径 API 解析，不使用字符串拼接。
4. 现有目标先 `realpath`，再用 `path.relative(root, target)` 判断。
5. 创建目标要对最近存在的父目录 `realpath`。
6. 默认拒绝指向 root 外部的 symlink。
7. 错误只暴露用户相对路径，不泄露外部绝对路径。
8. 文档说明 TOCTOU：高风险写操作仍需在打开文件后确认。

`startsWith(root)` 不是有效边界判断：`C:\work-evil` 会匹配 `C:\work` 前缀。

## 实现步骤

1. 把 Windows、POSIX 绝对路径识别抽成纯函数。
2. 写 `isWithin(root, target)`，只用 `path.relative`。
3. 实现 Workspace.open 和 root realpath。
4. 实现词法输入检查。
5. 实现 existing path 的 realpath 检查。
6. 实现 creation path 的父目录检查。
7. 增加 kind 校验。
8. 规范化输出相对路径为 `/` 分隔。
9. 为所有错误定义 reason code。
10. 用临时目录创建 root、prefix sibling 和 symlink fixture。

## 步骤 adapter

创建 `test/step-adapters/step-10.adapter.ts`：

```ts
export function createWorkspace(root: string): Promise<{
  resolveForRead(path: string): string | Promise<string>;
  resolveForWrite(path: string): string | Promise<string>;
}>;
```

成功时返回规范化后的绝对路径；任何越界尝试必须 reject。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 正常 | `.`、嵌套文件、目录 |
| traversal | `../secret`、多层 `..` |
| 绝对路径 | `/etc/...`、`C:\...`、UNC |
| 前缀 | root=`work`，目标=`work-other` |
| symlink | 指向内部、指向外部 |
| 创建 | leaf 不存在但父目录合法 |
| kind | 文件当目录、目录当文件 |
| 异常输入 | 空、NUL、缺失路径 |

运行：

```powershell
npm run verify:step -- 10
```

## 退出清单

- [ ] 文件模块只接收 Workspace。
- [ ] 边界判断不使用 `startsWith`。
- [ ] 跨平台绝对路径均识别。
- [ ] 现有路径检查 realpath。
- [ ] 创建路径检查真实父目录。
- [ ] symlink escape 有测试。
- [ ] 本步测试通过。

## 常见错误

- 只做 `path.resolve(root, input)`。
- 使用字符串前缀判断。
- 只防 `../`，不防盘符和 UNC。
- 只检查词法路径，不检查 realpath。
- 创建目标不存在就跳过所有检查。
- 错误中泄露工作区外绝对路径。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\path-utils.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\docs\security.md`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\permission\index.ts`
- Codex：`C:\code\projects\codex\codex-rs\sandboxing\src\manager.rs`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\approvals.rs`

## 学习记录问题

1. 为什么 `resolve(...).startsWith(root)` 不安全？
2. Workspace 边界与 OS Sandbox 各防御什么？
3. 不存在目标的 symlink escape 如何检查？
4. TOCTOU 在本地 Agent 中何时值得额外防御？

