---
'@microlabs/otel-cf-workers': patch
---

Add a proxy for `storage.sql.exec(...)` so that it emits traces with duration for the statement itself
