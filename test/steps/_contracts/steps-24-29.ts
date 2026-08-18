import { describe, expect, it } from "vitest";

import {
  invoke,
  loadStepAdapter,
  requireFunction,
  withTemporaryDirectory,
} from "../_support/step-test-kit.js";

type AsyncResult<T> = T | Promise<T>;

interface McpScenarioResult {
  status: string;
  negotiatedVersion?: string;
  capabilities?: string[];
  tools?: string[];
  callResult?: unknown;
  cancelled?: boolean;
  activeRequestsAfter?: number;
  secretExposed?: boolean;
}

export function registerStep24Contract(): void {
  describe("step 24 - MCP client", () => {
    it("negotiates capabilities, lists tools, and calls a remote tool", async () => {
      const adapter = await loadStepAdapter("24");
      const runMcpScenario = requireFunction<(scenario: string) => AsyncResult<McpScenarioResult>>(
        adapter,
        "runMcpScenario",
      );
      const result = await runMcpScenario("initialize-list-call");

      expect(result.status).toBe("completed");
      expect(result.negotiatedVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.capabilities).toContain("tools");
      expect(result.tools).toContain("remote_echo");
      expect(result.callResult).toEqual({ echoed: "hello" });
    });

    it("routes cancellation to the server and settles the request", async () => {
      const adapter = await loadStepAdapter("24");
      const runMcpScenario = requireFunction<(scenario: string) => AsyncResult<McpScenarioResult>>(
        adapter,
        "runMcpScenario",
      );
      const result = await runMcpScenario("cancel-call");

      expect(result.status).toBe("cancelled");
      expect(result.cancelled).toBe(true);
      expect(result.activeRequestsAfter).toBe(0);
    });

    it.each(["protocol-error", "server-disconnect"])(
      "normalizes %s without leaking credentials",
      async (scenario) => {
        const adapter = await loadStepAdapter("24");
        const runMcpScenario = requireFunction<
          (scenario: string) => AsyncResult<McpScenarioResult>
        >(adapter, "runMcpScenario");
        const result = await runMcpScenario(scenario);

        expect(result.status).toBe("failed");
        expect(result.secretExposed).toBe(false);
      },
    );
  });
}

interface PluginScenarioResult {
  status: string;
  activePlugins?: string[];
  shadowedPlugins?: string[];
  failedPlugins?: string[];
  registrations?: string[];
  projectPluginActivated?: boolean;
  disposedResources?: number;
}

export function registerStep25Contract(): void {
  describe("step 25 - plugin and extension system", () => {
    it("discovers and activates plugins in deterministic order", async () => {
      await withTemporaryDirectory("agent-plugins", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PluginScenarioResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "discover-and-activate");

        expect(result.status).toBe("active");
        expect(result.activePlugins).toEqual(["core.alpha", "user.beta"]);
        expect(result.registrations).toEqual(
          expect.arrayContaining(["tool:alpha", "provider:beta"]),
        );
      });
    });

    it("isolates an invalid plugin and reports duplicate IDs", async () => {
      await withTemporaryDirectory("agent-plugins", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PluginScenarioResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "invalid-and-duplicate");

        expect(result.status).toBe("partially_active");
        expect(result.failedPlugins).toContain("broken.plugin");
        expect(result.shadowedPlugins?.length).toBeGreaterThan(0);
        expect(result.activePlugins).toContain("healthy.plugin");
      });
    });

    it("requires project trust before loading executable project plugins", async () => {
      await withTemporaryDirectory("agent-plugins", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PluginScenarioResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "untrusted-project");

        expect(result.projectPluginActivated).toBe(false);
      });
    });

    it("disposes every registered resource when unloading", async () => {
      await withTemporaryDirectory("agent-plugins", async (workspaceRoot) => {
        const adapter = await loadStepAdapter("25");
        const runPluginScenario = requireFunction<
          (root: string, scenario: string) => AsyncResult<PluginScenarioResult>
        >(adapter, "runPluginScenario");
        const result = await runPluginScenario(workspaceRoot, "unload");

        expect(result.status).toBe("unloaded");
        expect(result.disposedResources).toBeGreaterThan(0);
        expect(result.activePlugins).toEqual([]);
      });
    });
  });
}

