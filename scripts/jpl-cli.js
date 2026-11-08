#!/usr/bin/env node
// @ts-check
import fs from 'node:fs';
import { compile } from '../server/src/services/jpl_compiler.js';
import { evaluate } from '../server/src/services/jpl_evaluator.js';
import { verify } from '../server/src/services/jpl_verifier.js';

const [,, command, ...args] = process.argv;

function printUsage() {
  console.log(`
JobenPay Policy Language (JPL) CLI v1.0

Usage:
  node scripts/jpl-cli.js validate <policy.json>
  node scripts/jpl-cli.js evaluate <policy.json> <input.json>
  node scripts/jpl-cli.js verify <policy.json> [--public-key <key>] [--expected-hash <hash>]
  `);
}

if (!command) {
  printUsage();
  process.exit(1);
}

try {
  if (command === 'validate' || command === 'jpl-validate') {
    const policyFile = args[0];
    if (!policyFile) {
      console.error('Error: policy.json file path is required');
      process.exit(1);
    }
    const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
    const compiled = compile(policy, { skipSignatureVerification: true });
    console.log(`[VALID] Policy ${compiled.policy_id} is well-formed JPL v${compiled.jpl_version}`);
    console.log(`Hash: ${compiled.policy_hash}`);
    console.log(`Rules count: ${compiled.rules.length}`);
  } else if (command === 'evaluate' || command === 'jpl-evaluate') {
    const policyFile = args[0];
    const inputFile = args[1];
    if (!policyFile || !inputFile) {
      console.error('Error: policy.json and input.json file paths are required');
      process.exit(1);
    }
    const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
    const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const result = evaluate(policy, input);
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'verify' || command === 'jpl-verify') {
    const policyFile = args[0];
    if (!policyFile) {
      console.error('Error: policy.json file path is required');
      process.exit(1);
    }
    let publicKey;
    let expectedHash;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--public-key' && args[i + 1]) {
        publicKey = args[i + 1];
        i++;
      } else if (args[i] === '--expected-hash' && args[i + 1]) {
        expectedHash = args[i + 1];
        i++;
      }
    }
    const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
    const result = verify(policy, { publicKey, expectedHash });
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) {
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
} catch (err) {
  console.error(`JPL Error: ${err.message}`);
  process.exit(1);
}
