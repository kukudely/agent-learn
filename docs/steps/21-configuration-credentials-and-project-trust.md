# 步骤 21：实现配置、凭据和项目信任

## 本步目标

实现可解释的多层配置、不可序列化的凭据引用和独立的项目信任状态。每个最终配置值都能回答“来自哪里、覆盖了什么、为什么生效”。

## 前置条件

- Session 可记录脱敏配置快照 hash。
- Policy 与 Workspace 已明确。
- Plugin/Skill 尚未实现，先为其建立 trust gate。

## 推荐优先级

```text
default
  < user global
  < project
  < explicit file
  < env
  < CLI
  < managed policy
```

managed policy 不是普通高优先级值：低层不能放宽其禁止项。

## 推荐契约

```ts
export interface ConfigLayer {
  readonly kind:
    | "default"
    | "user"
    | "project"
    | "explicit"
    | "env"
    | "cli"
    | "managed";
  readonly source: string;
  readonly baseDir: string;
  readonly priority: number;
  readonly data: unknown;
  readonly trusted: boolean;
}

export interface ValueProvenance {
  readonly path: string;
  readonly selectedSource: string;
  readonly history: readonly {
    source: string;
    operation: "set" | "merge" | "append" | "clear";
    valuePreview: string;
  }[];
}

export interface CredentialProvider {
  resolve(ref: CredentialRef, signal: AbortSignal): Promise<SecretValue>;
}
```

`SecretValue` 的 `toJSON` 必须拒绝或固定输出 `[REDACTED]`，显示函数永远不返回原值。

## 合并语义

- 对象递归 merge。
- 数组默认 replace。
- 只有 schema 明确允许的 `{$append: [...]}` 才追加。
- 只有显式 `{$clear: true}` 才清空。
- `null` 不暗含 clear。
- 相对路径按来源配置文件的目录解析，不按当前 cwd。
- 每步合并都记录 provenance。

## 项目信任

- project config 可作为数据解析，但未 trust 时不激活可执行代码。
- 未信任项目不得自动加载插件、脚本、依赖或项目 Skill。
- 项目不能在自己的配置中声明 `trusted: true` 自授权。
- Trust 不等于 Tool Permission，也不等于 Sandbox。
- 第一版运行中的 Session 固定 config snapshot；更新只影响新 Session。

## 实现步骤

1. 定义 schema 和 defaults。
2. 逐 source 解析，并保留 baseDir。
3. 纯函数实现 merge + provenance。
4. 实现 env/CLI 到 typed config 的显式映射。
5. 应用 managed constraints。
6. 实现 `config explain <path>`。
7. 生成脱敏配置 hash，写入 Session header/event。
8. 把 CredentialProvider 与普通 config 分离。
9. SecretValue 防序列化、日志 scrub、错误 scrub。
10. 实现 ProjectTrustStore。
11. 所有 executable project feature 统一检查 trust。
12. 声明 reload 仅影响新 Session。

## 步骤 adapter

创建 `test/step-adapters/step-21.adapter.ts`：

```ts
export function runConfigScenario(scenario: string): Promise<{
  status: string;
  value?: unknown;
  selectedSource?: string;
  sourceHistory?: string[];
  secretSerialized?: boolean;
  projectCodeActivated?: boolean;
  runningSessionChanged?: boolean;
  trust?: string;
}>;
```

支持：

- `precedence`
- `secret-redaction`
- `untrusted-project`
- `reload-during-session`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 合并 | object、array replace、append、clear |
| 优先级 | 七层选择和历史 |
| 路径 | Windows/POSIX、按 source baseDir |
| 解释 | selected source 和脱敏 preview |
| 凭据 | JSON、日志、错误和 Session 扫描 |
| trust | 未信任项目不激活代码 |
| managed | 低层不能放宽约束 |
| snapshot | 运行中配置不变化 |
| 失败 | malformed、未知字段、类型错误 |

运行：

```powershell
npm run verify:step -- 21
```

## 退出清单

- [ ] 每个值有 provenance。
- [ ] 数组默认 replace。
- [ ] 路径相对来源文件解析。
- [ ] 凭据与普通配置分离。
- [ ] Secret 不可意外序列化。
- [ ] 项目不能自我信任。
- [ ] 运行 Session 使用不可变 snapshot。
- [ ] 本步测试通过。

## 常见错误

- 用 `Object.assign` 丢失来源。
- 数组隐式 concat。
- 相对路径按 cwd 解析。
- API key 作为普通字符串放在 config。
- 项目配置自称 trusted。
- 把 trust 当成允许 shell。
- 运行中悄然换配置，导致不可重放。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\settings-manager.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\project-trust.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\config\config.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\config\paths.ts`
- Codex：`C:\code\projects\codex\codex-rs\core\src\config\mod.rs`
- Codex：`C:\code\projects\codex\codex-rs\config\src`

## 学习记录问题

1. Value provenance 应保存多少历史？
2. 为什么数组默认 replace 更可预测？
3. managed policy 如何限制低层配置？
4. SecretValue 如何防止无意 `JSON.stringify`？

