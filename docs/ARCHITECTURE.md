# Architecture

## Process Boundaries

- Main process: `electron/main/**`
- Preload bridge: `electron/preload/**`
- Renderer UI: `src/renderer/**`
- Shared contracts: `shared/**`

Rules:
- Renderer must not import main process code.
- Main process must not import renderer code.
- Cross-process contracts live in `shared/contracts.ts`.

## Runtime Bootstrap Pipeline

- Renderer bootstrap entry: `src/renderer/app/bootstrap/bootstrapRuntime.ts`
- Main bootstrap payload builder: `electron/main/config/runtimeBootstrap.ts`
- IPC channel: `app:get-bootstrap`
- Unified payload: `RuntimeBootstrap`

This ensures runtime metadata, capabilities, and feature flags are delivered as one stable contract.

## IPC Contract Model

- All IPC APIs return `ApiResult<T>`.
- Success path: `{ ok: true, data }`
- Failure path: `{ ok: false, code, message }`
- Renderer unwraps through `shared/api/unwrap.ts`.

## Main Process Responsibilities

- App lifecycle and window creation
- Security policies (`setWindowOpenHandler`, navigation controls)
- IPC registration and runtime bootstrap provider
- Main-process structured logging

## Preload Responsibilities

- Expose minimal typed API surface (`window.appApi`)
- Never expose raw `ipcRenderer` directly to renderer business code

## Renderer Responsibilities

- Shell composition in `app/shell/AppShell.tsx`
- Feature tab ordering in `app/config.ts`
- Feature component binding in `app/featureRegistry.ts`
- Runtime bootstrap + feature flag consumption

## Extensibility Model

- Feature module lives under `src/renderer/features/<feature-id>`
- Registration points:
  - `src/renderer/app/config.ts` (tab metadata)
  - `src/renderer/app/featureRegistry.ts` (component manifest)
- Preferred expansion: `npm run scaffold:feature -- ...`

## Reliability Baseline

- Fail-safe fallback page when renderer assets are unavailable
- AppErrorBoundary wraps root renderer app
- CI runs typecheck/lint/test/build/build:electron
- Template doctor validates structure, contracts, and shell baseline
