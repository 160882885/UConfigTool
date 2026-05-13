# Config Project Structure

```text
electron/
  main/
    env.ts
    index.ts
    ipc.ts
    lifecycle.ts
    logger.ts
    menu.ts
    runtimeMeta.ts
    security.ts
    window.ts
    config/
      runtimeBootstrap.ts
    ipc/
      channels.ts
      registerAppIpc.ts
      result.ts
  preload/
    index.ts

src/
  renderer/
    app/
      bootstrap/
        bootstrapRuntime.ts
      config.ts
      featureRegistry.ts
      shell/
        AppShell.tsx
    features/
      _core/
        featureFlags.ts
      custom/
        CustomPage.tsx
    shared/
      api/
        appBridge.ts
        error.ts
        unwrap.ts
      components/
        AppErrorBoundary.tsx
        SidebarTabs.tsx
        TopMenuBar.tsx
      hooks/
        useSplitPane.ts
      logging/
        logger.ts
      state/
        runtimeState.ts
    App.tsx
    App.test.tsx
    global.d.ts
    main.tsx
    styles.css

shared/
  contracts.ts

scripts/
  clean-template.cjs
  dev-runner.cjs
  init-project.cjs
  prepare-init-config.cjs
  scaffold-feature.cjs
  template-doctor.cjs
  templates/
    init.config.example.json

docs/
  ARCHITECTURE.md
  CONVENTIONS.md
  ONBOARDING.md
  RELEASE.md
  PROJECT_STRUCTURE_DETAILED.md
```

## Rules

- Renderer never imports Electron main code directly.
- Main process never imports renderer code.
- Feature pages are composition layers, not shell owners.
- Shared hooks/components stay UI-agnostic and reusable.
- Business logic belongs in feature-local services/hooks.