interface InteractionScenarioResult {
  status: string;
  consumedUserInputs?: string[];
  eventTypes?: string[];
  modelContextInputs?: string[];
  planRevision?: number;
  todos?: Array<{ id: string; status: string }>;
  pendingInputCount?: number;
}

export function registerStep26Contract(): void {
  describe("step 26 - input, steering, plan, and todo", () => {
    it("queues steering during a tool call and applies it before the next model turn", async () => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<InteractionScenarioResult>
      >(adapter, "runInteractionScenario");
      const result = await runInteractionScenario("steer-during-tool");

      expect(result.status).toBe("completed");
      expect(result.consumedUserInputs).toEqual(["initial", "steering"]);
      expect(result.modelContextInputs).toEqual(["initial", "steering"]);
      expect(result.eventTypes).toEqual(
        expect.arrayContaining(["input.queued", "input.consumed", "model.started"]),
      );
      expect(result.pendingInputCount).toBe(0);
    });

    it("persists monotonic plan revisions and structured todo transitions", async () => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<InteractionScenarioResult>
      >(adapter, "runInteractionScenario");
      const result = await runInteractionScenario("plan-and-todos");

      expect(result.status).toBe("completed");
      expect(result.planRevision).toBeGreaterThanOrEqual(2);
      expect(result.todos).toEqual([
        { id: "inspect", status: "completed" },
        { id: "implement", status: "in_progress" },
        { id: "verify", status: "pending" },
      ]);
    });

    it("rejects stale plan revisions without corrupting the current plan", async () => {
      const adapter = await loadStepAdapter("26");
      const runInteractionScenario = requireFunction<
        (scenario: string) => AsyncResult<InteractionScenarioResult>
      >(adapter, "runInteractionScenario");

      await expect(invoke(() => runInteractionScenario("stale-plan-update"))).rejects.toThrow();
    });
  });
}

interface MultiAgentScenarioResult {
  status: string;
  childCount?: number;
  maxDepthObserved?: number;
  messages?: Array<{ from: string; to: string; body: string }>;
  parentReceived?: unknown;
  childPermissionsWithinParent?: boolean;
  activeChildrenAfter?: number;
  cycleDetected?: boolean;
}

export function registerStep27Contract(): void {
  describe("step 27 - minimal multi-agent runtime", () => {
    it("spawns a bounded child and returns its structured result", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<MultiAgentScenarioResult>
      >(adapter, "runMultiAgentScenario");
      const result = await runMultiAgentScenario("spawn-and-join");

      expect(result.status).toBe("completed");
      expect(result.childCount).toBe(1);
      expect(result.parentReceived).toEqual({ finding: "done" });
      expect(result.childPermissionsWithinParent).toBe(true);
    });

    it("routes messages by stable agent IDs", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<MultiAgentScenarioResult>
      >(adapter, "runMultiAgentScenario");
      const result = await runMultiAgentScenario("message-routing");

      expect(result.messages).toEqual([
        { from: "parent", to: "child-1", body: "inspect" },
        { from: "child-1", to: "parent", body: "result" },
      ]);
    });

    it("enforces depth/count limits and detects ancestry cycles", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<MultiAgentScenarioResult>
      >(adapter, "runMultiAgentScenario");
      const limited = await runMultiAgentScenario("limits");
      const cycle = await runMultiAgentScenario("cycle");

      expect(limited.status).toBe("limit_reached");
      expect(limited.maxDepthObserved).toBeLessThanOrEqual(2);
      expect(cycle.cycleDetected).toBe(true);
    });

    it("cancels and joins every child when the parent is cancelled", async () => {
      const adapter = await loadStepAdapter("27");
      const runMultiAgentScenario = requireFunction<
        (scenario: string) => AsyncResult<MultiAgentScenarioResult>
      >(adapter, "runMultiAgentScenario");
      const result = await runMultiAgentScenario("parent-cancel");

      expect(result.status).toBe("cancelled");
      expect(result.activeChildrenAfter).toBe(0);
    });
  });
}

