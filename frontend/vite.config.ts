import {emberbox, helpPaths} from '@emberbox/ui/vite'
import vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'
import {HELP_TOPIC_SLUGS} from './src/help/topics'

const backend = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
    plugins: [
        vue(),
        emberbox({
            url: 'https://foerderstrecke.emberbox.app',
            logo: 'foerderstrecke',
            app: {
                name: 'Förderstrecke',
                description: 'Wasserförderung über lange Wegstrecken planen und üben',
                startUrl: '/planer',
            },
            prerender: {entry: 'src/prerender.ts', paths: ['/', ...helpPaths(HELP_TOPIC_SLUGS)]},
        }),
    ],
    server: {
        proxy: {
            '/api': {target: backend, changeOrigin: true},
            '/tiles': {target: backend, changeOrigin: true},
        },
    },
})
