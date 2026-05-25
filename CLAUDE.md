# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@microlabs/otel-cf-workers` — OpenTelemetry-compatible auto-instrumentation library for Cloudflare Workers. Distributed as ESM-only (no CommonJS). Requires the `nodejs_compat` compatibility flag in consumer wrangler configs (uses `node:async_hooks` for the context manager).

Package manager is `pnpm@9.10.0` (see `packageManager` in `package.json`). The repo contains both a `pnpm-lock.yaml` and `package-lock.json`; pnpm is authoritative.

## Commands

- `pnpm build` — runs `build:versions` (writes `versions.json` consumed at runtime by `src/sdk.ts` for telemetry SDK resource attrs) then `tsup` (ESM bundle + dts to `dist/`).
- `pnpm test` — Vitest using `@cloudflare/vitest-pool-workers`. Tests run inside a workerd pool configured from `examples/worker/wrangler.toml`. The pool wrangler config matters: if you add new bindings or DO classes the tests rely on, update that file.
- `pnpm test:dev` — Vitest watch mode.
- Single test: `pnpm exec vitest run test/instrumentation/do-storage.test.ts` (or `-t "<name>"` to filter).
- `pnpm check` — runs `check:format` (prettier) and `check:types` (`tsc --noEmit`).
- `pnpm ci` — `clean && build && check && test`. Use this before opening a PR.
- `pnpm release` — `clean → cs-version → build → check → cs-publish`. Releases are driven by changesets.

Every PR that changes runtime behavior must include a changeset: `pnpm exec changeset` (writes a file under `.changeset/`). `baseBranch` is `main`.

## Architecture

The library is a **proxy-based auto-instrumentation layer**. It never modifies user code; instead it wraps handlers, the environment, and global APIs with `Proxy` objects that emit OpenTelemetry spans on access.

### Entry points (`src/index.ts`)

All public wrappers funnel through `createInitialiser(config)`, which builds an `Initialiser` — a function `(env, trigger) => ResolvedTraceConfig` invoked at the start of every request. The initialiser also lazily registers the global `WorkerTracerProvider`, propagator, and (optionally) instruments global `fetch` and `caches` on first use.

- `instrument(handler, config)` — wraps an `ExportedHandler` (fetch/scheduled/queue/email).
- `instrumentDO(class, config)` — wraps a Durable Object class (the legacy non-RPC pattern).
- `instrumentEntrypoint(config)` / `InstrumentedEntrypoint` — method decorator + base class for `WorkerEntrypoint` (RPC).
- `instrumentDOClassMetadata(config)` / `InstrumentedDurableObject` — method decorator + base class for RPC-style Durable Objects. Uses the `_setOpts(metadata)` channel and a private `_logger` so RPC callers can propagate W3C trace context as RPC arguments instead of HTTP headers.
- `instrumentPage` — SvelteKit-style page handler wrapper.

### The proxy/wrap utility (`src/wrap.ts`)

`wrap(item, handler)` creates a `Proxy` and tags it with a unique `unwrapSymbol`. `unwrap` returns the original. `isWrapped` short-circuits so handlers can be wrapped only once. **Always `unwrap` user-supplied handlers before re-wrapping** (see `instrument` in `src/index.ts`) — otherwise you stack proxies and break `this` binding. `passthroughGet` is the standard "I don't care about this property, just bind it correctly" fallback and includes a special branch for Cloudflare's `RpcProperty` functions.

### Environment instrumentation (`src/instrumentation/env.ts`)

`instrumentEnv` returns a Proxy around the user's `env` object. On property access, it sniffs the value with duck-typed guards (`isKVNamespace`, `isQueue`, `isJSRPC`, `isD1Database`, `isAnalyticsEngineDataset`, `isVectorize`, `isVersionMetadata`) and returns the matching instrumented wrapper. Adding support for a new binding type means: write a `instrumentX(item, name)` in `src/instrumentation/x.ts`, add a guard + dispatch branch here. Order matters — JSRPC and KV both have catch-all-ish surfaces, so the JSRPC check runs first.

### Context propagation

Uses a custom `AsyncLocalStorageContextManager` (vendored from upstream OTel, `src/context.ts`) backed by `node:async_hooks` — this is why `nodejs_compat` is required. The active `ResolvedTraceConfig` is stored under a `Symbol` in the OTel `Context` (`setConfig`/`getActiveConfig` in `src/config.ts`); every handler entry point calls `api_context.with(setConfig(config), …)` so downstream instrumentation can read sampling/post-processor config without prop-drilling.

### Span lifecycle and export (`src/spanprocessor.ts`)

`BatchTraceSpanProcessor` is a **trace-scoped** state machine (not the upstream OTel batch processor — that one doesn't work on Workers because there's no background loop). It groups spans by `localRootSpanId`, transitions `not_started → in_progress → trace_complete → exporting → done`, and only invokes the tail sampler + post-processor + exporter when every span in the local trace has ended. The FSM is implemented via the vendored `ts-checked-fsm` library.

Each handler's `finally` calls `exportSpans(tracker)` inside `ctx.waitUntil(...)` (see `createFetchHandler`). `PromiseTracker` (`src/instrumentation/common.ts`) wraps `ctx.waitUntil` so the export waits for all in-flight `waitUntil` promises — including nested ones added during export — before flushing. This is the only way spans created inside `waitUntil` callbacks get sent.

### Sampling

Two-stage: head sampling (a standard OTel `Sampler`, defaults to `AlwaysOnSampler`) decides the `TraceFlags.SAMPLED` bit; tail sampling (`TailSampleFn`) decides whether to actually export. The default tail sampler exports if head-sampled **or** the local root span errored. Head-sampler config also accepts `{ ratio, acceptRemote }` shorthand, converted via `createSampler` to a `ParentBasedSampler`.

### Durable Objects

Two parallel paths exist:

1. **Legacy** (`instrumentDO` → `src/instrumentation/do.ts`): proxies the DO class constructor, then wraps the resulting object's `fetch`/`alarm` methods. Each invocation builds a fresh config via the initialiser.
2. **RPC** (`InstrumentedDurableObject` + `instrumentDOClassMetadata` in `src/instrumentation/do-class.ts`): method decorator approach for newer RPC-style DOs. Trace context propagates as a `metadata` field set via the `_setOpts` RPC call before the real RPC. `InstrumentedDurableObject.getInstance(ns, key)` is the helper that injects the W3C context and calls `_setOpts` for you.

Both paths instrument `state.storage` via `instrumentStorage` in `src/instrumentation/do-storage.ts`.

### Cold start tracking

Each handler module keeps a module-level `let cold_start = true` and flips it false after the first invocation. This is per-isolate, which matches Workers' execution model.

## Conventions

- All internal imports use `.js` extensions (TypeScript ESM-compat for the emitted bundle). Don't drop them.
- Don't import from `cloudflare:workers` outside of files that genuinely need `WorkerEntrypoint`/`DurableObject` base classes — it's marked `external` in `tsup.config.ts` and pulling it in widely makes the bundle harder to consume.
- Prettier config: tabs, single quotes, no semicolons, width 120 (`.prettierrc`). Runs via husky pre-commit on staged files.
- When adding a new binding instrumentation, place it in `src/instrumentation/<name>.ts`, register the guard+dispatch in `env.ts`, and update the binding support checklist in `README.md`.
