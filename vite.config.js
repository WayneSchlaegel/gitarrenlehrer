import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' damit die App unter https://<user>.github.io/<repo>/ läuft
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Gitarrenlehrer',
        short_name: 'Gitarre',
        description: 'Liederbuch, Übungen und Lehrer für zu Hause',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f3f5f4',
        theme_color: '#14514f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
