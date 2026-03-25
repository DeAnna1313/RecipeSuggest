// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import alpinejs from '@astrojs/alpinejs';

export default defineConfig({
  output: 'server',
  adapter: netlify(),
  integrations: [alpinejs()],
});
