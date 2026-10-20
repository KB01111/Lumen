# Third-Party Notices

## UI component packages

- Microsoft Fluent UI React v9 (`@fluentui/react-components` 9.74.9): MIT, Microsoft Corporation. [Source and license](https://github.com/microsoft/fluentui/blob/master/LICENSE). Used for Windows interaction controls and the semantic theme contract; no legacy v8 package is introduced.
- Meta Astryx (`@astryxdesign/core` 0.7.1 and development CLI 0.7.1): MIT, Meta Platforms, Inc. and affiliates. [Source and license](https://github.com/facebook/astryx/blob/main/LICENSE). Lumen uses the published precompiled components/CSS and public theme generator; generated theme artifacts retain their provenance. Upstream notices remain in the installed distribution.
- OpenAI Apps SDK UI (`@openai/apps-sdk-ui` 0.2.2): MIT, OpenAI. [Source and license](https://github.com/openai/apps-sdk-ui/blob/main/LICENSE). Reused for interface icons and passive AI status presentation. Its aggregate global stylesheet and Markdown renderer are not imported.

The narrow Keyborg 2.14.1 compatibility patch preserves the existing upstream package and license. It restores native focus through property descriptors so getter-based test instrumentation and library cleanup interoperate; it does not replace keyboard behavior.

### MIT permission notice for the UI packages above

Copyright (c) Microsoft Corporation. All rights reserved.

Copyright (c) 2026 Meta Platforms, Inc.

Copyright 2025 OpenAI.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Fluent UI's additional notice: usage of referenced fonts and icons is subject to the terms at https://aka.ms/fluentui-assets-license. Lumen references installed Segoe fonts; it does not redistribute those font files.

## sqlite-vector

- Project: sqlite-vector
- Version: 1.0.0
- Source: https://github.com/sqliteai/sqlite-vector
- Bundled artifact: `vector.dll` from `@sqliteai/sqlite-vector-win32-x86_64@1.0.0`
- Artifact SHA-256: `58ac4a99ff6904fd709f01b366cf0477c405b5bda45b96cf00e13d500aa60c6a`
- License: Elastic License 2.0, modified with an additional grant for open-source projects. The bundled package states that open-source projects under an OSI-approved license may use, copy, modify, and distribute the software without fee. Non-open-source or commercial production use requires a commercial license from SQLite Cloud, Inc.

The upstream license text is distributed in the installed package as `LICENSE.md`.

## CLIProxyAPI

- Project: CLIProxyAPI
- Source: https://github.com/router-for-me/CLIProxyAPI
- License: MIT License. Copyright (c) 2025-2005.9 Luis Pater; Copyright (c) 2025.9-present Router-For.ME.
- Usage: built as the `cliproxy-sidecar` Go binary staged by `bun run stage:clipproxy`. Lumen's `provider_switcher` Rust service drives its loopback-only `/v8/management` API (config, credentials, OAuth, usage). No CLIProxyAPI source is vendored into this repo.

## cc-switch

- Project: cc-switch
- Source: https://github.com/farion1231/cc-switch
- License: MIT License. Copyright (c) 2025 Jason Young.
- Usage: design reference for the atomic file-switch engine (`src-tauri/src/provider_switcher/files.rs`), the union vendor presets, and the Providers/AuthCenter/Usage settings panels. The ported logic was rewritten against Lumen's Tailwind CSS v4 + EinUI primitives and the Tauri `provider_switcher` service; no cc-switch source is vendored into this repo.
