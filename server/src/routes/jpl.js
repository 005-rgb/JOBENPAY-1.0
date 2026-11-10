// @ts-check
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../services/jpl_compiler.js';
import { evaluate } from '../services/jpl_evaluator.js';
import { verify } from '../services/jpl_verifier.js';

export function createJplRouter({ requireSession, requireCsrf } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };

  // 1. GET /api/v1/jpl/vectors - List all 20 open conformance vectors
  router.get('/jpl/vectors', sessionAuth, async (req, res, next) => {
    try {
      const vectorsDir = path.resolve(process.cwd(), 'public/vectors/jpl');
      if (!fs.existsSync(vectorsDir)) {
        return res.status(200).json({ ok: true, vectors: [] });
      }

      const files = fs.readdirSync(vectorsDir).filter((f) => f.endsWith('.json')).sort();
      const vectors = files.map((filename) => {
        const fullPath = path.join(vectorsDir, filename);
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const category = content.category || 'SCHEMA';
        let test_type = 'schema_validation';
        if (category === 'SEMANTICS') test_type = 'evaluation';
        else if (category === 'VERIFY') test_type = 'signature_verification';
        else if (category === 'VERSION') test_type = 'backward_compatibility';

        const expected_outcome = content.expected_result || content.expected_outcome || content.expected_validity || 'VALID';
        return {
          filename,
          test_type: content.test_type || test_type,
          expected_outcome,
          description: content.description || content.vector_name || filename,
          content,
        };
      });

      return res.status(200).json({ ok: true, vectors });
    } catch (err) {
      next(err);
    }
  });

  // 2. POST /api/v1/jpl/compile - Compile policy and compute RFC 8785 hash
  router.post('/jpl/compile', sessionAuth, csrfMiddleware, async (req, res, next) => {
    try {
      const { policy } = req.body || {};
      if (!policy) {
        return res.status(400).json({ ok: false, valid: false, message: 'Policy object is required', error: 'Policy object is required' });
      }

      const compiled = compile(policy);
      return res.status(200).json({
        ok: true,
        valid: true,
        policy_hash: compiled.policy_hash,
        rule_count: compiled.rules ? compiled.rules.length : 0,
        rules: (compiled.rules || []).map((r) => ({
          rule_id: r.rule_id,
          description: r.description,
          effect: r.outcome,
          outcome: r.outcome,
          priority: r.priority,
        })),
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        valid: false,
        message: err.message || 'Compilation failed',
        error: err.message || 'Compilation failed',
        code: err.code || 'COMPILATION_ERROR',
      });
    }
  });

  // 3. POST /api/v1/jpl/evaluate - Evaluate policy against context with explicit deny precedence
  router.post('/jpl/evaluate', sessionAuth, csrfMiddleware, async (req, res, next) => {
    try {
      const { policy, context } = req.body || {};
      if (!policy || !context) {
        return res.status(400).json({ ok: false, outcome: 'DENY', message: 'Policy and context are required', error: 'Policy and context are required' });
      }

      const start = performance.now();
      const compiled = compile(policy);
      const evalResult = evaluate(compiled, context);
      const execution_time_ms = Number((performance.now() - start).toFixed(2));

      return res.status(200).json({
        ok: true,
        ...evalResult,
        execution_time_ms,
        matched_rules: evalResult.rule_id
          ? [{ rule_id: evalResult.rule_id, effect: evalResult.outcome, priority: 1 }]
          : [],
      });
    } catch (err) {
      return res.status(200).json({
        ok: false,
        outcome: 'DENY',
        message: err.message || 'Evaluation error (fail-closed)',
        error: err.message || 'Evaluation error (fail-closed)',
        code: err.code || 'EVALUATION_ERROR',
        matched_rules: [],
        candidate_rules: [],
        execution_time_ms: 0,
      });
    }
  });

  // 4. POST /api/v1/jpl/verify - Cryptographically verify hash & signature
  router.post('/jpl/verify', sessionAuth, csrfMiddleware, async (req, res, next) => {
    try {
      const { policy, publicKey, expectedHash } = req.body || {};
      if (!policy) {
        return res.status(400).json({ ok: false, valid: false, message: 'Policy object is required', error: 'Policy object is required' });
      }

      const verification = verify(policy, { publicKey, expectedHash });
      return res.status(200).json({ ok: true, ...verification });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        valid: false,
        message: err.message || 'Verification failed',
        error: err.message || 'Verification failed',
      });
    }
  });

  return router;
}

export default createJplRouter;
