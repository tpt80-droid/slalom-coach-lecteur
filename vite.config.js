import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({build:{rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),auth:fileURLToPath(new URL('./auth.html',import.meta.url))}}}});
