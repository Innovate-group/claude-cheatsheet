# Claude Cheatsheet

Cheatsheet estática de tu carpeta `~/.claude` — subís tu JSON y ves todos tus **slash commands**, **skills**, **plugins** y **agents** en un solo lugar, con búsqueda, filtros y favoritos.

El sitio no guarda nada en un servidor: todo corre en tu navegador. Cada persona genera su propio inventario localmente.

## Cómo usarlo

**1. En tu Mac**, generá el inventario bajando el script y ejecutándolo con Node:

```bash
curl -sSL <URL-del-sitio>/build-inventory.mjs -o claude-cheatsheet.mjs \
  && node claude-cheatsheet.mjs > cheatsheet.json
```

El script lee tu carpeta `~/.claude` (podés apuntar a otra con `CLAUDE_DIR=/ruta/a/.claude`) y escribe el inventario a `cheatsheet.json`. No tiene dependencias — corre con Node puro.

**2. En el sitio**, arrastrá `cheatsheet.json` a la página o usá el botón *Subir JSON*. El inventario queda cacheado en `localStorage`, así que la próxima vez que entres ya está listo.

## Qué muestra

- **Slash commands** (`~/.claude/commands/*.md`) con su `argument-hint`, `allowed-tools` y `model`.
- **Skills** (`~/.claude/skills/*/SKILL.md`) con sus `tools` y `model`.
- **Agents** (`~/.claude/agents/*.md`).
- **Plugins y marketplaces** (`~/.claude/plugins/marketplaces/*`) con sus conteos de skills/commands/agents y si están descargados.
- Un resumen de tu `settings.json` (modelo, effort level, directorios adicionales, permisos).

Además: búsqueda con `/`, filtros por tipo, favoritos (también en `localStorage`), tema claro/oscuro y un modal con el detalle de cada item.

## Desarrollo

```bash
npm install
npm run dev        # Astro dev server
npm run build      # build estático a dist/
npm run preview    # preview del build
npm run inventory  # corre build-inventory.mjs contra ~/.claude y escribe a stdout
```

Stack: [Astro](https://astro.build) (output `static`) + Tailwind + TypeScript vanilla para la hidratación. Sin frameworks de UI ni islands.

## Deploy

El workflow `.github/workflows/deploy.yml` publica a GitHub Pages en cada push a `main`. Los env vars `ASTRO_BASE` y `ASTRO_SITE` los setea `actions/configure-pages` para que las rutas funcionen bajo el subpath del repo.

## Privacidad

- El JSON nunca sale de tu navegador.
- `cheatsheet.json` está en `.gitignore` — no se commitea por accidente.
- El script de inventario solo lee metadatos (nombre, `description`, frontmatter). No incluye el cuerpo de los archivos.
