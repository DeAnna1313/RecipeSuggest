// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import alpinejs from '@astrojs/alpinejs';
import clerk from '@clerk/astro';

export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [clerk(), alpinejs()],
  server: {
    port: 4322,
  },
});
