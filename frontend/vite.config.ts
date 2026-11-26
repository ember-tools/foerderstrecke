import {emberbox} from '@emberbox/ui/vite'
import vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'

const backend = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
    plugins: [
        vue(),
        emberbox({
            url: 'https://foerderstrecke.emberbox.app',
            // TODO: switch to the tool's own logo once @emberbox/ui ships it
            logo: 'emberbox',
            app: {name: 'Förderstrecke', description: 'Wasserförderung über lange Wegstrecken planen und üben'},
            prerender: {entry: 'src/prerender.ts', paths: ['/']},
        }),
    ],
    server: {
        proxy: {
            '/api': {target: backend, changeOrigin: true},
            '/tiles': {target: backend, changeOrigin: true},
        },
    },
})
