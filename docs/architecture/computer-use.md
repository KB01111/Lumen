# Computer Use boundary

Lumen integrates the pinned Google Gemini Computer Use Preview as a supervised browser-only worker. It is intentionally separate from file search and answer generation: the React tree depends on `ComputerUseService`, while Rust owns credentials, process creation, cancellation, and the Windows Job Object.

## Trust boundaries

1. The launcher switches explicitly from Search to Agent mode. Typing never starts a browser task; the user presses Enter or **Run in Edge**.
2. `TauriComputerUseService` sends a typed request over IPC and Zod-parses every event before it enters React state.
3. Rust rejects empty/oversized tasks, unknown models, non-HTTP(S) start pages, missing consent, and missing credentials before starting a process.
4. The Gemini key is read from Windows Credential Manager and passed only to the fixed worker environment. The worker removes it before Edge descendants start; it is never returned to the webview or written to generated configuration.
5. The worker launches the installed Microsoft Edge channel in a fresh Playwright context. It exposes browser actions only; Lumen grants no shell plugin or arbitrary execute permission.
6. When Gemini returns `require_confirmation`, the worker emits an `approvalRequired` event and blocks. Rust accepts only the matching alphanumeric approval ID, and the UI offers one-time approval or deny-and-stop.
7. Cancellation terminates the worker and its descendants through a kill-on-close Job Object. A task is limited to 4,000 characters and 60 model iterations.

## Runtime flow

```text
React Agent mode
  -> ComputerUseService.start(request, Channel)
  -> Rust ComputerUseSupervisor
     -> Windows Credential Manager (Gemini key)
     -> fixed lumen-computer-use sidecar
        -> google-genai Computer Use model
        -> Playwright -> fresh Microsoft Edge context
  <- started / reasoning / action / observation
  <- approvalRequired -> explicit user response -> worker resumes or stops
  <- completed / cancelled / failed
```

The task, visited page URLs, and screenshots are cloud data. Computer Use settings record separate device-local consent and explain that scope before enabling **Run in Edge**. Existing AgentGateway answer consent does not implicitly authorize Computer Use.

## Packaging and provenance

`workers/computer-use-preview/upstream` contains the Apache-2.0 agent and computer abstractions copied from `google-gemini/computer-use-preview` commit `77c9797e943aad63bbc963b7fd092a9e51c07863`. The adjacent README and license preserve provenance. Lumen-specific JSON-lines, cancellation, Edge-channel, and approval behavior lives in `worker.py`.

`bun run stage:computer-use` creates a cached Python 3.11 environment, installs the fully pinned `requirements.lock`, builds a one-file PyInstaller executable, and records a SHA-256 build ID over every worker input. `bun run stage:sidecars` includes that step, and Tauri packages the result as an external binary. Both source-mode and packaged-mode `--health` checks must pass.

## Operational limits

- Computer Use requires a user-provided Gemini API key and explicit consent; Lumen never fabricates or stores a key in repository files.
- The worker starts with a clean Edge context rather than the user's signed-in browser profile.
- A live provider task is a separate acceptance gate because it sends screenshots to Gemini and may incur provider charges. Unit, browser, executable-health, and native build checks do not claim that live gate was run.
