import fs from 'node:fs';
import path from 'node:path';

function findFiles(dir) {
  let results = [];
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, file.name);
    if (file.isDirectory()) results.push(...findFiles(full));
    else if (full.endsWith('.jsx')) results.push(full);
  }
  return results;
}

// Extract JSX opening tags of <button or <Button
function extractTags(content) {
  const tags = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    if (content[i] === '<' && (content.substring(i, i + 7) === '<button' || content.substring(i, i + 7) === '<Button')) {
      const isButton = content.substring(i, i + 7) === '<button' || content.substring(i, i + 7) === '<Button';
      const nextChar = content[i + 7];
      if (nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || nextChar === '\r' || nextChar === '>') {
        const startIndex = i;
        i += 7;
        let inQuotes = null;
        let braceDepth = 0;
        
        while (i < len) {
          const char = content[i];
          if (inQuotes) {
            if (char === '\\') {
              i += 2;
              continue;
            }
            if (char === inQuotes) {
              inQuotes = null;
            }
          } else if (char === '"' || char === "'") {
            inQuotes = char;
          } else if (char === '{') {
            braceDepth++;
          } else if (char === '}') {
            braceDepth--;
          } else if (char === '>' && braceDepth === 0) {
            // End of opening tag
            tags.push({
              tagText: content.substring(startIndex, i + 1),
              index: startIndex
            });
            break;
          }
          i++;
        }
      }
    }
    i++;
  }
  return tags;
}

const files = findFiles('web/src');
let deadButtons = [];

for (const f of files) {
  if (f.includes('primitives.jsx')) continue;
  const content = fs.readFileSync(f, 'utf8');
  const tags = extractTags(content);

  for (const { tagText, index } of tags) {
    const line = content.substring(0, index).split('\n').length;
    
    // Check attributes
    const hasOnClick = /\bonClick\s*=/.test(tagText);
    const hasTypeSubmit = /\btype\s*=\s*["']submit["']/.test(tagText);
    const hasAsChild = /\basChild\b/.test(tagText);
    const hasFormAction = /\bformAction\s*=/.test(tagText);
    
    // Check for dummy onClick like onClick={() => {}} or onClick={() => void 0}
    const hasDummyOnClick = /\bonClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(tagText);

    if ((!hasOnClick && !hasTypeSubmit && !hasAsChild && !hasFormAction) || hasDummyOnClick) {
      deadButtons.push({
        file: f,
        line,
        dummy: hasDummyOnClick,
        snippet: tagText.replace(/\s+/g, ' ').substring(0, 120)
      });
    }
  }
}

console.log('Total potential dead buttons:', deadButtons.length);
deadButtons.forEach(b => console.log(`${b.file}:${b.line} [${b.dummy ? 'DUMMY' : 'MISSING_HANDLER'}] -> ${b.snippet}`));
