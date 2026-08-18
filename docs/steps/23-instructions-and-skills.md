# 步骤 23：实现 Instructions 和 Skills

## 本步目标

发现并组合 managed、user、project instructions；实现 Skill 的惰性发现与按需加载；保留来源、优先级、信任状态和内容 hash。Skill 只是低权限指令，不会提升工具权限。

## 前置条件

- Context Builder 能接收带 trust 的 instruction groups。
- ProjectTrustStore 可用。
- Workspace 能限制路径和 symlink。

## Instructions 规则

推荐顺序：

```text
managed
-> user
-> workspace root 到当前 cwd 的逐级 project instructions
```

这是带来源边界的拼接，不是简单字符串覆盖。文件指令始终低于运行时 system/security 和当前用户明确要求。

## Skill 契约

```ts
export interface SkillMetadata {
  readonly name: string;
  readonly description: string;
  readonly version?: string;
  readonly entrypoint: "SKILL.md";
}

export interface DiscoveredSkill {
  readonly metadata: SkillMetadata;
  readonly root: string;
  readonly source: string;
  readonly priority: number;
  readonly status: "available" | "shadowed" | "invalid";
  readonly warnings: readonly string[];
}

export interface LoadedSkill {
  readonly metadata: SkillMetadata;
  readonly content: string;
  readonly contentHash: string;
  readonly references: readonly string[];
  readonly source: string;
}
```

## 惰性与重复名规则

- discovery 只读取大小受限的 frontmatter，不读正文。
- 显式触发或选择后才 load 全文。
- 不同优先级同名：高者 winner，低者显示 shadowed。
- 同优先级同名：两者 invalid，不能靠扫描顺序决定。
- 坏 Skill 只产生 warning，不阻断其他 Skill。
- 加载时把 source/version/hash 写入 Session。

## 路径和 archive 安全

- reference 必须相对 Skill root。
- resolve 后再 realpath，不能逃逸 root。
- archive 拒绝 absolute、`..`、drive path。
- 拒绝 symlink/hardlink。
- 限制文件数、单文件大小、总解压大小和压缩比。
- 未信任项目 Skill 不加载。
- Skill 文字要求“绕过审批”时仍经过 Policy。

## 实现步骤

1. 定义 instruction authority 和优先级。
2. 从 workspace root 到 cwd 搜索 AGENTS/instruction 文件。
3. 不越过 Workspace root。
4. 为每份文档保留 source、scope、trust、hash。
5. 实现 frontmatter 小窗口解析。
6. 构建 SkillCatalog 和碰撞规则。
7. discovery spy 证明不读 body。
8. trust gate 后按需加载全文。
9. reference 通过 Workspace/Skill root 检查。
10. 实现安全 archive extractor。
11. 作为低权限 group 注入 Context Builder。
12. Tool Pipeline 保持不变。
13. 提供 list/load CLI 或 API。

## 步骤 adapter

创建 `test/step-adapters/step-23.adapter.ts`：

```ts
export function runSkillScenario(
  root: string,
  scenario: string,
): Promise<{
  status: string;
  winner?: string;
  shadowed?: string[];
  bodyReadsDuringDiscovery?: number;
  loadedHash?: string;
  sourceRecorded?: boolean;
  projectSkillLoaded?: boolean;
  toolPermissionEscalated?: boolean;
}>;
```

支持：

- `lazy-discovery-and-shadowing`
- `explicit-load`
- `reference-escape`
- `archive-escape`
- `untrusted-project-skill`
- `malicious-permission-instruction`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| instruction | managed/user/project 顺序和来源 |
| discovery | frontmatter、大小、坏 UTF-8 |
| lazy | discovery body read count 为 0 |
| 冲突 | winner、shadowed、同优先级 invalid |
| load | source、version、hash 写 Session |
| reference | 缺失、traversal、symlink escape |
| archive | zip slip、symlink、zip bomb |
| trust | 未信任项目不加载 |
| permission | 恶意 Skill 不能绕 Policy |

运行：

```powershell
npm run verify:step -- 23
```

## 退出清单

- [ ] instructions 保留来源边界。
- [ ] discovery 不读 Skill 正文。
- [ ] 重名规则确定。
- [ ] load 记录 source/version/hash。
- [ ] reference 和 archive 不能逃逸。
- [ ] trust gate 生效。
- [ ] Skill 不提升 Tool Permission。
- [ ] 本步测试通过。

## 常见错误

- 启动时读取全部 Skill 正文。
- 用目录扫描顺序解决重名。
- 把 Skill 注入最高权限 system。
- reference 只做字符串检查。
- archive 只查 `..`，不查 symlink/大小。
- 一个坏 Skill 让进程启动失败。
- Skill 描述直接授权工具。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\skills.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\docs\skills.md`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\skill\index.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\skill\discovery.ts`
- Codex：`C:\code\projects\codex\codex-rs\core-skills\src\loader.rs`
- Codex：`C:\code\projects\codex\codex-rs\core-skills\src\injection.rs`

## 学习记录问题

1. Instruction 拼接与覆盖有什么区别？
2. 如何证明 discovery 真正惰性？
3. 为什么重名不能靠扫描顺序？
4. Skill 为什么不能提升工具权限？

