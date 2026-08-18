---
'@microlabs/otel-cf-workers': patch
---

Do not throw from `BatchTraceSpanProcessor.export` when no instrumentation config is active. It now drops the batch instead, matching the behaviour `WorkerTracer.startSpan` already had — `onEnd` is typically reached inside a `waitUntil` continuation, where throwing rejects the pending promise and can break a Durable Object's input gate.
