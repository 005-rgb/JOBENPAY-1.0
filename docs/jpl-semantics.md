# JobenPay Policy Language (JPL) Semantics Specification v1.0

## 1. Overview & Principles
The JobenPay Policy Language (JPL) is a declarative, deterministic policy language designed for auditing and enforcing controls on autonomous AI agents moving funds.

### Key Tenets
1. **Model Agnostic**: Can be evaluated deterministically without LLM calls.
2. **Explicit Deny Precedence**: If ANY evaluated matching rule yields `DENY`, the final policy outcome is unconditionally `DENY`.
3. **Fail-Closed**: Any data type mismatch, unresolved field path (outside of existence operators), or execution failure resolves to `false` on condition evaluation, and if unhandled evaluates to `DENY` with reason code `EVALUATION_ERROR`.
4. **Deterministic Resolution**: The exact same policy and input will always produce the exact same outcome on any standard-compliant evaluator.

---

## 2. Condition Evaluation Table

| Operator | Field Type | Value Type | Semantics & Fail-Closed Behavior |
|---|---|---|---|
| `eq` | string / number / boolean | same | Exact equality. If `case_sensitive === false` on strings, lowercase comparison. |
| `neq` | string / number / boolean | same | `!eq` |
| `gt` | number | number | `field > value`. Non-numbers return `false`. |
| `gte` | number | number | `field >= value`. Non-numbers return `false`. |
| `lt` | number | number | `field < value`. Non-numbers return `false`. |
| `lte` | number | number | `field <= value`. Non-numbers return `false`. |
| `in` | any | array | Checks if `value.includes(field)`. If value is not array, returns `false`. |
| `not_in` | any | array | `!in`. |
| `contains` | string / array | string / any | Checks if field contains value. If field is string, substrings match. If array, element match. |
| `not_contains` | string / array | string / any | `!contains`. |
| `matches` | string | regex (string) | Tests regex pattern against string. Invalid regex syntax returns `false`. |
| `not_matches` | string | regex (string) | `!matches`. |
| `exists` | any | — | Returns `true` if field is neither `null` nor `undefined`. |
| `not_exists` | any | — | Returns `true` if field is `null` or `undefined`. |
| `between` | number | [min, max] | `min <= field && field <= max`. Non-numeric values return `false`. |
| `not_between` | number | [min, max] | `!between`. |
| `subset_of` | array | array | All elements of `field` exist in `value`. |
| `superset_of` | array | array | All elements of `value` exist in `field`. |
| `intersects` | array | array | At least one element is common between `field` and `value`. |

---

## 3. Explicit Deny Precedence
In standard security systems, safety constraints must override permit rules regardless of priority declaration.
Algorithm:
1. Scan and evaluate all matching rules in priority order.
2. If any matching rule has `outcome === 'DENY'`, return `DENY` immediately with that rule's details.
3. If no matching rule is `DENY`, return the first matching rule (lowest priority integer).
4. If no rules match, return `default_outcome`.
