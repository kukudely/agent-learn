# Step verification adapters

The step acceptance suites intentionally test observable behavior without forcing a specific internal
architecture.

After implementing a learning step, create the adapter named by its document:

```text
test/step-adapters/step-XX.adapter.ts
```

The adapter should import your real implementation and expose the small contract required by
`test/steps/step-XX.test.ts`. It must not reimplement the feature inside the adapter.
See `docs/steps/ADAPTER_SCENARIOS.md` for the exact extended scenario IDs and result fields.

Run a cumulative verification:

```powershell
npm run verify:step -- 08
```

Run only one step while debugging:

```powershell
npm run verify:step -- 08 --only
```

The cumulative command also runs type checking, Biome, and the normal test suite before the step
contracts.
