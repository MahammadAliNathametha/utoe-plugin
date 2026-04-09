# UTOE Test Project

This project is used to validate UTOE installation and runtime behavior.

## Manual check

From repository root:

```bash
./scripts/run-utoe-test-project-smoke.sh
```

The script verifies:
- installer integration into this test project
- Claude hook registration
- local UTOE server health
- `/suggest` and `/rewrite` endpoints
- `/ask` endpoint returns either a response or a controlled error payload
