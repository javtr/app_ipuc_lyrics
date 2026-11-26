import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'https://app-ipuc-lyrics.pages.dev';

const devApiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: true
  }
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'IPUC Lyrics - Alabanza y Medios',
        short_name: 'IPUC Lyrics',
        description: 'Gestor y visor de letras y acordes para grupos de alabanza y medios audiovisuales.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']
      }
    })
  ],
  server: {
    proxy: devApiProxy
  },
  preview: {
    proxy: devApiProxy
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
