# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static Astro site that visualizes the contents of a user's `~/.claude` directory (slash commands, skills, plugins, agents, settings). The site itself ships no user data — each user runs a standalone Node script locally to produce a `cheatsheet.json` and drops that file onto the page. UI strings are in Spanish.

Deployed to GitHub Pages on push to `main` via `.github/workflows/deploy.yml`.

## Commands

- `npm run dev` — Astro dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the built site
- `npm run inventory` — run `public/build-inventory.mjs` against `~/.claude` and print JSON to stdout. Override the scan root with `CLAUDE_DIR=/path/to/.claude npm run inventory`.

No test runner and no linter are configured.

## Architecture

### Two-part system with no runtime coupling

1. **`public/build-inventory.mjs`** — a standalone, **zero-dependency** Node script that scans `~/.claude/{commands,skills,agents,plugins/marketplaces,settings.json}`, parses YAML frontmatter with a hand-rolled parser (no `js-yaml`), and writes a flat JSON inventory to stdout. Served verbatim as a static asset so users can `curl` it from the deployed site. **Do not add npm imports** — the file must stay runnable via `node` on any Mac without `npm install`.

2. **Astro site** (`src/`) — a single page ([src/pages/index.astro](src/pages/index.astro)) that renders an empty-state shell. All interactivity lives in [src/scripts/hydrate.ts](src/scripts/hydrate.ts), a vanilla-TS client bundle. No Astro islands, no framework integrations beyond `@astrojs/tailwind`.

The contract between the two parts is the `Inventory` shape declared at the top of `hydrate.ts`, matching the object returned by `buildInventory()` in `build-inventory.mjs`. Changes to the shape must be made in both places.

### Client data flow

`handleFile` (drag/drop or file picker) → `validateInventoryShape` → `loadInventory` → render pipeline:
- `renderHero` / `renderFilterChips` / `renderFooter` update counters
- `renderCards` builds all cards off the `#card-tpl` `<template>`, populating a module-level `itemRegistry` Map keyed by `${type}:${name}` — this same key doubles as the favorites key and the modal lookup key
- `applyFilters` toggles card visibility via `is-hiding` class + `hidden` attribute, driven by `activeFilter` + `activeQuery`

Persistent state lives entirely in `localStorage` under the `cheatsheet:*` namespace (`inventory`, `inventory-name`, `favorites`, `sections-collapsed`, `theme`). On boot, `readPersistedInventory` rehydrates the last uploaded JSON so the page survives reloads.

### GitHub Pages base path

`astro.config.mjs` reads `ASTRO_BASE` / `ASTRO_SITE` from the environment (set by `actions/configure-pages` in the deploy workflow). Locally both default to `/`. When generating URLs to static assets (e.g. the `build-inventory.mjs` download link in the copy button), use `import.meta.env.BASE_URL` in Astro or `new URL('.', location.href)` in client code — never a hardcoded `/`. The copy-command button in `hydrate.ts:buildDownloadCommand` relies on this.

### Theming

Colors are CSS custom properties (`--bg`, `--fg`, `--muted`, `--line`, `--accent`, `--accent-soft`) defined in [src/styles/global.css](src/styles/global.css) and exposed to Tailwind via `tailwind.config.mjs`. Theme is toggled by flipping `data-theme` on `<html>`; an inline script in [src/layouts/Layout.astro](src/layouts/Layout.astro) sets the initial value before paint to avoid flash. Tailwind `applyBaseStyles` is disabled — base styles live in `global.css`.

### cheatsheet.json is gitignored

The file at the repo root is a local working copy for the maintainer and is not committed. Don't rely on it existing.
