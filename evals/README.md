# Evaluation harness

PatchPilot ships with a small, deterministic fixture benchmark so the
orchestration and reporting layer can be exercised without spending model
tokens.

```bash
npm run eval
```

The command calculates:

- `pass@1`: scenarios that pass verification before repair.
- `pass@2`: scenarios that pass with a single repair budget.
- acceptance-criteria coverage.
- approval-boundary coverage.
- p50 and p95 fixture latency.

The generated `results.json` is intentionally ignored by Git. These numbers
describe the included fixtures, not a claim about a particular language model
or arbitrary repository. A production evaluation should replace the fixtures
with labeled issues from the target repository and add human review.