interface ServerScenarioResult {
  status: string;
  negotiatedVersion?: string;
  replayedSequence?: number[];
  duplicateSideEffects?: number;
  maxBufferedEvents?: number;
  authenticated?: boolean;
  activeRunsAfterDisconnect?: number;
}

export function registerStep28Contract(): void {
  describe("step 28 - headless server protocol", () => {
    it("negotiates a version and resumes an event stream from a cursor", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ServerScenarioResult>
      >(adapter, "runServerScenario");
      const result = await runServerScenario("connect-command-resume");

      expect(result.status).toBe("completed");
      expect(result.negotiatedVersion).toMatch(/^v\d+$/);
      expect(result.authenticated).toBe(true);
      expect(result.replayedSequence).toEqual([3, 4, 5]);
    });

    it("deduplicates retried commands by idempotency key", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ServerScenarioResult>
      >(adapter, "runServerScenario");
      const result = await runServerScenario("duplicate-command");

      expect(result.status).toBe("completed");
      expect(result.duplicateSideEffects).toBe(1);
    });

    it("enforces backpressure and cleans up after disconnect", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ServerScenarioResult>
      >(adapter, "runServerScenario");
      const backpressure = await runServerScenario("slow-client");
      const disconnect = await runServerScenario("disconnect");

      expect(backpressure.maxBufferedEvents).toBeLessThanOrEqual(64);
      expect(disconnect.activeRunsAfterDisconnect).toBe(0);
    });

    it("rejects unauthenticated and incompatible clients before commands run", async () => {
      const adapter = await loadStepAdapter("28");
      const runServerScenario = requireFunction<
        (scenario: string) => AsyncResult<ServerScenarioResult>
      >(adapter, "runServerScenario");

      for (const scenario of ["unauthenticated", "incompatible-version"]) {
        await expect(invoke(() => runServerScenario(scenario))).rejects.toThrow();
      }
    });
  });
}

interface ClientScenarioResult {
  status: string;
  transcripts: Record<string, string[]>;
  directProviderImports: Record<string, number>;
  localAgentLoops: Record<string, number>;
  commandsSent?: string[];
}

export function registerStep29Contract(): void {
  describe("step 29 - thin CLI, TUI, and IDE clients", () => {
    it("renders the same server event contract across all clients", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ClientScenarioResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("shared-transcript");
      const transcriptValues = Object.values(result.transcripts);

      expect(result.status).toBe("completed");
      expect(Object.keys(result.transcripts).sort()).toEqual(["cli", "ide", "tui"]);
      expect(transcriptValues[1]).toEqual(transcriptValues[0]);
      expect(transcriptValues[2]).toEqual(transcriptValues[0]);
    });

    it("keeps provider and agent-loop logic out of clients", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ClientScenarioResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("architecture-boundary");

      expect(Object.values(result.directProviderImports)).toEqual([0, 0, 0]);
      expect(Object.values(result.localAgentLoops)).toEqual([0, 0, 0]);
    });

    it("maps user actions to versioned protocol commands", async () => {
      const adapter = await loadStepAdapter("29");
      const runClientScenario = requireFunction<
        (scenario: string) => AsyncResult<ClientScenarioResult>
      >(adapter, "runClientScenario");
      const result = await runClientScenario("user-actions");

      expect(result.commandsSent).toEqual([
        "session.open",
        "turn.start",
        "turn.steer",
        "turn.cancel",
      ]);
    });
  });
}
