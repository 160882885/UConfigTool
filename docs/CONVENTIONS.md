# Conventions

## Code Style

- TypeScript strict mode enabled
- Keep functions small and side-effect boundaries explicit
- Prefer named exports for infra modules, default export for feature pages

## Folder Conventions

- `electron/main`: lifecycle, window, env, ipc, security
- `electron/preload`: bridge only
- `src/renderer/app`: shell config and registries
- `src/renderer/shared`: reusable hooks/components
- `src/renderer/features`: vertical business features
- `shared`: cross-process contracts
- `scripts`: template/devops tooling

## IPC Conventions

- Channel names in `electron/main/ipc/channels.ts`
- Handlers in `electron/main/ipc/registerAppIpc.ts`
- Typed API in `shared/contracts.ts`
- Bridge bindings in `electron/preload/index.ts`

## Testing Conventions

- Keep renderer unit tests close to shell/feature boundaries
- Add focused tests for utility hooks and critical parsing logic
- CI quality gate is `npm run check:all`

## Template Safety Conventions

- Do not remove Toolbox shell baseline from `App.tsx`
- Do not restore native desktop menu bar
- Keep split-pane hook reusable (`useSplitPane`)
- Keep only actively used feature pages; remove template demo pages when not needed

## Branching and PR

- Prefer short-lived branches
- Require CI pass before merge
- Keep PRs scoped by feature or infrastructure concern

