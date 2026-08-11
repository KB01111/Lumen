# GitHub Actions CI and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows GitHub Actions workflow that verifies Lumen, uploads MSI and NSIS installers for every successful run, and publishes those exact installers for matching `v*` tag pushes.

**Architecture:** A read-only `verify-package` job owns the complete Windows source-to-installer path and uploads one commit-addressed artifact. A dependent `release` job runs only for version-tag push events, downloads that artifact, and receives the narrowly scoped `contents: write` permission needed to create the GitHub Release.

**Tech Stack:** GitHub Actions, Windows Server 2025 runner, Bun 1.3.14, Python 3.11, stable Rust/MSVC, Microsoft Edge, Tauri 2, actionlint 1.7.12, GitHub CLI.

## Global Constraints

- Use Bun 1.3.14 and the checked-in `bun.lock`; do not use npm or yarn.
- Use stable Rust with `rustfmt` and `clippy` on `windows-2025`.
- Preserve the exact repository verification commands and serial Microsoft Edge E2E configuration.
- Run `bun run stage:sidecars` before Cargo evaluates Tauri's external-binary bundle configuration.
- Upload only MSI and NSIS installers, retained for 14 days as workflow artifacts.
- Create a GitHub Release only for a pushed `v*` tag that matches both checked-in application versions.
- Give ordinary runs `contents: read`; give only the tag-gated release job `contents: write`.
- Pin every reusable action to an immutable commit SHA and retain a readable version comment.
- Do not create or move tags, bump versions, sign installers, deploy Lumen, or add repository secrets.

---

### Task 1: Create, verify, and commit the Windows CI and release workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Reference: `docs/superpowers/specs/2026-08-11-github-actions-ci-release-design.md`
- Reference: `package.json`
- Reference: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: `bun.lock`, `src-tauri/Cargo.lock`, the repository scripts in `package.json`, staged sidecar configuration in `src-tauri/tauri.conf.json`, and GitHub event fields `github.event_name`, `github.ref`, `github.ref_name`, and `github.sha`.
- Produces: the `lumen-windows-x64-${{ github.sha }}` workflow artifact and, for an eligible tag push, a GitHub Release named `Lumen <tag>` with the artifact's MSI and NSIS files attached.
- Produces: fresh local verification evidence and one reviewed implementation commit containing the workflow and this plan.

- [ ] **Step 1: Run the workflow validator before the workflow exists**

Run:

```powershell
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml
```

Expected: FAIL because `.github/workflows/ci.yml` does not exist. This proves the validation gate observes the missing deliverable before implementation.

- [ ] **Step 2: Create the minimal complete workflow**

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: CI

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: ${{ !startsWith(github.ref, 'refs/tags/v') }}

