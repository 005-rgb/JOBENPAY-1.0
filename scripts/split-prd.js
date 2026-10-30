import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'docs', 'PRD.md');
const outDir = path.join(root, 'docs', 'prd');

if (!fs.existsSync(source)) {
  throw new Error('docs/PRD.md not found.');
}

fs.mkdirSync(outDir, { recursive: true });
const content = fs.readFileSync(source, 'utf8');
const sections = content.split(/^##\s+/m).slice(1);

for (const section of sections) {
  const lines = section.split(/\r?\n/);
  const heading = lines.shift()?.trim();
  if (!heading) continue;
  const safeName = heading.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const fileName = `${String(sections.indexOf(section) + 1).padStart(2, '0')}-${safeName}.md`;
  const output = ['# ' + heading, '', lines.join('\n').trim(), ''].join('\n');
  fs.writeFileSync(path.join(outDir, fileName), output);
}

console.log(`Split PRD into ${sections.length} files in ${outDir}`);
