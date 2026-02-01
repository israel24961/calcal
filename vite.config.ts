import { defineConfig, loadEnv } from 'vite'
import UnoCss from 'unocss/vite'
import unoConfig from './uno.config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/

export default defineConfig(({ mode }) => {
    process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

    return ({
        plugins: [
            UnoCss(unoConfig),
            react(),
        ],
        server: {
            port: 5173,
            host: "0.0.0.0",
            proxy: {
                '/api': {
                    target: process.env.VITE_URLBACK,
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '')
                },
                '/img': {
                    target: process.env.VITE_URLBACK,
                    changeOrigin: true,
                    rewrite: (path) => path//.replace(/^\/img/, '')
                }
            }
        }
    })
})
