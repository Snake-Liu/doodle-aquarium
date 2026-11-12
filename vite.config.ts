import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '塗鴉水族箱',
        short_name: '塗鴉水族箱',
        description: '掃描小朋友的塗鴉圖紙，讓專屬海洋生物在手機水族箱中游動！',
        theme_color: '#0c4a6e',
        background_color: '#082f49',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: './icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: './icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,webmanifest}'],
        globIgnores: ['**/*-canon-outline.png', '**/*-mask.png'],
      },
    }),
  ],
}));
