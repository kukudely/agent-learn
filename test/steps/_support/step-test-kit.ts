import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect } from "vitest";

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export type StepAdapter = Readonly<Record<string, unknown>>;

export async function loadStepAdapter(stepId: string): Promise<StepAdapter> {
  const adapterPath = resolve(PROJECT_ROOT, "test", "step-adapters", `step-${stepId}.adapter.ts`);

  expect(
    existsSync(adapterPath),
    `步骤 ${stepId} 尚未接入验收测试。\n` +
      `请按照 docs/steps 中对应文档创建：\n` +
      `  test/step-adapters/step-${stepId}.adapter.ts\n` +
      "适配器只负责把你的实现映射为测试要求的公开契约。",
  ).toBe(true);

  return import(`${pathToFileURL(adapterPath).href}?step=${stepId}`);
}

export function requireFunction<TFunction extends (...args: never[]) => unknown>(
  adapter: StepAdapter,
  name: string,
): TFunction {
  const candidate = adapter[name];
  expect(typeof candidate, `适配器必须导出函数 ${name}，当前得到 ${typeof candidate}`).toBe(
    "function",
  );
  return candidate as TFunction;
}

export function requireObject<TObject extends object>(adapter: StepAdapter, name: string): TObject {
  const candidate = adapter[name];
  expect(candidate !== null && typeof candidate === "object", `适配器必须导出对象 ${name}`).toBe(
    true,
  );
  return candidate as TObject;
}

export function projectPath(...segments: string[]): string {
  const target = resolve(PROJECT_ROOT, ...segments);
  const targetRelativePath = relative(PROJECT_ROOT, target);
  if (targetRelativePath.startsWith("..") || targetRelativePath.includes(":")) {
    throw new Error(`测试路径逃逸项目目录：${target}`);
  }
  return target;
}

export async function readProjectText(...segments: string[]): Promise<string> {
  return readFile(projectPath(...segments), "utf8");
}

export async function withTemporaryDirectory<T>(
  prefix: string,
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), `${prefix}-`));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, "utf8");
}

export async function collectAsync<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) {
    values.push(value);
  }
  return values;
}

export async function invoke<T>(value: T | Promise<T> | (() => T | Promise<T>)): Promise<T> {
  return typeof value === "function" ? (value as () => T | Promise<T>)() : value;
}

export function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, rejectDelay) => {
    if (signal?.aborted) {
      rejectDelay(signal.reason ?? new Error("aborted"));
      return;
    }

    const timeout = setTimeout(resolveDelay, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        rejectDelay(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}
