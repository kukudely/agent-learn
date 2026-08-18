# 步骤 17：设计 append-only 会话协议

## 本步目标

把 Session 状态从纯内存扩展为版本化、可恢复的 append-only 事件协议。先实现 Memory Repository，再实现 JSONL Repository，并让两者通过同一套 conformance tests。

## 前置条件

- AgentSession 的状态和事件语义稳定。
- 已明确哪些事实需要持久化。
- 已有统一秘密脱敏入口。

## 推荐协议

JSONL 第一行是 header，后续每行一个 event：

```ts
export interface SessionHeader {
  readonly kind: "session";
  readonly schemaVersion: number;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly workspaceId: string;
}

export interface PersistedSessionEvent<T = unknown> {
  readonly kind: "event";
  readonly schemaVersion: number;
  readonly id: string;
  readonly sequence: number;
  readonly parentId: string | null;
  readonly timestamp: string;
  readonly type: string;
  readonly payload: T;
}

export interface SessionRepository {
  create(header: SessionHeader): Promise<void>;
  append(
    sessionId: string,
    event: PersistedSessionEvent,
    options: {
      expectedSequence: number;
      durability: "buffered" | "flush" | "fsync";
    },
  ): Promise<void>;
  load(sessionId: string): Promise<SessionLoadResult>;
  list(): Promise<readonly SessionHeader[]>;
  close(): Promise<void>;
}
```

## 协议规则

- sequence 从 1 开始严格递增。
- id 唯一。
- parent 必须存在，根事件除外。
- `expectedSequence` 阻止并发写者丢事件。
- 每个事件恰好一行 UTF-8 JSON。
- 未知新事件保留为 opaque。
- 只有“文件末尾无换行且 JSON 不完整”可诊断为 truncated tail。
- 中间或完整行坏 JSON 必须报 corruption。
- 不持久化 API key、Authorization、Cookie、隐藏推理全文或原始 Provider 对象。

## 实现步骤

1. 先写 codec 和 schema validator。
2. 实现 Memory Repository。
3. 抽取 repository conformance suite。
4. 定义 JSONL 文件命名和 header。
5. 为每个 Session 建立单写者队列/锁。
6. append 前校验 expected sequence、ID 和 parent。
7. 事件序列化为单行后一次 append。
8. 明确 buffered、flush、fsync 的语义。
9. load 按行号解析并生成精确诊断。
10. truncated tail 保留 warning，不伪造事件。
11. 完整坏行抛 `SessionCorruptError`。
12. 未知 type 作为 opaque 事件保留。
13. 建立逐版本 migration registry。
14. 所有 payload 写入前经过 redaction gate。
15. close 和错误路径释放文件句柄。

## 步骤 adapter

创建 `test/step-adapters/step-17.adapter.ts`：

```ts
export function runSessionProtocolScenario(
  root: string,
  backend: "memory" | "jsonl",
  scenario: string,
): Promise<{
  status: string;
  backend: string;
  sequences?: number[];
  eventCount?: number;
  tail?: string;
  warnings?: string[];
  conflict?: boolean;
  secretExposed?: boolean;
  unknownTypePreserved?: boolean;
}>;
```

支持：

- `append-load-reopen`
- `expected-sequence-conflict`
- `truncated-tail`
- `corrupt-complete-line`
- `redaction-and-unknown-event`

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| conformance | Memory 和 JSONL 共用 create/append/load/list |
| reopen | 关闭重开仍得到 1、2、3 |
| 冲突 | expected sequence 陈旧 |
| 图 | 重复 ID、悬空 parent |
| 尾部 | 半行诊断恢复 |
| 损坏 | 完整坏 JSON 不能忽略 |
| 演进 | 未知 event 保留、future version 拒绝 |
| 安全 | 磁盘内容扫描不到秘密 |
| 故障 | 磁盘写失败、句柄清理 |

运行：

```powershell
npm run verify:step -- 17
```

## 退出清单

- [ ] Memory/JSONL 通过同一 conformance。
- [ ] expected sequence 防止丢写。
- [ ] truncated tail 与 corrupt line 分开。
- [ ] 未知事件被保留。
- [ ] 持久性级别有清晰定义。
- [ ] 秘密不进入 Session 文件。
- [ ] 本步测试通过。

## 常见错误

- 每次覆盖 `messages.json`。
- pretty-print 一个事件为多行。
- 任何尾部错误都静默忽略。
- 未知事件让旧客户端崩溃。
- append 成功但没有持久性语义。
- 日志脱敏了，Session 却保存原始秘密。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\coding-agent\src\core\session-manager.ts`
- Pi：`C:\code\projects\pi\packages\coding-agent\docs\session-format.md`
- OpenCode：`C:\code\projects\opencode\packages\core\src\database\database.ts`
- OpenCode：`C:\code\projects\opencode\packages\core\src\session\sql.ts`
- Codex：`C:\code\projects\codex\codex-rs\rollout\src\recorder.rs`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`

## 学习记录问题

1. append-only 如何防止两个写者同时覆盖 sequence？
2. 何时需要 flush，何时需要 fsync？
3. 为什么半行和完整坏行必须区别处理？
4. unknown event 如何既保留又不破坏 state reducer？

