# Release

## Release Quality Gate

Run before creating release artifacts:

```bash
npm run check:all
```

## Build Artifacts

- Renderer production build: `dist/**`
- Electron transpiled output: `build-electron/**`

## Package Windows Installer

```bash
npm run dist:win
```

Installer output will be generated under configured electron-builder output directory (`release/` by default).

## Release Checklist

1. Confirm metadata in `package.json` (`name`, `version`, `build.appId`, `build.productName`).
2. Confirm icon assets in `build/` are updated for target product.
3. Confirm `npm run check:all` passes.
4. Run `npm run dist:win`.
5. Smoke test installed app on clean machine/user profile.

## Versioning Guidance

- Use semantic versioning for template consumers.
- Update `version` through normal release process and changelog discipline.
