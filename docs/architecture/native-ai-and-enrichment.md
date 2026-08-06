# Native AI and enrichment

Lumen keeps provider access, local process ownership, and durable enrichment below the React boundary. The webview calls typed services and Zod-parses every native response; it never receives provider credentials, Gateway bearer tokens, generic process arguments, or raw enrichment input bytes.

## Supervised processes

Rust owns four fixed capabilities:

- checksum-pinned AgentGateway 1.4.1, started with separate interactive and enrichment configurations;
- LemonadeServer 11.5.1 when a compatible local runtime is installed;
- the compiled enrichment worker plus its pinned Rivet 2.3.10 engine for optional coordination;
- the separately consented Computer Use worker described in `computer-use.md`.

AgentGateway receives three dynamically selected loopback ports: interactive inference, enrichment inference, and interactive administration. The ports must be distinct, every configured listener must become ready, and the enrichment lane has no admin listener. Generated YAML contains environment placeholders rather than secrets. A random bearer token and provider credentials are passed only to the child environment, and the child processes are attached to kill-on-close Windows Job Objects. Every fixed Lumen-owned sidecar is launched through one serialized Windows boundary that hides console windows, makes the child inherit suppressed critical-error and Windows Error Reporting dialogs, and immediately restores Lumen's process error mode.

## Answer routing

`TauriAnswerService` submits a bounded request and receives typed channel events. Rust owns the route decision:

| Mode | Route behavior |
| --- | --- |
| Local | `lumen.answer.local` only; no cloud fallback |
| Cloud | Requires persisted answer consent and an OpenAI Credential Manager entry |
| Auto | Cloud then local only when both consent and the credential exist; otherwise local only |

Queries are limited to 4,000 Unicode code points. Gateway connection, header, idle, and total request deadlines are explicit; SSE frames and error bodies are bounded and malformed UTF-8 or JSON fails closed. Cancellation is generation-safe, including cancellation that arrives before request registration. Revoking cloud consent cancels cloud-capable work without cancelling local-only answers.

## Local runtime ownership

Local readiness is not inferred from an arbitrary listener on the fixed Lemonade port. Rust reports `ready` only when its supervised child is still alive and its authenticated loopback model endpoint returns a successful HTTP response. Starting local mode rejects a pre-existing unowned listener. If an owned child exits or becomes unhealthy, ownership is cleared before replacement.

Lemonade compatibility is read from the selected `LemonadeServer.exe` VERSIONINFO rather than from an unrelated command on `PATH`. External FLM, mistral.rs, and accelerator probes have bounded time and output. The current qualified versions are Lemonade 11.5.1 and FLM 0.9.46.

## Durable content and enrichment

SQLite is authoritative for indexed files, hashes, extraction revisions, enrichment jobs, leases, retries, and artifacts. Root synchronization performs bounded local extraction for text, Office XML, and PDF documents. Generation and content-hash checks prevent stale work from writing after root replacement, index deletion, source modification, or consent revocation.

OCR and transcription require all of the following:

1. persisted answer/provider consent;
2. an OpenAI credential in Windows Credential Manager;
3. cloud enrichment enabled for the specific indexed root;
4. a current source hash and index generation;
5. an unpaused processor at upload and completion time.

The SQLite processor leases at most four jobs per pass, recovers expired leases, applies retry backoff, and schedules its next durable wake. OCR uses the Gateway responses route with a verified image MIME type and a 4 MiB input cap. Transcription uses the explicit multipart audio route and a 25 MiB cap. Provider responses and stored artifact text are capped at 1 MiB. Successful completion inserts searchable text and marks the lease complete in one transaction.

## Rivet degradation contract

Rivet coordinates wakeups when its staged Windows engine is healthy; it does not own queue durability or provider execution. Health exposes the SQLite `processorState` and Rivet `coordinatorState` separately. If Rivet is missing or crashes, the processor continues draining SQLite and the UI reports truthful degraded coordination rather than declaring enrichment unavailable.

The staged Rivet 2.3.10 engine currently exits with Windows status `0xc0000005` on this validation machine. The explicit staged probe passes by verifying that this is reported as `coordinatorState: unavailable` while the SQLite/provider path remains usable, without surfacing a modal Windows crash dialog. A loopback provider integration test exercises lease, OCR request, atomic completion, and indexed search without Rivet.

## Deliberate exclusions

No semantic/vector index, reranker, MCP server, webview-side provider call, or generic process launcher is present. Live provider acceptance is a separate manual gate because it uses user credentials, sends selected content or browser data off-device, and may incur charges.
