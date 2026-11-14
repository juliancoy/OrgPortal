# Review and validation — 2026-11-13 (America/New_York)

- `git diff --check`: PASS
- Reused `web/src/config/tenantHome.test-log.json`: all three source/test/lockfile SHA-256 values match; 3 Vitest tests passed.

- Changed-file SHA-256 fingerprints:

```json
{
  "web/src/config/tenantHome.test-log.json": "266042e2afb7e2d65be08ef9cc93262e915a3891365fc0eb728648c126f37132",
  "web/src/config/tenantHome.test.ts": "cd5e3ed0714cb5a70ddb8be93b95856ea3ea36f46e7282e0e48dabe450c8eb21",
  "web/src/config/tenantHome.ts": "38cded3e8d70138357a520ae4257848d92733d2f2b771f186e5d9a49921bce32"
}
```

## 2026-11-13 release follow-up

The pinned Docker web/routing gate ran 353 Vitest checks (351 passed, two failed) and 72 routing checks (passed). The Vite test expected a response without current fiscal metadata; its assertion now matches the published contract and all three focused checks passed. The budget test exposed a real funding-query filter that excluded appropriation rows after admitting their endpoints. The filter now includes those rows; the budget wrapper and its three Node subtests passed. Nested failure diagnostics now preserve the underlying test output. Unchanged test results are retained; affected query regressions run separately. Exact commands, commits, content fingerprints and outputs are in adjacent local logs.
