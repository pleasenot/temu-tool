# Repository Guidelines

## Project Structure & Module Organization
This pnpm workspace is rooted at `temu-tool-claude-review-directory-IWWD2/temu-tool-claude-review-directory-IWWD2`. Source is split by package:

- `packages/web/`: React, Vite, and Tailwind UI. Components live under `src/components/`, API helpers under `src/api/`, and global styles in `src/styles/`.
- `packages/electron/`: Electron main process, Express HTTP routes, WebSocket server, Playwright automation, and service modules under `src/`.
- `packages/shared/`: Shared TypeScript exports and cross-package types.
- `packages/extension/`: Chrome extension manifest, content scripts, background worker, and popup files.
- `docs/`, `scripts/`, and `test-batch*.json`: project notes, helper scripts, and local batch fixtures.

## Build, Test, and Development Commands
Run commands from the workspace root.

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: start all package dev tasks in parallel.
- `pnpm dev:web`: start the Vite web app on port 5173.
- `pnpm dev:electron`: compile and run Electron; the backend listens on port 23790.
- `pnpm build`: build shared types first, then other packages.
- `pnpm typecheck`: run `tsc --noEmit` across shared, Electron, and web packages.

There is no dedicated unit test script yet. Use `pnpm typecheck` plus targeted manual verification for changed workflows.

## Coding Style & Naming Conventions
Use TypeScript for application logic and React components. Keep component files in PascalCase, hooks in `useCamelCase.ts`, and service or route modules in kebab-case or existing local style. Prefer 2-space indentation, explicit exported types in `packages/shared`, and workspace imports such as `@temu-lister/shared`. Avoid leftover debug routes, `console.log` tracing, hardcoded credentials, and hardcoded external API domains.

## Testing Guidelines
Place new tests or fixtures near the package they exercise. Name batch fixtures clearly, for example `test-batch-small.json`. For UI changes, verify the Vite app in browser; for Electron or API changes, restart Electron because it does not reliably watch server-side files. Re-run `pnpm typecheck` before handing off work.

## Commit & Pull Request Guidelines
Recent history uses short English Conventional Commit subjects, for example `feat: export each mockup scene as separate file using Layer Comps` and `fix: default video resolution to 768P`. Keep commits focused. Pull requests should include a concise description, linked issue when available, screenshots for UI changes, and notes for operational impacts such as “requires electron restart” or “reload Chrome extension.”

## Security & Configuration Tips
Store secrets in `.env` or secure settings, never in source. Preserve Playwright session handling and Temu API anti-content injection paths when touching automation code.
