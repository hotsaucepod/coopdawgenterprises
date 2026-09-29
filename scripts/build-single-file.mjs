// Bundles dist/ into one self-contained HTML file (dist/mall-tycoon.html).
// Handy for hosting the game anywhere that takes a single file. Run `npm run build` first.
import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist';
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assets = fs.readdirSync(path.join(dist, 'assets'));
const js = fs.readFileSync(path.join(dist, 'assets', assets.find((f) => f.endsWith('.js'))), 'utf8');
const css = fs.readFileSync(path.join(dist, 'assets', assets.find((f) => f.endsWith('.css'))), 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].trim();

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>Mall Tycoon</title>
<style>
:root { color-scheme: dark; }
${css}
</style>
</head>
<body>
${body}
<script>
${js.replace(/<\/script>/g, '<\\/script>')}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dist, 'mall-tycoon.html'), page);
console.log('wrote dist/mall-tycoon.html', Math.round(page.length / 1024), 'KB');
