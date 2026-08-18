# 步骤 12：实现受控写入和补丁工具

## 本步目标

在 Workspace 内加入可审计、可冲突检测、尽量原子化的写入能力。第一版应优先支持“新建文件”和“基于旧内容的精确替换”，不要直接实现任意覆盖、递归删除或复杂 Git 补丁。

## 前置条件

- Workspace 能可靠阻止路径逃逸。
- ToolRegistry 能先校验参数再执行。
- 只读工具能提供内容和哈希。

## 核心概念

- **FileSnapshot**：读取时得到的内容哈希，用来检测读取后文件被别人修改。
- **Compare-and-swap**：只有当前哈希等于 expected hash 才写入。
- **Patch precondition**：被替换的旧文本必须精确出现规定次数。
- **Atomic replacement**：同目录写临时文件，flush 后 rename 替换。
- **Outcome unknown**：写入调用失败时不能总是假设文件未改变，必须复查。

## 推荐模块和契约

```text
src/workspace/file-snapshot.ts
src/tools/write-file.ts
src/tools/apply-patch.ts
src/tools/atomic-write.ts
src/tools/patch-types.ts
```

```ts
export interface FileSnapshot {
  readonly path: string;
  readonly content: string;
  readonly contentHash: string;
  readonly size: number;
}

export interface WritePrecondition {
  readonly expectedHash?: string;
  readonly mustNotExist?: boolean;
}

export interface FileMutationResult {
  readonly path: string;
  readonly beforeHash?: string;
  readonly afterHash: string;
  readonly changed: boolean;
  readonly atomic: boolean;
}

export type PatchOperation =
  | {
      readonly type: "replace";
      readonly oldText: string;
      readonly newText: string;
      readonly expectedOccurrences: number;
    }
  | { readonly type: "append"; readonly text: string };
```

所有 path 必须先经 Workspace。写入工具不能自己重新做一套路径校验。

## 实现步骤

1. 用固定算法计算内容哈希，例如 SHA-256。
2. 实现 `readSnapshot`，返回内容、size 和 hash。
3. 新建文件默认 `mustNotExist = true`，避免意外覆盖。
4. 更新文件必须支持 `expectedHash`。
5. apply patch 前：
   - 读取当前快照；
   - 检查 hash；
   - 检查旧文本出现次数；
   - 在内存产生候选新内容。
6. 候选内容不变时返回 `changed: false`，不写磁盘。
7. 临时文件必须位于目标同目录，名称不可由模型完全控制。
8. 写临时文件后按你的持久性策略 flush。
9. rename 替换后重新读取并计算 after hash。
10. 任何失败都清理临时文件。
11. 写入前后记录结构化事件，但不记录敏感全文。
12. 明确 Windows rename/占用失败的错误语义。
13. symlink 目标在写操作打开前再检查一次。

## 步骤 adapter

创建 `test/step-adapters/step-12.adapter.ts`：

```ts
export function runPatchScenario(
  root: string,
  scenario: string,
): Promise<{
  status: string;
  content?: string;
  beforeHash?: string;
  afterHash?: string;
  changed?: boolean;
  atomic?: boolean;
}>;
```

必须支持：

- `create`
- `compare-and-swap-update`
- `stale-precondition`
- `path-traversal`
- `symlink-escape`

`create` 后的状态必须保留到同一个临时目录中的后续 update 场景。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 新建 | 文件不存在时成功且有 after hash |
| 更新 | expected hash 正确时更新 |
| 冲突 | hash 陈旧时内容不变 |
| patch | 0 次、1 次、多次匹配 |
| 原子性 | 写失败不留下半个目标文件 |
| 安全 | traversal、绝对路径、symlink escape |
| 清理 | 临时文件、文件句柄均释放 |
| 竞态 | 读取后外部修改，CAS 拒绝 |
| 编码 | UTF-8、末行换行策略 |

运行：

```powershell
npm run verify:step -- 12
```

## 退出清单

- [ ] 新建默认不覆盖。
- [ ] 更新支持 expected hash。
- [ ] stale precondition 不改变文件。
- [ ] patch 匹配次数明确。
- [ ] 尽量使用同目录原子替换。
- [ ] 越界和 symlink escape 被拒绝。
- [ ] 临时资源始终清理。
- [ ] 本步测试通过。

## 常见错误

- 直接调用 `writeFile(target)` 覆盖。
- 用 mtime 代替内容哈希。
- old text 多次出现时全部替换。
- 写失败后假设没有副作用。
- 临时文件放在系统临时目录，rename 跨文件系统。
- 检查一次路径后允许 symlink 被替换。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\write.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\tools\edit.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\write.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\tool\edit.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\tools\handlers\apply_patch.rs`

## 学习记录问题

1. 为什么 expected hash 比 mtime 更可靠？
2. rename 原子性在哪些平台和文件系统上有限制？
3. 写入失败后如何区分 failed 与 outcome unknown？
4. patch 为什么要限制旧文本出现次数？

