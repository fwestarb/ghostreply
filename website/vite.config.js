import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
const docs = resolve(import.meta.dirname, '../docs');
const documentationAssets = {
  name: 'tera-documentation-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!/^\/(assets|images|downloads)\//.test(pathname)) return next();
      const file = resolve(docs, '.' + pathname);
      if (!file.startsWith(docs + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
      const types = {png:'image/png',jpg:'image/jpeg',svg:'image/svg+xml',zip:'application/zip'};
      res.setHeader('Content-Type', types[file.split('.').pop()] || 'application/octet-stream');
      res.setHeader('Content-Length', statSync(file).size);
      createReadStream(file).pipe(res);
    });
  }
};
export default defineConfig({ plugins: [react(), documentationAssets], base: './', publicDir: false });
