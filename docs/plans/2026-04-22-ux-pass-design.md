# UX pass — mobile, modal, animations, collapsible sections

Fecha: 2026-04-22
Alcance: 4 mejoras acordadas con el usuario en sesión `/brainstorming`.

## 1. Mobile

Problemas detectados:
- Hero muy alto (`pt-20 pb-12` + título `text-5xl`) — devora la primera pantalla.
- Sticky bar en 2 filas + ThemeToggle compitiendo con el scroller de chips.
- Chips sin affordance de scroll horizontal.
- Empty state con `py-16` excesivo; `<pre>` del `curl` no se adapta a ancho chico.

Fixes:
- Hero: `pt-12 pb-8 sm:pt-28 sm:pb-16`, título `text-4xl sm:text-6xl lg:text-7xl`.
- Sticky bar: mover `ThemeToggle` fuera — sólo en mobile queda dentro del hero (top-right); en desktop sigue al lado de los chips.
- Chips: gradiente/mask a la derecha cuando hay overflow.
- Empty state: `py-10 sm:py-16`; pre con `whitespace-pre-wrap sm:whitespace-pre`.
- Modal en mobile se vuelve bottom-sheet full-height.

## 2. Card clickeable + Modal

Click abre modal. La estrella de favorito no dispara apertura (stopPropagation).
Keyboard: Tab enfoca cards, Enter/Space abre. Esc/backdrop/X/drag-handle cierran.
Focus vuelve a la card al cerrar. Body scroll lock mientras está abierto.

Desktop: modal centrado max-w-2xl con backdrop blur.
Mobile: bottom-sheet full-height con drag-handle visual arriba.

Contenido por tipo (sin botón de copy — descartado explícitamente):
- Header: pill de tipo + nombre.
- Command: invocation (`/name`), descripción completa, argument-hint, allowed-tools (chips), model, fuente, fav toggle.
- Skill: descripción, model, tools, fuente, fav toggle.
- Agent: como command + tools.
- Plugin: descripción, category, counts (skills/commands/agents), estado downloaded, homepage link, marketplace, fav toggle.

Cambio técnico: ampliar interfaces `Item` y `Plugin` en `hydrate.ts` para incluir campos que el JSON ya trae (`argumentHint`, `allowedTools`, `model`, `tools`, `skillsCount`, etc.).

Template `#modal-tpl` en `index.astro` con secciones condicionales; `hydrate.ts` clona y rellena.

## 3. Animaciones (T1 + T2)

Tier 1:
- Chips: `transition` 200ms sobre bg/border/color.
- Cards filtradas: clase `.is-hiding` → `opacity:0 + scale(.96)` 180ms; `transitionend` aplica `hidden`.
- Favorito: keyframe `fav-pop` 280ms (scale 1→1.3→1), reiniciado con `animation:none` trick.
- Theme toggle: íconos stackeados, cross-fade + rotación 180°, 300ms.
- Counters hero: count-up con `requestAnimationFrame`, ~600ms, easeOutQuad, zero-pad.

Tier 2:
- Modal: backdrop opacity 200ms; sheet desktop `scale(.96)→1`; sheet mobile `translateY(100%)→0`, cubic-bezier(.32,.72,0,1).
- Stagger secciones: IntersectionObserver una sola vez, `is-revealed` → `opacity 0→1 + translateY(12px→0)`, stagger 80ms.
- Collapse: grid `grid-template-rows: 1fr | 0fr` con transición 240ms.
- Sticky compact: sentinel de 1px antes de la barra; IntersectionObserver alterna `.is-compact` → `py-3→py-2`.

`prefers-reduced-motion`: fade simple 100ms, sin translate/scale.

## 4. Secciones colapsables

Header de cada sección (Commands/Skills/Plugins/Agents) se vuelve `<button>` con chevron.
Estado persistido en `localStorage` bajo `cheatsheet:sections-collapsed` (`{command:false, skill:false, plugin:false, agent:false}`).
Default: expandidas. No se resetea al cargar otro JSON.

Interacción con filtros:
- 0 matches por filtro/búsqueda → `display:none` como hoy.
- N matches + colapsado por el usuario → header visible con counter, grid colapsado.

A11y: `aria-expanded` + `aria-controls` apuntando al id del grid.

Técnica CSS: `grid-template-rows: 1fr | 0fr` + transición (mismo approach que T2).
