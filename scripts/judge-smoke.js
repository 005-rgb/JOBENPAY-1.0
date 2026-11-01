import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}${payload?.error?.code ? ` (${payload.error.code})` : ''}.`);
  }
  return { response, payload };
}

export async function runJudgeSmoke({
  baseUrl = process.env.JUDGE_SMOKE_URL,
  email = process.env.JUDGE_SMOKE_EMAIL || 'judge@jobenpay.test',
  password = process.env.JUDGE_SMOKE_PASSWORD,
  real = false,
} = {}) {
  if (!baseUrl || !password) throw new Error('JUDGE_SMOKE_URL and JUDGE_SMOKE_PASSWORD are required.');
  const parsedUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('JUDGE_SMOKE_URL must use HTTP or HTTPS.');

  const { response: loginResponse, payload: login } = await requestJson(
    parsedUrl,
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!login?.ok || !login.csrfToken) throw new Error('Judge login did not return a valid session.');
  const cookie = loginResponse.headers.getSetCookie?.()
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('jp_sid='));
  if (!cookie) throw new Error('Judge login did not set a session cookie.');

  const postScenario = async (scenario, dryRun = true) => {
    const { payload } = await requestJson(parsedUrl, '/api/v1/simulator/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-csrf-token': login.csrfToken,
      },
      body: JSON.stringify({ scenario, dryRun }),
    });
    if (!Array.isArray(payload?.results) || !payload.results.length
      || payload.results.some((result) => !result.passed)) {
      throw new Error(`${scenario} simulator scenario failed.`);
    }
    if (dryRun && payload.results.some((result) => !['CANCELLED', 'REJECTED'].includes(result.status))) {
      throw new Error(`${scenario} dry run did not safely cancel its non-rejected requests.`);
    }
    return payload.results;
  };

  const legit = await postScenario('legit', !real);
  if (real && legit.some((result) => result.decision !== 'AUTO_APPROVE')) {
    throw new Error('The legitimate request was not auto-approved; no real payout was enqueued.');
  }
  const attacks = await postScenario('attack-pack', true);
  const { payload: ledger } = await requestJson(parsedUrl, '/api/v1/ledger/verify', {
    headers: { cookie },
  });
  if (!ledger?.valid) throw new Error(`Ledger verification failed${ledger?.firstBrokenSeq ? ` at sequence ${ledger.firstBrokenSeq}` : ''}.`);

  const summary = {
    mode: real ? 'real-sandbox-legit-plus-dry-attacks' : 'dry',
    legit: legit.map((result) => ({ decision: result.decision, status: result.status, reasonCodes: result.reasonCodes })),
    attacks: attacks.map((result) => ({ decision: result.decision, status: result.status, reasonCodes: result.reasonCodes })),
    ledger: { valid: ledger.valid, checkedEntries: ledger.checkedEntries },
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--real') || args.filter((arg) => arg === '--real').length > 1) {
    throw new Error('Usage: node scripts/judge-smoke.js [--real]');
  }
  await runJudgeSmoke({ real: args.includes('--real') });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`Judge smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}