jobs:
  verify-package:
    name: Verify and package
    runs-on: windows-2025
    timeout-minutes: 75
    env:
      CARGO_TERM_COLOR: always
      LUMEN_PYTHON: python

    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up Bun
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.14

      - name: Set up Python
        uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0
        with:
          python-version: '3.11'

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable 2026-08-11
        with:
          toolchain: stable
          components: rustfmt, clippy

      - name: Restore Rust cache
        uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2
        with:
          workspaces: src-tauri -> target

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Run unit tests
        run: bun run test

      - name: Run Edge end-to-end tests
        run: bun run test:e2e
        timeout-minutes: 15

      - name: Stage sidecars
        run: bun run stage:sidecars

      - name: Check Rust formatting
        working-directory: src-tauri
        run: cargo fmt --all -- --check

      - name: Run Clippy
        working-directory: src-tauri
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Run Rust tests
        working-directory: src-tauri
        run: cargo test --all-features

      - name: Verify release version
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
        shell: pwsh
        env:
          RELEASE_TAG: ${{ github.ref_name }}
        run: |
          $packageVersion = (Get-Content -Raw package.json | ConvertFrom-Json).version
          $tauriVersion = (Get-Content -Raw src-tauri/tauri.conf.json | ConvertFrom-Json).version
          if ($packageVersion -cne $tauriVersion) {
            throw "Version mismatch: package.json=$packageVersion tauri.conf.json=$tauriVersion"
          }
          $expectedTag = "v$packageVersion"
          if ($env:RELEASE_TAG -cne $expectedTag) {
            throw "Release tag $env:RELEASE_TAG must equal $expectedTag"
          }

      - name: Build installers
        run: bun run tauri build

      - name: Verify installer artifacts
        shell: pwsh
        run: |
          $msi = @(Get-ChildItem src-tauri/target/release/bundle/msi -Filter *.msi -File)
          $nsis = @(Get-ChildItem src-tauri/target/release/bundle/nsis -Filter *-setup.exe -File)
          if ($msi.Count -ne 1 -or $nsis.Count -ne 1 -or $msi[0].Length -eq 0 -or $nsis[0].Length -eq 0) {
            throw "Expected one non-empty MSI and one non-empty NSIS installer; found $($msi.Count) MSI and $($nsis.Count) NSIS"
          }
          $msi + $nsis | Select-Object FullName, Length

      - name: Upload installers
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: lumen-windows-x64-${{ github.sha }}
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*-setup.exe
          if-no-files-found: error
          retention-days: 14

  release:
    name: Publish release
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
    needs: verify-package
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write

    steps:
      - name: Download installers
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: lumen-windows-x64-${{ github.sha }}
          path: installers

      - name: Publish GitHub Release
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          mapfile -t msi < <(find installers -type f -name '*.msi' -print)
          mapfile -t nsis < <(find installers -type f -name '*-setup.exe' -print)
          if [[ ${#msi[@]} -ne 1 || ! -s "${msi[0]}" ]]; then
            printf 'Expected exactly one non-empty MSI installer, found %s\n' "${#msi[@]}" >&2
            exit 1
          fi
          if [[ ${#nsis[@]} -ne 1 || ! -s "${nsis[0]}" ]]; then
            printf 'Expected exactly one non-empty NSIS installer, found %s\n' "${#nsis[@]}" >&2
            exit 1
          fi
          gh release create "$GITHUB_REF_NAME" "${msi[0]}" "${nsis[0]}" \
            --repo "$GITHUB_REPOSITORY" \
            --verify-tag \
            --generate-notes \
            --title "Lumen $GITHUB_REF_NAME"
```

- [ ] **Step 3: Run actionlint against the implemented workflow**

Run:

```powershell
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml
```

Expected: PASS with no output. This validates YAML structure, expressions, event filters, job dependencies, permissions, shells, and workflow command syntax.

- [ ] **Step 4: Exercise the release-version logic with the checked-in version**

Run:

```powershell
$env:RELEASE_TAG = 'v0.1.0'
$packageVersion = (Get-Content -Raw package.json | ConvertFrom-Json).version
$tauriVersion = (Get-Content -Raw src-tauri/tauri.conf.json | ConvertFrom-Json).version
if ($packageVersion -ne $tauriVersion) { throw "Version mismatch: package.json=$packageVersion tauri.conf.json=$tauriVersion" }
$expectedTag = "v$packageVersion"
if ($env:RELEASE_TAG -ne $expectedTag) { throw "Release tag $env:RELEASE_TAG must equal $expectedTag" }
```

Expected: PASS because both checked-in versions are `0.1.0` and the simulated tag is `v0.1.0`.

- [ ] **Step 5: Prove a mismatched release tag fails**

Run the same PowerShell block with `$env:RELEASE_TAG = 'v9.9.9'`.

Expected: FAIL with `Release tag v9.9.9 must equal v0.1.0`.

#### Verification and installer-output continuation

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `src-tauri/target/release/bundle/msi/*.msi`
- Verify: `src-tauri/target/release/bundle/nsis/*-setup.exe`

**Interfaces:**
- Consumes: the local Bun, Python, Rust, Edge, sidecar staging, and Tauri toolchains.
- Produces: fresh local evidence that the workflow commands pass in repository order and that both installer formats exist before commit.

- [ ] **Step 6: Run the frontend verification gates in repository order**

Run each command separately from the repository root:

```powershell
bun run typecheck
bun run lint
bun run test
bun run test:e2e
```

Expected: every command exits 0. Playwright reports all 35 tests passed and terminates cleanly; a timeout after green test bodies is not a passing command.

- [ ] **Step 7: Stage the checksum-pinned sidecars**

Run:

```powershell
bun run stage:sidecars
```

Expected: exit 0 after verifying or rebuilding AgentGateway, Rivet, MinGW runtime, and Computer Use binaries.

- [ ] **Step 8: Run the Rust verification gates**

Run each command separately from `src-tauri`:

```powershell
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

Expected: formatting and Clippy exit 0; Rust tests pass with the repository's three intentionally ignored integration tests reported separately.

- [ ] **Step 9: Build both Windows installer formats**

Run from the repository root:

```powershell
bun run tauri build
```

Expected: exit 0 and emit one MSI under `src-tauri/target/release/bundle/msi` plus one NSIS setup executable under `src-tauri/target/release/bundle/nsis`.

- [ ] **Step 10: Verify the exact artifact file set**

Run:

```powershell
$msi = @(Get-ChildItem src-tauri/target/release/bundle/msi -Filter *.msi -File)
$nsis = @(Get-ChildItem src-tauri/target/release/bundle/nsis -Filter *-setup.exe -File)
if ($msi.Count -ne 1 -or $nsis.Count -ne 1) { throw "Expected one MSI and one NSIS installer; found $($msi.Count) MSI and $($nsis.Count) NSIS" }
$msi + $nsis | Select-Object FullName, Length
```

Expected: exactly two non-empty installer files are listed.

- [ ] **Step 11: Inspect and commit the workflow**

Run:

```powershell
git diff --check
git status --short
git diff -- .github/workflows/ci.yml
git add .github/workflows/ci.yml docs/superpowers/plans/2026-08-11-github-actions-ci-release.md
git commit -m "ci: add windows release workflow"
```

Expected: no whitespace errors; only the workflow and this implementation plan are committed. The checkout remains detached, so pushing or opening a pull request is a separate user-directed handoff.
