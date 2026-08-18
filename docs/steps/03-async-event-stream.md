# 步骤 03：实现异步事件流原语

## 本步目标

实现一个可生产、消费、关闭、失败和取消的 `AsyncIterable` 事件流。它将成为模型流、Agent 事件、服务器协议和重放能力的共同基础。

## 前置条件

- 步骤 02 的事件数据必须是结构化值。
- 理解 Promise、AsyncIterator 和 AbortSignal。

## 状态机

建议只允许以下状态：

```text
open -> closed
open -> failed
open -> cancelled
```

三个终态互斥，第一次终止操作获胜。`close` 是正常完成，`fail` 保留错误，`cancel` 表示外部不再需要结果。

## 推荐契约

```ts
export interface EventStream<T> extends AsyncIterable<T> {
  readonly done: Promise<void>;
  cancel(reason?: unknown): void;
}

export interface EventSink<T> {
  emit(value: T): Promise<void>;
  close(): void;
  fail(error: unknown): void;
}

export function createEventStream<T>(options?: {
  signal?: AbortSignal;
  highWaterMark?: number;
}): {
  stream: EventStream<T>;
  sink: EventSink<T>;
};
```

`emit` 返回 Promise，便于实现背压。终态后继续 emit 必须拒绝，不能静默忽略。

## 实现步骤

1. 先画出 buffer、等待消费者、等待生产者和 terminal state。
2. 实现“先生产后消费”和“先消费后生产”两条路径。
3. 把 close/fail/cancel 收敛到唯一的终止函数。
4. 给等待中的所有 Promise 明确 resolve 或 reject。
5. 连接外部 `AbortSignal`，结束后解绑监听器。
6. 实现高水位：
   - 推荐生产者等待容量；
   - 或抛出明确的 buffer 错误；
   - 不能静默丢事件。
7. 消费者提前 `return()` 时触发清理。
8. 增加单调 `seq` 和可注入时钟。
9. 写竞态测试：emit 与 cancel 同时发生、fail 与 close 同时发生。
10. 确认不存在永远不 settle 的 Promise。

## 步骤 adapter

创建 `test/step-adapters/step-03.adapter.ts`：

```ts
export function createEventStream(): {
  events: AsyncIterable<unknown>;
  push(event: unknown): void | Promise<void>;
  end(result: unknown): void | Promise<void>;
  fail(error: Error): void | Promise<void>;
  result(): Promise<unknown>;
};
```

adapter 可以包装你的 sink/stream API，但 `events` 和 `result()` 必须来自同一运行实例。

## 测试矩阵

| 类别 | 场景 |
| --- | --- |
| 顺序 | push 1、push 2，消费顺序不变 |
| 完成 | end 后 iterator 正常结束，result resolve |
| 失败 | fail 后 result reject |
| 终态 | late push 和 repeated end 均拒绝 |
| 取消 | 等待中的消费者被唤醒并观察取消 |
| 背压 | 缓冲区满时不丢数据 |
| 清理 | signal listener、timer 和 waiter 均释放 |

运行：

```powershell
npm run verify:step -- 03
```

## 退出清单

- [ ] 事件严格按生产顺序到达。
- [ ] 只有一个终态。
- [ ] 正常、失败、取消语义不同。
- [ ] 高水位行为写入文档并测试。
- [ ] 无悬挂 Promise 和监听器。
- [ ] adapter 测试通过。

## 常见错误

- 把异常转换为 `{ done: true }`。
- 终态后仍接收事件。
- 使用无限数组作为缓冲。
- 只测试先生产后消费。
- fail 只影响 result，不影响 iterator。
- AbortSignal 已触发时仍开始操作。

## 本地源码锚点

- Pi：`C:\code\projects\pi\packages\ai\src\utils\event-stream.ts`
- OpenCode：`C:\code\projects\opencode\packages\opencode\src\session\prompt.ts`
- Codex：`C:\code\projects\codex\codex-rs\protocol\src\protocol.rs`

## 学习记录问题

1. 为什么完成、失败和取消必须是不同终态？
2. 背压由事件流还是调用方负责更合适？
3. 消费者提前退出时生产者应该观察到什么？
4. 哪些竞态会造成 Promise 永久挂起？

