# Site GhostReply

React + Vite, publicado no GitHub Pages em https://fwestarb.github.io/ghostreply/.

```powershell
cd website
npm ci
npm run dev
# Produção em ../docs/ui e ../docs/index.html
npm run build
```

Content and theme: src/content.js and src/styles.css. The site uses FlexCarousel, GlideSelect, HalftoneReveal, FoldText, SideRays and LatticeLoader from the Tera site, retaining the React Bits license. Dappled Light Pro is not included because no license is available.

Downloads are source snapshots, without secrets or installed dependencies. If updating the source ZIP, recalculate SHA-256 in content.js and docs/downloads/SHA256SUMS.txt. The web download checks integrity before handing the file to the browser.

## Browser QA

Test tools require Playwright and installed Microsoft Edge. Serve docs with Python, set PROJECT_SITE_URL, then run node tools/test_site.cjs from the repository root. tools/test_site_effects.cjs captures separate hero/gallery/mobile views and checks real font loading and shader changes. Screenshots are saved in ignored private-backups.
