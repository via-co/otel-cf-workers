---
'@microlabs/otel-cf-workers': patch
---

Do not throw error if config is not present. It now degrades to a non-recording span instead of throwing.
