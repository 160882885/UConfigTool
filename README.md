# Config

Electron + React + TypeScript desktop template for long-term team delivery.

This template preserves the Toolbox-style app shell and split-pane UX baseline while adding enterprise-grade architecture boundaries, typed IPC contracts, runtime bootstrap pipeline, feature flags, and observability-ready logging.

## Enterprise Baseline

- Toolbox-style app window shell (custom top menu bar + left tabs + workbench content)
- Native desktop menu bar hidden by default in runtime
- Reusable split-pane hook kept as baseline UX primitive
- Strict renderer/main/shared layering boundaries
- Typed IPC result model (`ApiResult`) for consistent success/failure handling
- Runtime bootstrap pipeline (`RuntimeBootstrap`) for stable startup data contracts
- Feature flag channel included by default
- Manifest-driven feature registry for predictable expansion
- CI workflow for pull requests and main branches
- Project bootstrap and metadata initialization script
- Feature scaffolding script for consistent team expansion
- Template doctor script to verify baseline integrity

## Quick Start

```bash
npm install
npm run dev
```

If a default port is occupied, `npm run dev` automatically discovers the active renderer URL and still starts Electron correctly.
If Electron binary download fails in restricted network environments, `npm run dev` will attempt offline recovery automatically.

## Team Setup Flow (for a New Project)

1. Generate init file:
```bash
npm run prepare:init-config
```
2. Edit `template.init.json` with your project metadata.
3. Apply metadata to template:
```bash
npm run init:project
```
4. Run quality gates:
```bash
npm run check:all
```

## Add New Features

```bash
npm run scaffold:feature -- <feature-id> [Feature Label]
```

Example:
```bash
npm run scaffold:feature -- workspace-search "Workspace Search"
```

This command will:
- create `src/renderer/features/<feature-id>/<PascalCase>Page.tsx`
- register the tab in `src/renderer/app/config.ts`
- register the component in `src/renderer/app/featureRegistry.ts`

## Core Scripts

- `npm run dev`: start renderer + electron in development
- `npm run doctor`: verify template baseline integrity
- `npm run repair:electron:offline`: restore Electron binary from offline cache/template dist
- `npm run check:all`: doctor + typecheck + lint + test + build + build:electron
- `npm run init:project`: apply `template.init.json` metadata
- `npm run scaffold:feature -- ...`: scaffold a feature module and registration
- `npm run clean:template`: remove generated build artifacts
- `npm run dist:win`: build windows installer with electron-builder

## Docs

- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `docs/ONBOARDING.md`
- `docs/RELEASE.md`
- `PROJECT_STRUCTURE.md`
- `docs/PROJECT_STRUCTURE_DETAILED.md`（详细结构与代码说明）

## Window UX Baseline (Do Not Regress)

- Keep native app menu hidden (`Menu.setApplicationMenu(null)` + `setMenuBarVisibility(false)`).
- Keep Toolbox shell hierarchy in renderer (`TopMenuBar`, `SidebarTabs`, `content`).
- Keep `useSplitPane` reusable and framework-agnostic.

