// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

function parseExceptions(content) {
  const sections = content.split(/###\s+(EXC-\d+:?[^\n]*)/);
  const exceptions = [];

  for (let i = 1; i < sections.length; i += 2) {
    const header = sections[i];
    const body = sections[i + 1] || '';
    const idMatch = header.match(/^(EXC-\d+)/);
    const id = idMatch ? idMatch[1] : null;

    const descMatch = body.match(/- \*\*Description:\*\*\s*([^\n]+)/);
    const reasonMatch = body.match(/- \*\*Reason:\*\*\s*([^\n]+)/);
    const ownerMatch = body.match(/- \*\*Owner:\*\*\s*([^\n]+)/);
    const mitigationMatch = body.match(/- \*\*Mitigation:\*\*\s*([^\n]+)/);
    const expiryMatch = body.match(/- \*\*Expiry:\*\*\s*([^\n]+)/);

    exceptions.push({
      id,
      description: descMatch ? descMatch[1].trim() : null,
      reason: reasonMatch ? reasonMatch[1].trim() : null,
      owner: ownerMatch ? ownerMatch[1].trim() : null,
      mitigation: mitigationMatch ? mitigationMatch[1].trim() : null,
      expiry: expiryMatch ? expiryMatch[1].trim() : null,
    });
  }
  return exceptions;
}

test('exception tracking documentation suite', async (t) => {
  const filePath = path.resolve(process.cwd(), 'docs/exceptions.md');
  const content = await fs.readFile(filePath, 'utf8');
  const exceptions = parseExceptions(content);

  await t.test('test_exceptions_have_owner', () => {
    assert.ok(exceptions.length >= 2, 'Must have at least 2 tracked exceptions');
    for (const exc of exceptions) {
      assert.ok(exc.owner, `Exception ${exc.id} must define an Owner`);
      assert.ok(exc.owner.startsWith('@'), `Exception ${exc.id} owner must be a valid handle starting with @`);
    }
  });

  await t.test('test_exceptions_have_expiry', () => {
    for (const exc of exceptions) {
      assert.ok(exc.expiry, `Exception ${exc.id} must define an Expiry date`);
      assert.match(
        exc.expiry,
        /^\d{4}-\d{2}-\d{2}$/,
        `Exception ${exc.id} expiry must match YYYY-MM-DD`,
      );
    }
  });
});
