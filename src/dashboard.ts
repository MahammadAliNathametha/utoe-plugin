/**
 * UTOE Live Dashboard
 *
 * Renders the live token-savings dashboard.
 * Stats are fetched every 2 seconds via JavaScript — no page reload.
 */

import type { UTOEConfig } from './types.js';

export interface GlobalStats {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalSaved: number;
  totalCostSavedUsd: number;
  startedAt: number;
  byProvider: Record<string, number>;
  byTask: Record<string, number>;
  cacheHits?: number;
}

export function createGlobalStats(): GlobalStats {
  return {
    totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0,
    totalSaved: 0, totalCostSavedUsd: 0, startedAt: Date.now(),
    byProvider: {}, byTask: {}, cacheHits: 0,
  };
}

export function trackRequest(stats: GlobalStats, result: {
  inputTokens?: number; outputTokens?: number; savedTokens?: number;
  provider?: string; task?: string; telemetry?: { estimatedCostUsd?: number };
  savingsPct?: number;
}): void {
  stats.totalRequests++;
  stats.totalTokensIn  += result.inputTokens  ?? 0;
  stats.totalTokensOut += result.outputTokens ?? 0;
  stats.totalSaved     += result.savedTokens  ?? 0;
  stats.totalCostSavedUsd +=
    (result.telemetry?.estimatedCostUsd ?? 0) * ((result.savingsPct ?? 0) / 100);
  if (result.provider)
    stats.byProvider[result.provider] = (stats.byProvider[result.provider] ?? 0) + 1;
  if (result.task)
    stats.byTask[result.task] = (stats.byTask[result.task] ?? 0) + 1;
}

