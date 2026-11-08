// @ts-check
import { getAllCircuitBreakers } from '../lib/circuit-breaker.js';

export function getCircuitBreakers(_req, res) {
  const breakers = getAllCircuitBreakers();
  res.status(200).json({ breakers });
}
