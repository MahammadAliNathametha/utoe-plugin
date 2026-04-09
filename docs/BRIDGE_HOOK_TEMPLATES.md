# UTOE Bridge Hook Templates

Use bridge mode (default) to optimize prompts without direct provider API calls.

## Claude

```bash
node /path/to/UTOE-plugin/bin/utoe.js hook --adapter=claude
```

## Codex

```bash
node /path/to/UTOE-plugin/bin/utoe.js hook --adapter=codex
```

## Cursor

```bash
node /path/to/UTOE-plugin/bin/utoe.js hook --adapter=cursor
```

## Optional env override

If your tool cannot pass `--adapter`, set:

```bash
export UTOE_ADAPTER=claude   # or codex / cursor
```
