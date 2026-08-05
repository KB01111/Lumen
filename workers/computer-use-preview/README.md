# Lumen Computer Use sidecar

This worker adapts Google's Computer Use Preview to Lumen's typed sidecar protocol.

Upstream: https://github.com/google-gemini/computer-use-preview

Pinned source commit: `77c9797e943aad63bbc963b7fd092a9e51c07863`

The files under `upstream/` retain their original Apache-2.0 headers and are redistributed under `LICENSE`. Lumen's `worker.py` adds a JSON-lines protocol, Edge confinement, cancellation, and explicit approval callbacks without exposing Python process control to the webview.

The packaged worker uses the installed Microsoft Edge channel. It receives the Gemini key only through its process environment, writes typed progress events to stdout, and accepts only approval/cancellation messages on stdin.
