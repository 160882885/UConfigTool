# Team Onboarding

## 1. Prerequisites

- Node.js 22+
- npm 10+
- Windows development environment (for current packaging baseline)

## 2. First Run

```bash
npm install
npm run dev
```

Expected result:
- Renderer dev server starts
- Electron app window opens using Toolbox-like shell
- Native top-level desktop menu is hidden

## 3. Initialize New Project Metadata

```bash
npm run prepare:init-config
```

Then edit `template.init.json`, then:

```bash
npm run init:project
```

## 4. Verify Environment

```bash
npm run doctor
npm run check:all
```

## 5. Add Your First Feature

```bash
npm run scaffold:feature -- task-center "Task Center"
```

## 6. Common Troubleshooting

- If dev window is blank, check terminal logs and run `npm run doctor`.
- If build artifacts are stale, run `npm run clean:template` then rebuild.
- If ports conflict, `npm run dev` auto-discovers active Vite URL.
