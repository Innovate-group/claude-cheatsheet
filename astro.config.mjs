import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// In dev we want "/", in prod the repo name as base.
// The GH Pages Action sets ASTRO_BASE and ASTRO_SITE from the configure-pages step.
const rawBase = process.env.ASTRO_BASE || '/';
const base = rawBase.endsWith('/') ? rawBase : rawBase + '/';
const site = process.env.ASTRO_SITE || undefined;

export default defineConfig({
  site,
  base,
  integrations: [tailwind({ applyBaseStyles: false })],
  output: 'static',
});
