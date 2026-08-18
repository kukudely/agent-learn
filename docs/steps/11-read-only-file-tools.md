# 步骤 11：实现只读文件工具

## 本步目标

实现四个受 Workspace 约束的只读工具：

- `read_file`
- `list_directory`
- `find_files`
- `search_text`

输出必须结构化、排序稳定、大小有限、可取消，而且不能依赖 shell 命令。

## 前置条件

- ToolRegistry 和 Workspace 已完成。
- 已明确 UTF-8、二进制、symlink 和截断策略。

## 推荐输出契约

```ts
export interface ReadFileOutput {
  readonly path: string;
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  readonly truncated: boolean;
}

export interface DirectoryEntry {
  readonly path: string;
  readonly name: string;
  readonly type: "file" | "directory" | "symlink" | "other";
  readonly size?: number;
}

export interface SearchOutput<T> {
  readonly matches: readonly T[];
  readonly truncated: boolean;
}
```

## 行为约束

- 输出路径全部是 `/` 分隔的 workspace 相对路径。
- 目录项和匹配结果稳定排序。
- 行号、列号从 1 开始。
- 明显二进制内容返回结构化标记或工具错误。
- 达到字节、行数、深度或结果数量上限时显式 `truncated: true`。
- 遍历每一批目录或读取新文件前检查 AbortSignal。
- 不跟随逃逸 Workspace 的 symlink。
- 不读取完整大文件后才截断。

## 实现步骤

1. 实现共享的受限目录遍历器。
2. 每个用户路径先经过 Workspace。
3. `read_file`：
   - 支持 startLine/lineCount；
   - 边读边限制字节；
   - 识别 NUL/二进制；
   - 正确处理末行无换行。
4. `list_directory`：
   - `lstat` 区分类型；
   - 稳定排序；
   - 限制条目数。
5. `find_files`：
   - 受限 glob；
   - maxDepth/maxResults；
   - 不依赖系统 find。
6. `search_text`：
   - caseSensitive；
   - 逐文件受限读取；
   - 返回行号、列号和文本；
   - 不依赖 grep/rg。
7. 通过统一工厂注册四个工具。
8. Agent 集成测试用 Scripted Model 请求 read_file。

## 步骤 adapter

创建 `test/step-adapters/step-11.adapter.ts`：

```ts
export function createReadonlyTools(root: string): Promise<{
  list(path: string): Promise<{ entries: string[] }>;
  read(
    path: string,
    options?: { maxBytes?: number },
  ): Promise<{
    content?: string;
    truncated?: boolean;
    binary?: boolean;
  }>;
  search(
    query: string,
  ): Promise<Array<{ path: string; line: number; text: string }>>;
  stat(path: string): Promise<{ kind: string; size: number }>;
}>;
```

adapter 的 `entries` 可以只投影文件名，真实工具应保留更丰富的结构化输出。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| read | 行范围、末行、UTF-8、截断 |
| list | 类型、稳定排序、数量限制 |
| find | glob、深度、结果上限 |
| search | 行列号、大小写、多文件 |
| binary | NUL 和明显二进制 |
| 安全 | traversal、绝对路径、symlink escape |
| 错误 | 不存在、wrong kind、无权限 |
| 取消 | 遍历和读取中 abort |
| 集成 | ToolRegistry 与 AgentLoop |

运行：

```powershell
npm run verify:step -- 11
```

## 退出清单

- [ ] 四个工具只能经 Workspace 访问。
- [ ] 不调用 shell。
- [ ] 输出稳定且有上限。
- [ ] 截断显式可见。
- [ ] 二进制策略明确。
- [ ] 取消、安全边界均测试。
- [ ] 本步测试通过。

## 常见错误

- 直接拼接 root 与输入。
- 调用系统 find/grep 导致注入和跨平台问题。
- 读取整个大文件后才截断。
- 跟随所有 symlink。
- 依赖文件系统枚举顺序。
- 用模糊错误字符串代替 `truncated`。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\read.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\ls.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\find.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\grep.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\read.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\glob.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\grep.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\spec_plan.rs`

## 学习记录问题

1. 为什么只读工具仍需要严格安全边界？
2. 截断信息如何帮助模型避免错误结论？
3. 为什么不直接调用本机 `rg`？
4. 搜索工具的可取消点应放在哪里？