export function buildDashboardHTML(
  config: Partial<UTOEConfig> & { port?: number },
  stats?: GlobalStats
): string {
  const s     = stats ?? createGlobalStats();
  const port  = config.port ?? 8787;
  const mode  = (config.mode ?? 'bridge').toUpperCase();

  // Server-side seed — JS will take over after first paint
  const seed = JSON.stringify(s);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>UTOE Dashboard</title>
  <style>
    :root{
      --bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#e2e8f0;
      --dim:#94a3b8;--accent:#38bdf8;--green:#4ade80;--yellow:#fbbf24;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'SF Mono','Fira Code',monospace;background:var(--bg);color:var(--text);padding:1.5rem}
    h1{color:var(--accent);font-size:1.4rem;margin-bottom:.25rem}
    .meta{color:var(--dim);font-size:.75rem;margin-bottom:1.5rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center}
    .badge{background:${mode==='PROXY'?'var(--green)':'var(--yellow)'};color:#0f172a;border-radius:4px;padding:.1em .5em;font-size:.7rem;font-weight:bold}
    .live{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;margin-right:4px;animation:pulse 1.4s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem;margin-bottom:1.5rem}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem;transition:border-color .3s}
    .card.updated{border-color:var(--accent)}
    .label{color:var(--dim);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem}
    .value{font-size:1.7rem;font-weight:bold;transition:color .4s}
    .sub{font-size:.7rem;color:var(--dim);margin-top:.2rem}
    .green{color:var(--green)} .yellow{color:var(--yellow)} .accent{color:var(--accent)}
    .progress{background:var(--border);border-radius:4px;height:6px;margin-top:.5rem;overflow:hidden}
    .bar{height:6px;border-radius:4px;background:var(--green);transition:width .6s ease}
    .tables{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.5rem}
    @media(max-width:600px){.tables{grid-template-columns:1fr}}
    table{width:100%;border-collapse:collapse}
    th{color:var(--dim);font-size:.65rem;text-transform:uppercase;padding:.4rem;text-align:left;border-bottom:1px solid var(--border)}
    td{padding:.35rem .4rem;font-size:.82rem;border-bottom:1px solid var(--border)}
    td.num{text-align:right;color:var(--accent)}
    .empty{color:var(--dim)}
    .endpoints{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem}
    .endpoints h3{color:var(--accent);font-size:.85rem;margin-bottom:.6rem}
    .ep{display:flex;gap:.5rem;align-items:baseline;margin-bottom:.3rem;font-size:.78rem}
    .method{color:var(--yellow);min-width:3.5rem} .path{color:var(--green)} .desc{color:var(--dim);font-size:.72rem}
    .pill{background:var(--accent);color:var(--bg);border-radius:3px;padding:.05em .35em;font-size:.6rem;margin-left:.3rem;vertical-align:middle}
    footer{color:var(--dim);font-size:.65rem;text-align:center;margin-top:1rem}
    #last-update{color:var(--dim);font-size:.7rem}
    #connection{font-size:.7rem}
    .connected{color:var(--green)} .disconnected{color:var(--yellow)}
  </style>
</head>
<body>
  <h1>⚡ UTOE Dashboard</h1>
  <div class="meta">
    <span>Universal Token Optimization Engine v1.4.0</span>
    <span class="badge">${mode}</span>
    <span>Port ${port}</span>
    <span id="uptime">Uptime: —</span>
    <span><span class="live"></span><span id="connection" class="connected">Live</span></span>
    <span id="last-update"></span>
  </div>

  <div class="grid">
    <div class="card" id="card-saved">
      <div class="label">Tokens Saved</div>
      <div class="value green" id="val-saved">0</div>
      <div class="sub" id="sub-saved">0% average savings</div>
      <div class="progress"><div class="bar" id="bar-saved" style="width:0%"></div></div>
    </div>
    <div class="card" id="card-requests">
      <div class="label">Requests</div>
      <div class="value accent" id="val-requests">0</div>
      <div class="sub" id="sub-requests">through UTOE pipeline</div>
    </div>
    <div class="card" id="card-tokens-in">
      <div class="label">Tokens In</div>
      <div class="value" id="val-tokens-in">0</div>
      <div class="sub">total input tokens</div>
    </div>
    <div class="card" id="card-tokens-out">
      <div class="label">Tokens Out</div>
      <div class="value" id="val-tokens-out">0</div>
      <div class="sub">total output tokens</div>
    </div>
    <div class="card" id="card-cost">
      <div class="label">Est. Cost Saved</div>
      <div class="value yellow" id="val-cost">$0.0000</div>
      <div class="sub">vs unoptimized</div>
    </div>
    <div class="card" id="card-cache">
      <div class="label">Cache Hits</div>
      <div class="value green" id="val-cache">0%</div>
      <div class="sub" id="sub-cache">0 hits / 0 total</div>
    </div>
  </div>

  <div class="tables">
    <div class="card">
      <h3 style="color:var(--accent);margin-bottom:.5rem;font-size:.82rem">By Provider</h3>
      <table>
        <tr><th>Provider</th><th style="text-align:right">Requests</th></tr>
        <tbody id="provider-rows"><tr><td colspan="2" class="empty">No requests yet</td></tr></tbody>
      </table>
    </div>
    <div class="card">
      <h3 style="color:var(--accent);margin-bottom:.5rem;font-size:.82rem">By Task</h3>
      <table>
        <tr><th>Task</th><th style="text-align:right">Count</th></tr>
        <tbody id="task-rows"><tr><td colspan="2" class="empty">No requests yet</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="endpoints">
    <h3>API Endpoints</h3>
    <div class="ep"><span class="method">POST</span><span class="path">/v1/chat/completions</span><span class="pill">OpenAI</span><span class="desc"> — drop-in proxy for any OpenAI SDK (streaming supported)</span></div>
    <div class="ep"><span class="method">POST</span><span class="path">/v1/messages</span><span class="pill">Anthropic</span><span class="desc"> — transparent proxy for Claude Code / Anthropic SDK</span></div>
    <div class="ep"><span class="method">GET</span> <span class="path">/v1/models</span><span class="desc"> — list available models</span></div>
    <div class="ep"><span class="method">POST</span><span class="path">/ask</span><span class="desc"> — native UTOE: full 10-stage pipeline</span></div>
    <div class="ep"><span class="method">POST</span><span class="path">/suggest</span><span class="desc"> — get optimized prompt suggestion</span></div>
    <div class="ep"><span class="method">POST</span><span class="path">/rewrite</span><span class="desc"> — compare original vs compressed vs structured</span></div>
    <div class="ep"><span class="method">POST</span><span class="path">/compress</span><span class="desc"> — compress any text, return savings stats</span></div>
    <div class="ep"><span class="method">GET</span> <span class="path">/stats</span><span class="desc"> — raw JSON stats (used by this dashboard)</span></div>
    <div class="ep"><span class="method">GET</span> <span class="path">/health</span><span class="desc"> — health check + provider status</span></div>
  </div>

  <footer>
    UTOE is saving your tokens. &nbsp;|&nbsp;
    Claude Code: <code style="color:var(--yellow)">ANTHROPIC_BASE_URL=http://localhost:${port}</code> &nbsp;|&nbsp;
    OpenAI tools: <code style="color:var(--yellow)">OPENAI_BASE_URL=http://localhost:${port}/v1</code>
  </footer>

<script>
  // Seed initial state from server-side render
  let prev = ${seed};

  function fmt(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  function uptimeStr(startedAt) {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    if (s < 60)   return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }

  function flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 800);
  }

  function renderRows(data, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="empty">No requests yet</td></tr>';
      return;
    }
    tbody.innerHTML = entries.map(([k, v]) =>
      '<tr><td>' + k + '</td><td class="num">' + v + '</td></tr>'
    ).join('');
  }

  function applyStats(s) {
    const savingsPct = s.totalTokensIn > 0
      ? Math.round((s.totalSaved / (s.totalTokensIn + s.totalSaved)) * 100) : 0;
    const cacheHitRate = s.totalRequests > 0
      ? Math.round(((s.cacheHits || 0) / s.totalRequests) * 100) : 0;

    const updates = {
      'val-saved':      fmt(s.totalSaved),
      'val-requests':   fmt(s.totalRequests),
      'val-tokens-in':  fmt(s.totalTokensIn),
      'val-tokens-out': fmt(s.totalTokensOut),
      'val-cost':       '$' + (s.totalCostSavedUsd || 0).toFixed(4),
      'val-cache':      cacheHitRate + '%',
    };

    for (const [id, val] of Object.entries(updates)) {
      const el = document.getElementById(id);
      if (el && el.textContent !== val) {
        el.textContent = val;
        flash(id.replace('val-', 'card-'));
      }
    }

    const subSaved = document.getElementById('sub-saved');
    if (subSaved) subSaved.textContent = savingsPct + '% average savings';

    const subCache = document.getElementById('sub-cache');
    if (subCache) subCache.textContent = (s.cacheHits || 0) + ' hits / ' + s.totalRequests + ' total';

    const bar = document.getElementById('bar-saved');
    if (bar) bar.style.width = Math.min(savingsPct, 100) + '%';

    const uptime = document.getElementById('uptime');
    if (uptime) uptime.textContent = 'Uptime: ' + uptimeStr(s.startedAt);

    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate) {
      const t = new Date();
      lastUpdate.textContent = 'Updated ' + t.toLocaleTimeString();
    }

    renderRows(s.byProvider, 'provider-rows');
    renderRows(s.byTask, 'task-rows');
  }

  // Apply seed immediately
  applyStats(prev);

  // Poll /stats every 2 seconds — update DOM in place, no page reload
  async function poll() {
    try {
      const res  = await fetch('/stats');
      const data = await res.json();
      const s    = data.pipeline ?? data;
      if (s && typeof s.totalRequests === 'number') {
        applyStats(s);
        prev = s;
      }
      const conn = document.getElementById('connection');
      if (conn) { conn.textContent = 'Live'; conn.className = 'connected'; }
    } catch {
      const conn = document.getElementById('connection');
      if (conn) { conn.textContent = 'Reconnecting…'; conn.className = 'disconnected'; }
    }
    setTimeout(poll, 2000);
  }

  setTimeout(poll, 2000);
</script>
</body>
</html>`;
}
