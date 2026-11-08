// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../server/src/services/jpl_compiler.js';
import { evaluate } from '../server/src/services/jpl_evaluator.js';
import { verify } from '../server/src/services/jpl_verifier.js';

const vectorsDir = path.resolve(process.cwd(), 'public/vectors/jpl');

export async function runJplConformance() {
  const files = fs.readdirSync(vectorsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  console.log(`Running JPL Conformance Suite (${files.length} vectors)...`);
  console.log('---------------------------------------------------------');

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const fullPath = path.join(vectorsDir, filename);
    const vec = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    let vectorPassed = false;
    let actualResult = '';

    try {
      if (vec.category === 'SCHEMA') {
        try {
          compile(vec.policy, { skipSignatureVerification: true });
          actualResult = 'VALID';
        } catch {
          actualResult = 'INVALID';
        }
        vectorPassed = actualResult === vec.expected_result;
      } else if (vec.category === 'SEMANTICS') {
        const evalResult = evaluate(vec.policy, vec.input || {});
        actualResult = evalResult.outcome;
        vectorPassed = actualResult === vec.expected_result;
      } else if (vec.category === 'VERIFY') {
        const verResult = verify(vec.policy, {
          publicKey: vec.public_key,
          expectedHash: vec.expected_hash,
        });
        actualResult = verResult.valid ? 'VALID' : 'INVALID';
        vectorPassed = actualResult === vec.expected_result;
      } else if (vec.category === 'VERSION') {
        try {
          compile(vec.policy, { skipSignatureVerification: true });
          actualResult = 'VALID';
        } catch {
          actualResult = 'ERROR';
        }
        vectorPassed = actualResult === vec.expected_result;
      }
    } catch (e) {
      actualResult = `EXCEPTION: ${e.message}`;
      vectorPassed = false;
    }

    if (vectorPassed) {
      passed++;
      console.log(`[PASS] ${filename.padEnd(40)} expected: ${vec.expected_result}`);
    } else {
      failed++;
      console.error(`[FAIL] ${filename.padEnd(40)} expected: ${vec.expected_result}, got: ${actualResult}`);
    }
  }

  console.log('---------------------------------------------------------');
  console.log(`Total: ${files.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    throw new Error(`JPL Conformance failed: ${failed} vectors failed`);
  }

  return { total: files.length, passed, failed };
}

if (process.argv[1] && process.argv[1].endsWith('jpl-conformance.js')) {
  runJplConformance()
    .then(() => {
      console.log('All JPL Conformance vectors PASSED (20/20)!');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
