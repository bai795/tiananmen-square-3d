import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const esbuild = process.env.ESBUILD_BIN
  || 'C:/Users/baishanghong/Documents/ChatGPT/拥有codex之后可以做的小玩意/armor-frontline/node_modules/.pnpm/@esbuild+win32-x64@0.21.5/node_modules/@esbuild/win32-x64/esbuild.exe';

const outJs = path.join(root, 'build', 'app.bundle.js');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });

const args = [
  'src/main.js',
  '--bundle',
  '--format=iife',
  '--target=es2020',
  '--alias:three=./vendor/three.module.min.js',
  '--outfile=' + outJs,
  dev ? '--sourcemap=inline' : '--minify',
  dev ? '--minify=false' : '--log-level=info',
];
const result = spawnSync(esbuild, args, {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
let js = fs.readFileSync(outJs, 'utf8');
js = js.replaceAll('</script', '<\\/script');
const template = fs.readFileSync(path.join(root, 'src', 'index.template.html'), 'utf8');
const html = template
  .replace('/*__CSS__*/', () => css)
  .replace('/*__BUNDLE__*/', () => js);
const output = path.join(root, 'index.html');
fs.writeFileSync(output, html, 'utf8');
const kb = (fs.statSync(output).size / 1024).toFixed(0);
console.log(`Built ${output} (${kb} KB)${dev ? ' [dev]' : ''}`);
