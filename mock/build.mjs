import fs from 'node:fs';
const html=fs.readFileSync(new URL('index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('style.css',import.meta.url),'utf8');
const scenes=fs.readFileSync(new URL('scenes.js',import.meta.url),'utf8').replaceAll('export const','const');
const app=fs.readFileSync(new URL('app.js',import.meta.url),'utf8').replace("import {scenes,overlays,walkthrough,palette} from './scenes.js';",'');
fs.mkdirSync(new URL('fixtures/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('fixtures/JanPon-walkthrough.html',import.meta.url),html.replace('<link rel="stylesheet" href="style.css">',`<style>${css}</style>`).replace('<script type="module" src="app.js"></script>',`<script type="module">${scenes}\n${app}</script>`));
