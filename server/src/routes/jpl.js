// @ts-check
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../services/jpl_compiler.js';
import { evaluate } from '../services/jpl_evaluator.js';
import { verify, verifySignature } from '../services/jpl_verifier.js';

export function createJplRouter({ requireSession } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());

  // 1. GET /api/v1/jpl/vectors - List all 20 open conformance vectors
  router.get('/jpl/vectors', sessionAuth, async (req, res, next) => {
    try {
      const vectorsDir = path.resolve(process.cwd(), 'public/vectors/jpl');
      if (!fs.existsSync(vectorsDir)) {
        return res.status(200).json({ vectors: [] });
      }

      const files = fs.readdirSync(vectorsDir).filter((f) => f.endsWith('.json')).sort();
      const vectors = files.map((filename) => {
        const fullPath = path.join(vectorsDir, filename);
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return {
          filename,
          test_type: content.test_type || 'schema_validation',
          expected_outcome: content.expected_outcome || content.expected_validity || 'UNKNOWN',
          description: content.description || filename,
          content,
        };
      });

      return res.status(200).json({ vectors });
    } catch (err) {
      next(err);
    }
  });

  // 2. POST /api/v1/jpl/compile - Compile policy and compute RFC 8785 hash
  router.post('/jpl/compile', sessionAuth, async (req, res, next) => {
    try {
      const { policy } = req.body || {};
      if (!policy) {
        return res.status(400).json({ valid: false, error: 'Policy object is required' });
      }

      const compiled = compile(policy);
      return res.status(200).json({
        valid: true,
        policy_hash: compiled.policy_hash,
        rule_count: compiled.rules ? compiled.rules.length : 0,
        rules: (compiled.rules || []).map((r) => ({
          rule_id: r.rule_id,
          description: r.description,
          effect: r.effect,
          priority: r.priority,
        })),
      });
    } catch (err) {
      return res.status(400).json({
        valid: false,
        error: err.message || 'Compilation failed',
        code: err.code || 'COMPILATION_ERROR',
      });
    }
  });

  // 3. POST /api/v1/jpl/evaluate - Evaluate policy against context with explicit deny precedence
  router.post('/jpl/evaluate', sessionAuth, async (req, res, next) => {
    try {
      const { policy, context } = req.body || {};
      if (!policy || !context) {
        return res.status(400).json({ outcome: 'DENY', error: 'Policy and context are required' });
      }

      const compiled = compile(policy);
      const evalResult = evaluate(compiled, context);
      return res.status(200).json(evalResult);
    } catch (err) {
      return res.status(200).json({
        outcome: 'DENY',
        error: err.message || 'Evaluation error (fail-closed)',
        code: err.code || 'EVALUATION_ERROR',
        matched_rules: [],
        candidate_rules: [],
        execution_time_ms: 0,
      });
    }
  });

  // 4. POST /api/v1/jpl/verify - Cryptographically verify hash & signature
  router.post('/jpl/verify', sessionAuth, async (req, res, next) => {
    try {
      const { policy } = req.body || {};
      if (!policy) {
        return res.status(400).json({ valid: false, error: 'Policy object is required' });
      }

      const verification = verify(policy);
      return res.status(200).json(verification);
    } catch (err) {
      return res.status(400).json({
        valid: false,
        error: err.message || 'Verification failed',
      });
    }
  });

  return router;
}

export default createJplRouter;
