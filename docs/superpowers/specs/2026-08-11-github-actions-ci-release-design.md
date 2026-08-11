# GitHub Actions CI and Release Design

**Date:** 2026-08-11

## Goal

Add one GitHub Actions workflow that verifies Lumen on its supported Windows
toolchain, produces MSI and NSIS installers from the verified source, retains
those installers as workflow artifacts, and promotes the same files into a
GitHub Release when a version tag is pushed.

## Scope

The workflow will be created at `.github/workflows/ci.yml` and will run for:

- pull requests targeting `main`;
- pushes to `main`;
- tags matching `v*`; and
- manual `workflow_dispatch` runs.

Ordinary runs will not create tags, change package versions, publish a GitHub
Release, sign installers, or deploy Lumen. A release is created only from an
explicitly pushed `v*` tag such as `v0.1.0`.

## Workflow architecture

The workflow will contain two jobs.

### Verify and package

One `windows-2025` job will own the complete source-to-installer path. It will:

1. check out the triggering commit;
2. install Bun 1.3.14;
3. install Python 3.11 for the Computer Use worker;
4. install stable Rust with `rustfmt` and `clippy`;
5. restore a Rust build cache keyed by the checked-in Cargo lockfile;
6. install JavaScript dependencies with `bun install --frozen-lockfile`;
7. run `bun run typecheck`;
8. run `bun run lint`;
9. run `bun run test`;
10. run `bun run test:e2e` against the installed Microsoft Edge channel;
11. run `bun run stage:sidecars` so Tauri's configured external binaries exist;
12. run Rust formatting, Clippy, and tests from `src-tauri` using the repository's
    exact commands;
13. for a version-tag push, verify that the tag equals `v` plus the matching
    versions in `package.json` and `src-tauri/tauri.conf.json`;
14. run `bun run tauri build`; and
15. upload the generated MSI and NSIS installers as one workflow artifact.

The job will fail when a command fails, E2E does not terminate, an installer is
missing, or artifact upload fails. It will not use `continue-on-error`, retries,
or weakened test commands. The job timeout will leave enough room for cold
Windows compilation and PyInstaller staging while still terminating a hung run.

The uploaded artifact will contain only:

- `src-tauri/target/release/bundle/msi/*.msi`; and
- `src-tauri/target/release/bundle/nsis/*-setup.exe`.

Its name will include the triggering commit SHA, and ordinary run artifacts
will be retained for 14 days. GitHub Release assets provide durable retention
for tagged versions.

Build directories, source files, credentials, generated runtime configuration,
and sidecar staging intermediates will not be uploaded.

### Publish release

A separate release job will depend on the verify-and-package job and run only
for a `push` event whose `github.ref` starts with `refs/tags/v`. A manual run
against an existing tag will therefore rebuild and upload a workflow artifact
without publishing or replacing a release. The release job will:

1. download the installer artifact produced by the dependency job; and
2. create a GitHub Release for `github.ref_name`, attach both installers, and
   generate release notes from repository history.

This job receives `contents: write`. The verify-and-package job and the workflow
default retain `contents: read`, keeping release authority out of pull-request
and normal branch builds. The release job will verify that the tag already
exists and will fail rather than inventing or moving one.

## Reproducibility and security

- Dependency resolution is locked by `bun.lock` and `src-tauri/Cargo.lock`.
- The Bun version matches the locally validated 1.3.14 toolchain.
- Sidecar URLs and checksums remain owned by `bun run stage:sidecars`; the
  workflow will not duplicate them.
- Reusable actions will be pinned to immutable commit SHAs with version comments.
- No repository or provider secrets are required for verification or packaging.
- Release publication uses the job-scoped `GITHUB_TOKEN` only.
- Workflow-level concurrency will cancel an obsolete run for the same workflow
  and Git ref, reducing duplicate Windows runner usage.

## Acceptance criteria

The change is complete when:

- the workflow is valid YAML and `git diff --check` passes;
- triggers, concurrency, and permissions match this design;
- every repository verification command is represented in the required order;
- sidecars are staged before Rust commands that evaluate the Tauri bundle;
- installer upload uses `if-no-files-found: error`;
- ordinary PR, branch, and manual runs cannot create releases;
- a release tag must match both checked-in application version fields;
- a successful `v*` tag run publishes the exact installers produced by its
  verify-and-package job; and
- local verification is rerun in proportion to the workflow-only change, with
  any inability to execute GitHub-hosted behavior reported explicitly.
