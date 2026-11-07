// @ts-check
import fs from 'node:fs';
import path from 'node:path';

// Automatically load .env if running standalone under Node 22 before importing services
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // ignore if missing or already loaded
  }
}

const { getConformanceVectors } = await import('../server/src/services/protocol_service.js');
const { verifySarReceipt } = await import('../server/src/services/verify_service.js');

/**
 * Runs all conformance test vectors against the verify engine.
 * 
 * @param {string|null} [baseUrl=null] Optional server base URL to test over HTTP.
 * @returns {Promise<{ passed: number, failed: number, total: number, results: any[], errors: string[] }>}
 */
export async function runConformanceTests(baseUrl = null) {
  let vectors = [];
  const errors = [];

  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/protocol/conformance/vectors`);
      if (!res.ok) {
        throw new Error(`Failed to fetch vectors: HTTP ${res.status}`);
      }
      const data = await res.json();
      vectors = data.vectors || [];
    } catch (err) {
      errors.push(`Failed to fetch vectors from ${baseUrl}: ${err.message}`);
      return { passed: 0, failed: 1, total: 1, results: [], errors };
    }
  } else {
    // In-memory or direct DB fetch
    vectors = await getConformanceVectors();
  }

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const vec of vectors) {
    let sar = vec.sar_json;
    if (!sar && vec.sar_url) {
      if (baseUrl) {
        try {
          const sarRes = await fetch(vec.sar_url);
          sar = await sarRes.json();
        } catch (fetchErr) {
          failed++;
          const msg = `[${vec.vector_name}] Failed to fetch SAR from ${vec.sar_url}: ${fetchErr.message}`;
          errors.push(msg);
          results.push({ name: vec.vector_name, passed: false, error: msg });
          continue;
        }
      } else {
        // Read from local public/vectors directory
        const localPath = path.resolve(process.cwd(), 'public/vectors', `${vec.vector_name}.json`);
        if (fs.existsSync(localPath)) {
          sar = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        }
      }
    }

    let verificationResult;
    if (baseUrl) {
      try {
        const verifyRes = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/verify/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sar, mode: 'online' }),
        });
        verificationResult = await verifyRes.json();
      } catch (postErr) {
        failed++;
        const msg = `[${vec.vector_name}] HTTP POST verify failed: ${postErr.message}`;
        errors.push(msg);
        results.push({ name: vec.vector_name, passed: false, error: msg });
        continue;
      }
    } else {
      verificationResult = await verifySarReceipt(sar, { mode: 'online' });
    }

    const actualResult = verificationResult.status === 'VERIFIED' ? 'VALID' : verificationResult.status;
    const isExpected = actualResult === vec.expected_result;

    if (isExpected) {
      passed++;
      results.push({
        name: vec.vector_name,
        category: vec.category,
        expected: vec.expected_result,
        actual: actualResult,
        passed: true,
      });
    } else {
      failed++;
      const msg = `[${vec.vector_name}] Expected ${vec.expected_result}, got ${actualResult}. Checks: ${JSON.stringify(verificationResult.checks)}`;
      errors.push(msg);
      results.push({
        name: vec.vector_name,
        category: vec.category,
        expected: vec.expected_result,
        actual: actualResult,
        passed: false,
        error: msg,
      });
    }
  }

  return {
    passed,
    failed,
    total: vectors.length,
    results,
    errors,
  };
}

// Standalone CLI execution
if (process.argv[1]?.endsWith('conformance-runner.js')) {
  const baseUrl = process.env.BASE_URL || null;
  console.log(`Running JOBENPAY Conformance Test Suite (target: ${baseUrl || 'in-process'})...`);

  runConformanceTests(baseUrl)
    .then((summary) => {
      console.log(`----------------------------------------`);
      console.log(`Total Vectors : ${summary.total}`);
      console.log(`Passed        : ${summary.passed}`);
      console.log(`Failed        : ${summary.failed}`);
      console.log(`----------------------------------------`);

      if (summary.failed > 0) {
        console.error('Conformance Failures:');
        summary.errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      } else {
        console.log('All conformance test vectors PASSED (10/10)!');
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('Conformance runner crashed:', err);
      process.exit(1);
    });
}
