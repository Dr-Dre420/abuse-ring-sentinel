/* =============================================================================
   ABUSE-RING SENTINEL — WORKSPACE LOGIC
   Implements the behavior contracts in /DESIGN.md:
     §6  motion system + view transitions
     §8  graph visualization rules
     §9  deterministic console (no generative model in this product)
     §11 performance budget (rAF orbit, debounced resize, settle-and-stop physics)
   Backend contract is frozen; this file adapts to it.
   ============================================================================= */

'use strict';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const state = {
  activeTab: 'cases',
  currentCaseId: null,
  cases: {},            // txn_id -> case payload (cache)
  evaluation: null,
  graph3d: null,
  graph2dFrame: null,
  graphData: null,
  orbitFrame: null,
  orbiting: false,
  hovered: null,
  selected: null,   // drives dimming — only set by explicit user selection (§8.4)
  inspected: null,  // drives the inspector pane — may be set without dimming the graph
  highlightNodes: new Set(),
  highlightLinks: new Set()
};

const DEMO_IDS = ['T57997', 'T60698', 'T59899'];

const VIEW_META = {
  cases:      { eyebrow: 'Risk operations',   title: 'Overview' },
  investigate:{ eyebrow: 'Case workspace',    title: 'Investigation console' },
  evaluation: { eyebrow: 'Model assurance',   title: 'Evaluation & audit' }
};

/* §8.2/§8.3 — graph encoding, mirrored from the design tokens */
const GRAPH_STYLE = {
  // nodeVal maps to volume, so the renderer takes its cube root for the radius.
  // These values are spread wide enough that the hierarchy survives that.
  node: {
    focal:    { color: '#f0cd94', size: 120 },
    customer: { color: '#9fc4c9', size: 5 },
    device:   { color: '#3fc7e0', size: 26 },
    pm:       { color: '#4ad6a8', size: 26 },
    merchant: { color: '#e2ab63', size: 48 }
  },
  edge: {
    shared:  { color: '#ff6b6b',            width: 2.4 },
    focal:   { color: 'rgba(226,171,99,.55)', width: 1.4 },
    ambient: { color: 'rgba(120,190,190,.22)', width: 0.8 }
  },
  dimNode: 'rgba(120,150,155,0.12)',
  dimEdge: 'rgba(120,150,155,0.05)',
  background: 'rgba(0,0,0,0)'
};

/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function fmtNum(n, digits) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: digits === undefined ? 0 : digits,
    maximumFractionDigits: digits === undefined ? 2 : digits
  });
}

function fmtPct(x, digits) {
  if (typeof x !== 'number' || !isFinite(x)) return '—';
  return (x * 100).toFixed(digits === undefined ? 1 : digits) + '%';
}

function fmtSigned(x, digits) {
  if (typeof x !== 'number' || !isFinite(x)) return '—';
  const d = digits === undefined ? 4 : digits;
  return (x >= 0 ? '+' : '') + x.toFixed(d);
}

function cleanScenario(raw) {
  if (!raw) return 'Standard';
  return String(raw)
    .replace(/^S\d+_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function debounce(fn, wait) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

let toastTimer = null;
function showToast(msg, type) {
  const toast = $('toast-banner');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast-banner toast-' + (type || 'info');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
}

/* --------------------------------------------------------------------------
   §6.5 Navigation & view transitions
   -------------------------------------------------------------------------- */
function moveNavIndicator() {
  const indicator = $('nav-indicator');
  const activeBtn = $('tab-btn-' + state.activeTab);
  const nav = $('rail-nav');
  if (!indicator || !activeBtn || !nav) return;
  const offset = activeBtn.offsetTop + (activeBtn.offsetHeight - indicator.offsetHeight) / 2;
  indicator.style.transform = 'translateY(' + offset + 'px)';
  indicator.classList.add('ready');
}

function switchTab(tabName) {
  if (!VIEW_META[tabName]) return;
  const previous = state.activeTab;
  if (previous === tabName) return;

  state.activeTab = tabName;

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const isActive = btn.id === 'tab-btn-' + tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  moveNavIndicator();

  // Chrome stays anchored; only its label updates in place (§6.5)
  setText('cb-eyebrow', VIEW_META[tabName].eyebrow);
  setText('cb-title', VIEW_META[tabName].title);

  const outgoing = $('view-' + previous);
  const incoming = $('view-' + tabName);
  if (!incoming) return;

  const finish = () => {
    if (outgoing) { outgoing.classList.remove('active', 'leaving'); }
    incoming.classList.add('active');
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    onTabShown(tabName);
  };

  if (outgoing && !reducedMotion()) {
    outgoing.classList.add('leaving');
    outgoing.classList.remove('active');
    setTimeout(finish, 150); // --dur-fast
  } else {
    finish();
  }
}
window.switchTab = switchTab;

function onTabShown(tabName) {
  if (tabName === 'investigate') {
    if (!state.currentCaseId) {
      loadCase(DEMO_IDS[0]);
    } else {
      // The stage had no measurable size while the view was hidden — re-measure,
      // then re-fit on the next frame once the renderer has the new viewport.
      resizeGraph();
      requestAnimationFrame(() => setTimeout(fitGraph, 80));
    }
  } else if (tabName === 'evaluation') {
    loadEvaluation().then(renderPRCurve);
  }
  if (tabName !== 'investigate') stopOrbit();
}

/* --------------------------------------------------------------------------
   Overview
   -------------------------------------------------------------------------- */
async function loadEvaluation() {
  if (state.evaluation) return state.evaluation;
  try {
    const res = await fetch('/evaluate');
    if (!res.ok) throw new Error('evaluate ' + res.status);
    state.evaluation = await res.json();
    renderEvaluation(state.evaluation);
    renderOverviewMetrics(state.evaluation);
    return state.evaluation;
  } catch (err) {
    console.error('Failed to load evaluation data:', err);
    showToast('Could not load evaluation metrics.', 'error');
    return null;
  }
}

function renderOverviewMetrics(data) {
  const cm = (data.held_out_confusion_matrices || {}).model_B;
  if (cm) {
    const n = cm.tn + cm.fp + cm.fn + cm.tp;
    setText('ov-testset-n', 'N = ' + fmtNum(n));
  }

  // Model posture rows — real aggregate comparison (§0.1 no fabricated telemetry)
  const agg = data.aggregate_comparison || {};
  const mC = agg.model_C || {};
  const mB = agg.model_B || {};
  const rows = [
    { key: 'pr_auc',        label: 'PR-AUC',        sub: 'ranking quality',        fmt: (v) => v.toFixed(4), better: 'up' },
    { key: 'precision',     label: 'Precision',     sub: 'of flagged, truly abuse', fmt: (v) => fmtPct(v),    better: 'up' },
    { key: 'recall',        label: 'Recall',        sub: 'of abuse, caught',        fmt: (v) => fmtPct(v),    better: 'up' },
    { key: 'fpr',           label: 'False positive rate', sub: 'legitimate declined', fmt: (v) => fmtPct(v, 2), better: 'down' },
    { key: 'expected_cost', label: 'Expected cost', sub: 'validation operating point', fmt: (v) => fmtNum(v), better: 'down' }
  ];

  const host = $('posture-rows');
  if (host) {
    host.innerHTML = rows.map((row) => {
      const c = mC[row.key];
      const b = mB[row.key];
      if (typeof c !== 'number' || typeof b !== 'number') return '';
      const diff = b - c;
      const good = row.better === 'up' ? diff > 0 : diff < 0;
      const neutral = Math.abs(diff) < 1e-9;
      const deltaTxt = row.key === 'expected_cost'
        ? (diff >= 0 ? '+' : '') + fmtNum(diff)
        : (row.key === 'pr_auc' ? fmtSigned(diff, 4) : fmtSigned(diff * 100, 2) + 'pp');
      return (
        '<div class="posture-metric-row">' +
          '<span class="pm-name">' + escapeHtml(row.label) + '<small>' + escapeHtml(row.sub) + '</small></span>' +
          '<span class="pm-values"><span class="pm-c">' + row.fmt(c) + '</span>' +
          '<span class="pm-b">' + row.fmt(b) + '</span></span>' +
          '<span class="delta ' + (neutral ? 'text-muted' : good ? 'delta-good' : 'delta-bad') + '">' + deltaTxt + '</span>' +
        '</div>'
      );
    }).join('');
  }

  // Scenario behavior (real, previously unsurfaced)
  const scen = data.scenario_performance || [];
  const scenHost = $('scenario-list');
  if (scenHost) {
    scenHost.innerHTML = scen.map((s) => {
      const isFPR = String(s.metric_type).indexOf('False Positive') !== -1;
      const cRate = parseFloat(s.model_C_rate);
      const bRate = parseFloat(s.model_B_rate);
      const improved = isFPR ? bRate < cRate : bRate >= cRate;
      const name = String(s.scenario).replace(/\s*\(.*\)$/, '');
      const paren = (String(s.scenario).match(/\((.*)\)/) || [])[1] || '';
      return (
        '<div class="scenario-row">' +
          '<div><div class="scenario-name">' + escapeHtml(cleanScenario(name)) + '</div>' +
          '<div class="scenario-meta">' + escapeHtml(paren) + ' · ' + fmtNum(s.sample_count) + ' samples · ' +
          escapeHtml(isFPR ? 'false positive rate' : 'detection rate') + '</div></div>' +
          '<div class="scenario-rates">' +
            '<span class="text-muted">' + escapeHtml(s.model_C_rate) + '</span>' +
            '<span class="text-muted">→</span>' +
            '<span class="' + (improved ? 'text-low' : 'text-medium') + '">' + escapeHtml(s.model_B_rate) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  // Signal attribution
  const feats = data.feature_importance || [];
  renderAttribution('attr-list', feats.slice(0, 8));
  renderAttribution('eval-attr-list', feats);
}

function renderAttribution(hostId, feats) {
  const host = $(hostId);
  if (!host || !feats.length) return;
  const max = Math.max.apply(null, feats.map((f) => f.importance)) || 1;
  host.innerHTML = feats.map((f) => {
    const pct = (f.importance / max) * 100;
    const isGraph = f.type === 'graph';
    return (
      '<div class="attr-row">' +
        '<span class="attr-name" title="' + escapeHtml(f.feature) + '">' + escapeHtml(f.feature) + '</span>' +
        '<span class="attr-track"><span class="attr-fill ' + (isGraph ? 'graph' : 'temporal') + '" style="width:' + pct.toFixed(2) + '%"></span></span>' +
        '<span class="attr-value">' + (f.importance * 100).toFixed(2) + '%</span>' +
      '</div>'
    );
  }).join('');
}

async function renderQueue() {
  const host = $('queue-list');
  if (!host) return;

  const results = await Promise.all(DEMO_IDS.map((id) => fetchCase(id).catch(() => null)));
  const cases = results.filter(Boolean);

  if (!cases.length) {
    host.innerHTML = '<p class="reasons-empty">Case queue unavailable — the scoring service did not respond.</p>';
    return;
  }

  setText('queue-count', cases.length + ' cases · held-out split');

  host.innerHTML = cases.map((c) => {
    const bFlagged = c.model_B.prediction === 1;
    const cFlagged = c.model_C.prediction === 1;
    const disagree = bFlagged !== cFlagged;
    const level = (c.recommendation || {}).level || '';
    const riskClass = bFlagged ? (level === 'critical' ? 'risk-high' : 'risk-medium') : (disagree ? 'risk-medium' : 'risk-low');
    const chip = bFlagged
      ? '<span class="chip ' + (level === 'critical' ? 'chip-critical' : 'chip-high') + ' chip-status">High risk</span>'
      : (disagree
        ? '<span class="chip chip-medium chip-status">Model disagreement</span>'
        : '<span class="chip chip-low chip-status">Cleared</span>');

    const f = c.features || {};
    const signals = [
      { label: 'Merchant velocity', value: fmtNum(f.merchant_velocity_1h, 0) + '/h', hot: f.merchant_velocity_1h > 5 },
      { label: 'Shared device', value: fmtNum(f.shared_device_customers_24h, 0) + ' accts', hot: f.shared_device_customers_24h > 1 },
      { label: 'Model B', value: c.model_B.risk_score.toFixed(4), hot: bFlagged, cool: !bFlagged }
    ];

    return (
      '<div class="case-card ' + riskClass + '" data-txn="' + escapeHtml(c.txn_id) + '" role="button" tabindex="0" ' +
        'aria-label="Investigate case ' + escapeHtml(c.txn_id) + '">' +
        '<span class="case-rail" aria-hidden="true"></span>' +
        '<div class="case-body">' +
          '<div class="case-line-1">' +
            '<span class="case-id">' + escapeHtml(c.txn_id) + '</span>' +
            chip +
            '<span class="chip">' + escapeHtml(cleanScenario(c.scenario_id)) + '</span>' +
            (disagree ? '<span class="chip chip-gold">Graph changed the verdict</span>' : '') +
          '</div>' +
          '<p class="case-summary">' + escapeHtml((c.demo_info || {}).description || '') + '</p>' +
          '<div class="case-signals">' +
            signals.map((s) =>
              '<span class="signal">' + escapeHtml(s.label) +
              ' <b class="' + (s.hot ? 'hot' : s.cool ? 'cool' : '') + '">' + escapeHtml(s.value) + '</b></span>'
            ).join('') +
            '<span class="signal">Ground truth <b class="' + (c.is_abuse_ground_truth ? 'hot' : 'cool') + '">' +
              (c.is_abuse_ground_truth ? 'Abuse' : 'Legitimate') + '</b></span>' +
          '</div>' +
        '</div>' +
        '<span class="case-go">Investigate →</span>' +
      '</div>'
    );
  }).join('');

  host.querySelectorAll('.case-card').forEach((card) => {
    const go = () => selectCase(card.getAttribute('data-txn'));
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
}

/* --------------------------------------------------------------------------
   Case loading
   -------------------------------------------------------------------------- */
async function fetchCase(txnId) {
  if (state.cases[txnId]) return state.cases[txnId];
  const res = await fetch('/case/' + encodeURIComponent(txnId));
  if (!res.ok) {
    let detail = 'Case ' + txnId + ' not found.';
    try { detail = (await res.json()).detail || detail; } catch (e) { /* keep default */ }
    const err = new Error(detail);
    err.detail = detail;
    throw err;
  }
  const data = await res.json();
  state.cases[txnId] = data;
  return data;
}

async function selectCase(txnId) {
  if (!txnId) return;
  document.querySelectorAll('.case-card').forEach((c) => {
    c.classList.toggle('active-selected', c.getAttribute('data-txn') === txnId);
  });
  const ok = await loadCase(txnId);
  if (ok) switchTab('investigate');
}

async function loadCase(txnId) {
  const loading = $('case-loading');
  const content = $('case-content');
  if (loading) loading.classList.remove('hidden');
  if (content) content.classList.add('hidden');

  try {
    const data = await fetchCase(txnId);
    state.currentCaseId = txnId;
    renderCase(data);
    if (loading) loading.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    if (data.graph) initGraph(data.graph);
    return true;
  } catch (err) {
    if (loading) loading.classList.add('hidden');
    if (content && state.currentCaseId) content.classList.remove('hidden');
    showToast(err.detail || 'Network error loading case data.', 'error');
    return false;
  }
}

function renderCase(data) {
  const mC = data.model_C || {};
  const mB = data.model_B || {};
  const cFlagged = mC.prediction === 1;
  const bFlagged = mB.prediction === 1;
  const disagree = cFlagged !== bFlagged;

  setText('nav-case-label', 'Investigate · ' + data.txn_id);
  setText('display-case-id', data.txn_id);
  setText('scenario-pill', cleanScenario(data.scenario_id));

  const gt = $('gt-pill');
  if (gt) {
    gt.textContent = data.is_abuse_ground_truth === 1 ? 'Abuse ground truth' : 'Legitimate';
    gt.className = 'status-pill' + (data.is_abuse_ground_truth === 1 ? '' : ' pill-legit');
  }

  const dis = $('disagreement-pill');
  if (dis) {
    dis.textContent = disagree ? 'Model disagreement' : 'Model agreement';
    dis.className = 'disagreement-status-pill' + (disagree ? ' pill-disagreement' : '');
  }

  setText('e-cust', data.customer_id || '—');
  setText('e-merch', data.merchant_id || '—');
  setText('e-dev', data.device_id || '—');
  setText('e-pm', data.pm_id || '—');
  setText('e-amount', '₹' + fmtNum(data.amount, 2));
  setText('e-ts', data.ts ? data.ts.replace('T', ' ') : '—');

  renderVerdict('c', mC, cFlagged);
  renderVerdict('b', mB, bFlagged);
  renderDelta(data, cFlagged, bFlagged, disagree);
  renderEvidence(data);
  renderSynthesis(data, disagree);
  renderTimeline(data.timeline || []);
  renderRecommendation(data.recommendation || {});

  // Causal window provenance (§8.6) — real API fields
  const g = data.graph || {};
  if (g.window_start && g.window_end) {
    setText('stage-window', String(g.window_start).replace('T', ' ') + '  →  ' + String(g.window_end).replace('T', ' '));
  }
  setText('stage-window-meta',
    fmtNum(g.total_window_txns || 0) + ' transactions observed · ' +
    (g.nodes ? g.nodes.length : 0) + ' entities · zero lookahead');

  const out = $('console-output');
  if (out) { out.classList.add('hidden'); out.innerHTML = ''; }
}

function renderVerdict(key, model, flagged) {
  const score = typeof model.risk_score === 'number' ? model.risk_score : 0;
  const thresh = typeof model.threshold === 'number' ? model.threshold : 0;
  const diff = score - thresh;

  setText('vm-' + key + '-score', score.toFixed(4));
  setText('vm-' + key + '-thresh', thresh.toFixed(4));

  const rel = $('vm-' + key + '-rel');
  if (rel) {
    rel.textContent = fmtSigned(diff, 4) + (diff >= 0 ? ' above' : ' below');
    rel.className = diff >= 0 ? 'text-high' : 'text-low';
  }

  const badge = $('vm-' + key + '-verdict');
  if (badge) {
    badge.textContent = flagged ? 'Flagged' : 'Cleared';
    badge.className = 'model-verdict-badge' + (flagged ? '' : ' badge-cleared');
  }

  const meter = $('vm-' + key + '-meter');
  if (meter) {
    meter.style.width = Math.min(100, Math.max(0, score * 100)) + '%';
    meter.className = 'progress-bar-fill ' + (flagged ? 'fill-danger' : 'fill-success');
  }

  const marker = $('vm-' + key + '-marker');
  if (marker) marker.style.left = Math.min(100, Math.max(0, thresh * 100)) + '%';
}

function renderDelta(data, cFlagged, bFlagged, disagree) {
  const box = $('delta-box');
  const head = $('delta-headline');
  const text = $('delta-text');
  if (!box || !head || !text) return;

  const da = data.delta_analysis || {};
  const diff = typeof da.score_diff === 'number'
    ? da.score_diff
    : (data.model_B.risk_score - data.model_C.risk_score);

  let variant = '';
  if (disagree && cFlagged && !bFlagged) variant = ' delta-suppressed';
  else if (cFlagged && bFlagged) variant = ' delta-reinforced';
  box.className = 'delta-insight-box' + variant;

  // Prefer the API's own deterministic wording over frontend prose (§9)
  head.textContent = (da.graph_impact || 'Relational context impact') + ' · Δ ' + fmtSigned(diff, 4);
  text.innerHTML = escapeHtml(da.explanation || 'Graph context did not materially change the assessment.');
}

function renderEvidence(data) {
  const feats = data.features || {};

  const temporalKeys = [
    { key: 'merchant_velocity_1h',     label: 'Merchant 1h velocity',   bench: '< 5.0 /h' },
    { key: 'burst_score',              label: 'Burst score (5m / 1h)',  bench: '< 0.10' },
    { key: 'txn_count_1h',             label: 'Customer 1h count',      bench: '< 3' },
    { key: 'txn_count_5m',             label: 'Customer 5m count',      bench: '< 2' },
    { key: 'unique_merchants_1h',      label: 'Unique merchants 1h',    bench: '1 – 2' },
    { key: 'amount_ratio_vs_customer', label: 'Amount / median ratio',  bench: '0.5× – 2.0×' },
    { key: 'time_since_last_txn',      label: 'Time since last txn',    bench: 'seconds' }
  ];

  const relationalKeys = [
    { key: 'shared_device_customers_24h', label: 'Accounts on same device', bench: '0 (isolated)' },
    { key: 'shared_pm_customers_24h',     label: 'Accounts on same method', bench: '0 (isolated)' },
    { key: 'two_hop_customer_count_24h',  label: '2-hop customer reach',    bench: '< 3' },
    { key: 'customer_degree_24h',         label: 'Customer degree 24h',     bench: '1 – 3' },
    { key: 'local_cluster_density_24h',   label: 'Local cluster density',   bench: '< 0.05' }
  ];

  const renderRows = (tbodyId, keys) => {
    const tbody = $(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = keys.filter((k) => k.key in feats).map((k) => {
      const raw = feats[k.key];
      const val = typeof raw === 'number'
        ? (Number.isInteger(raw) ? raw.toString() : raw.toFixed(raw < 1 ? 4 : 2))
        : String(raw);
      return (
        '<tr><td><span class="signal-code">' + escapeHtml(k.key) + '</span>' +
        '<span class="signal-sublabel">' + escapeHtml(k.label) + '</span></td>' +
        '<td class="obs-val">' + escapeHtml(val) + '</td>' +
        '<td class="bench-val">' + escapeHtml(k.bench) + '</td></tr>'
      );
    }).join('');
  };

  renderRows('tbody-temporal', temporalKeys);
  renderRows('tbody-relational', relationalKeys);

  // Deterministic reasons, routed by their own content
  const tempHost = $('reasons-temporal');
  const relHost = $('reasons-relational');
  if (tempHost) tempHost.innerHTML = '';
  if (relHost) relHost.innerHTML = '';

  const RELATIONAL_CODES = /DEVICE|PM_SHARING|RING|CLUSTER|NETWORK|DEGREE|HOP|GRAPH|DISPERS/i;

  (data.reasons || []).forEach((r) => {
    const isRelational = RELATIONAL_CODES.test(r.code || '') || RELATIONAL_CODES.test(r.title || '');
    const host = isRelational ? relHost : tempHost;
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'reason-item severity-' + escapeHtml(r.severity || 'info');
    el.innerHTML = '<span class="reason-title">' + escapeHtml(r.title) + '</span>' +
                   '<span class="reason-detail">' + escapeHtml(r.detail) + '</span>';
    host.appendChild(el);
  });

  [[tempHost, 'No elevated behavioral signals in this window.'],
   [relHost, 'No shared-infrastructure signals — the footprint is dispersed.']].forEach(([host, msg]) => {
    if (host && !host.children.length) {
      host.innerHTML = '<p class="reasons-empty">' + msg + '</p>';
    }
  });
}

function renderSynthesis(data, disagree) {
  const badge = $('interp-badge');
  if (badge) {
    badge.textContent = disagree ? 'Model disagreement' : 'Model agreement';
    badge.style.color = disagree ? 'var(--risk-medium)' : 'var(--accent-teal)';
    badge.style.borderColor = disagree ? 'rgba(229,169,81,.32)' : 'rgba(69,214,205,.3)';
    badge.style.background = disagree ? 'rgba(229,169,81,.1)' : 'rgba(69,214,205,.1)';
  }

  const da = data.delta_analysis || {};
  const f = data.features || {};
  const sharedDev = f.shared_device_customers_24h || 0;
  const sharedPm = f.shared_pm_customers_24h || 0;

  setText('interp-text', disagree
    ? 'Behavioral velocity triggered the temporal model, but relational evidence changed the graph-enhanced assessment. '
      + 'Within the causal window the account shares infrastructure with ' + fmtNum(sharedDev, 0) + ' account(s) by device and '
      + fmtNum(sharedPm, 0) + ' by payment method — a dispersed footprint rather than a coordinated ring.'
    : 'Both models reach the same decision, so graph context did not change the outcome. Device sharing spans '
      + fmtNum(sharedDev, 0) + ' account(s) and payment-method sharing spans ' + fmtNum(sharedPm, 0) + ' within the causal window.');

  setText('interp-quote', da.explanation || '—');
}

function renderTimeline(events) {
  const host = $('timeline');
  if (!host) return;
  if (!events.length) {
    host.innerHTML = '<p class="reasons-empty">No pre-event timeline available for this window.</p>';
    return;
  }
  host.innerHTML = events.map((n) => (
    '<div class="timeline-node status-' + escapeHtml(n.status || 'info') + '">' +
      '<span class="timeline-offset">' + escapeHtml(n.offset) + '</span>' +
      '<span class="timeline-time">' + escapeHtml((n.date || '') + ' ' + (n.time || '')) + '</span>' +
      '<div class="timeline-title">' + escapeHtml(n.title) + '</div>' +
      '<p class="timeline-detail">' + escapeHtml(n.detail) + '</p>' +
    '</div>'
  )).join('');
}

function renderRecommendation(rec) {
  const action = rec.action || 'Analyst review';
  applyDisposition(action, rec.level);
  setText('rec-guidance', rec.guidance || '—');
}

function applyDisposition(action, level) {
  const lower = action.toLowerCase();
  const isEscalate = lower.indexOf('escalate') !== -1;
  const isMonitor = lower.indexOf('monitor') !== -1;

  const badge = $('rec-action');
  if (badge) {
    badge.textContent = action;
    badge.className = 'rec-action-badge ' +
      (isEscalate ? 'action-escalate' : isMonitor ? 'action-monitor' : 'action-review');
  }

  document.querySelectorAll('.btn-action-select').forEach((b) => b.classList.remove('active'));
  const target = $(isEscalate ? 'btn-act-escalate' : isMonitor ? 'btn-act-monitor' : 'btn-act-review');
  if (target) target.classList.add('active');

  setText('log-time', new Date().toLocaleTimeString());
  setText('log-case-id', state.currentCaseId || '—');
  setText('log-rec-action', action);

  const status = $('log-status');
  if (status) {
    status.textContent = isMonitor ? 'Logged to telemetry — continuous monitoring' : 'Awaiting human authorization';
    status.className = isMonitor ? 'text-muted' : 'text-medium font-semibold';
  }
}

/* --------------------------------------------------------------------------
   §8 Graph experience
   -------------------------------------------------------------------------- */
function nodeStyle(node) {
  if (node.is_focal) return GRAPH_STYLE.node.focal;
  return GRAPH_STYLE.node[node.type] || GRAPH_STYLE.node.customer;
}

function initGraph(graphData) {
  state.graphData = graphData;
  const container = $('graph-canvas');
  const canvas2d = $('network-canvas');
  if (!container) return;

  stopOrbit();

  if (typeof ForceGraph3D !== 'function') {
    init2DFallback(graphData);
    return;
  }

  try {
    container.innerHTML = '';
    container.classList.remove('hidden');
    if (canvas2d) canvas2d.classList.add('hidden');

    const nodeMap = {};
    const nodes = graphData.nodes.map((n) => {
      const obj = {
        id: n.id, label: n.label || n.id, type: n.type, is_focal: !!n.is_focal,
        degree: 0, connectedNodes: new Set(), connectedCustomers: new Set()
      };
      nodeMap[n.id] = obj;
      return obj;
    });

    const links = graphData.edges.map((e) => {
      const s = nodeMap[e.source];
      const t = nodeMap[e.target];
      if (s && t) {
        s.degree++; t.degree++;
        s.connectedNodes.add(t.id); t.connectedNodes.add(s.id);
        if (s.type === 'customer') t.connectedCustomers.add(s.id);
        if (t.type === 'customer') s.connectedCustomers.add(t.id);
      }
      return {
        source: e.source,
        target: e.target,
        relation: e.relation || 'transacts_with',
        isShared: String(e.relation || '').indexOf('shared') !== -1,
        touchesFocal: (s && s.is_focal) || (t && t.is_focal)
      };
    }).filter((e) => nodeMap[e.source] && nodeMap[e.target]);

    state.hovered = null;
    state.selected = null;
    state.highlightNodes.clear();
    state.highlightLinks.clear();

    const width = container.clientWidth || 1000;
    const height = container.clientHeight || 560;
    const noMotion = reducedMotion();

    const graph = ForceGraph3D()(container)
      .width(width)
      .height(height)
      .backgroundColor(GRAPH_STYLE.background)
      .showNavInfo(false)
      .graphData({ nodes: nodes, links: links })
      .nodeId('id')
      .nodeRelSize(4)
      .nodeResolution(20)
      .nodeOpacity(0.92)
      .nodeColor((n) => {
        const base = nodeStyle(n).color;
        if (!activeNode()) return base;
        return state.highlightNodes.has(n.id) ? base : GRAPH_STYLE.dimNode;
      })
      .nodeVal((n) => {
        const base = nodeStyle(n).size;
        return (activeNode() && state.highlightNodes.has(n.id)) ? base * 1.25 : base;
      })
      .nodeLabel((n) => '<span style="font:500 12px Inter,sans-serif;color:#e6f1f1">' +
        escapeHtml(String(n.type).toUpperCase()) + ' · ' + escapeHtml(n.label) + '</span>')
      .linkColor((l) => {
        if (activeNode()) {
          if (!state.highlightLinks.has(l)) return GRAPH_STYLE.dimEdge;
          return l.isShared ? GRAPH_STYLE.edge.shared.color : GRAPH_STYLE.node.focal.color;
        }
        if (l.isShared) return GRAPH_STYLE.edge.shared.color;
        return l.touchesFocal ? GRAPH_STYLE.edge.focal.color : GRAPH_STYLE.edge.ambient.color;
      })
      .linkWidth((l) => {
        if (activeNode() && state.highlightLinks.has(l)) return l.isShared ? 3.2 : 2;
        if (l.isShared) return GRAPH_STYLE.edge.shared.width;
        return l.touchesFocal ? GRAPH_STYLE.edge.focal.width : GRAPH_STYLE.edge.ambient.width;
      })
      .linkCurvature((l) => (l.isShared ? 0.18 : 0))
      // §8.3 particles only on risk-carrying edges, and never under reduced motion
      .linkDirectionalParticles((l) => (noMotion ? 0 : (l.isShared ? 2 : 0)))
      .linkDirectionalParticleWidth(1.6)
      .linkDirectionalParticleSpeed(0.005)
      .d3VelocityDecay(0.35)
      .cooldownTicks(90)               // §11 settle and stop
      .onEngineStop(() => fitGraph())
      .onNodeHover((node) => {
        state.hovered = node || null;
        refreshHighlight();
        updateInspector(node || state.selected || state.inspected);
        container.style.cursor = node ? 'pointer' : 'grab';
      })
      .onNodeClick((node) => {
        if (!node) return;
        state.selected = node;
        state.inspected = node;
        refreshHighlight();
        updateInspector(node);
        flyTo(node);
      })
      .onBackgroundClick(() => {
        state.selected = null;
        refreshHighlight();
        updateInspector(state.inspected);
      });

    state.graph3d = graph;

    // Seed the inspector with the focal entity, but leave the graph undimmed
    // at rest — dimming is a response to interaction, not a default state (§8.4).
    const focal = nodes.find((n) => n.is_focal) || nodes[0];
    state.inspected = focal;
    updateInspector(focal);

    // Fit once the layout has spread; a fit fired while nodes are still
    // collapsed at the origin leaves the camera far too close.
    setTimeout(() => fitGraph(), 900);
  } catch (err) {
    console.warn('3D graph unavailable, using 2D fallback:', err);
    init2DFallback(graphData);
  }
}

function activeNode() {
  return state.hovered || state.selected;
}

/* §8.4 — highlight the entity and its incident edges, dim everything else */
function refreshHighlight() {
  state.highlightNodes.clear();
  state.highlightLinks.clear();

  const node = activeNode();
  if (node && state.graph3d) {
    state.highlightNodes.add(node.id);
    state.graph3d.graphData().links.forEach((link) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (s === node.id || t === node.id) {
        state.highlightLinks.add(link);
        state.highlightNodes.add(s);
        state.highlightNodes.add(t);
      }
    });
  }

  if (state.graph3d) {
    state.graph3d
      .nodeColor(state.graph3d.nodeColor())
      .nodeVal(state.graph3d.nodeVal())
      .linkColor(state.graph3d.linkColor())
      .linkWidth(state.graph3d.linkWidth());
  }
}

function flyTo(node, distance) {
  if (!state.graph3d) return;
  const dist = distance || 90;
  const hyp = Math.hypot(node.x || 1, node.y || 1, node.z || 1) || 1;
  const ratio = 1 + dist / hyp;
  state.graph3d.cameraPosition(
    { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
    node,
    reducedMotion() ? 0 : 700   // --dur-graph
  );
}

function updateInspector(node) {
  if (!node) return;
  const typeNames = {
    customer: node.is_focal ? 'Focal investigated customer' : 'Shared customer account',
    device: 'Shared physical device',
    pm: 'Payment instrument',
    merchant: 'Merchant checkout account'
  };

  setText('insp-type', typeNames[node.type] || String(node.type || '').toUpperCase());
  setText('insp-id', node.label || node.id);

  let count = 0;
  if (node.type === 'customer') {
    count = node.connectedNodes ? node.connectedNodes.size : (node.degree || 0);
  } else {
    count = (node.connectedCustomers && node.connectedCustomers.size)
      ? node.connectedCustomers.size
      : (node.connectedNodes ? node.connectedNodes.size : (node.degree || 0));
  }
  setText('insp-connections', String(count));

  let relation = 'Bipartite neighbor';
  let why = '2-hop reachable account active in the 24-hour causal topology.';

  if (node.is_focal) {
    relation = 'Investigated focal entity';
    why = 'The account evaluated at arrival timestamp t. It connects directly to ' + count +
          ' infrastructure and merchant node' + (count === 1 ? '' : 's') + ' inside the causal window.';
  } else if (node.type === 'device') {
    relation = count > 1 ? 'Multiplexed hardware' : 'Dedicated hardware';
    why = count > 1
      ? 'Recycled across ' + count + ' distinct customer accounts in the window — the strongest single indicator of a coordinated ring.'
      : 'Operated by the investigated customer alone during the window, which argues against coordination.';
  } else if (node.type === 'pm') {
    relation = count > 1 ? 'Multiplexed instrument' : 'Dedicated instrument';
    why = count > 1
      ? 'Linked to ' + count + ' distinct customer accounts — shared funding is a ring signature.'
      : 'No observed cross-account reuse, consistent with an organic buyer.';
  } else if (node.type === 'merchant') {
    relation = 'Target merchant';
    why = 'Checkout endpoint with ' + count + ' customer transaction' + (count === 1 ? '' : 's') +
          ' recorded in the causal window.';
  }

  setText('insp-relation', relation);
  setText('insp-why', why);
}

/* Camera controls */
function focusFocal() {
  if (!state.graph3d) return;
  const nodes = state.graph3d.graphData().nodes;
  const focal = nodes.find((n) => n.is_focal) || nodes[0];
  if (!focal) return;
  state.selected = focal;
  state.inspected = focal;
  refreshHighlight();
  updateInspector(focal);
  flyTo(focal, 95);
}

/* The library's zoomToFit frames the bounding sphere very conservatively — it
   leaves the network at roughly a third of the stage. We size the camera from
   the layout's own bounding sphere instead, so the graph reliably dominates
   the stage as the centerpiece it is (§8.1). */
function fitGraph(duration) {
  const g = state.graph3d;
  if (!g) return;
  const nodes = g.graphData().nodes;
  if (!nodes.length) return;

  let cx = 0, cy = 0, cz = 0;
  nodes.forEach((n) => { cx += n.x || 0; cy += n.y || 0; cz += n.z || 0; });
  cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;

  let radius = 0;
  nodes.forEach((n) => {
    radius = Math.max(radius, Math.hypot((n.x || 0) - cx, (n.y || 0) - cy, (n.z || 0) - cz));
  });
  // The bounding sphere is built from node centres; the outermost spheres have
  // their own radius on top of that, so leave real headroom or they clip.
  radius = Math.max(radius, 30) * 1.32;

  // Fitting a sphere (not a flat plane) in perspective: the camera has to clear
  // the sphere's tangent, which is sin(halfFov) — using tan() here clips the
  // near face of the cluster.
  const halfFovY = (75 * Math.PI / 180) / 2;   // three.js default perspective
  const width = g.width() || 1;
  const height = g.height() || 1;
  const halfFovX = Math.atan(Math.tan(halfFovY) * (width / height));
  const dist = Math.max(radius / Math.sin(halfFovY), radius / Math.sin(halfFovX));

  const cam = g.cameraPosition();
  let dx = cam.x - cx, dy = cam.y - cy, dz = cam.z - cz;
  let len = Math.hypot(dx, dy, dz);
  if (!len || !isFinite(len)) { dx = 0; dy = 0; dz = 1; len = 1; }

  g.cameraPosition(
    { x: cx + (dx / len) * dist, y: cy + (dy / len) * dist, z: cz + (dz / len) * dist },
    { x: cx, y: cy, z: cz },
    reducedMotion() ? 0 : (duration === undefined ? 500 : duration)
  );
}

function resetGraph() {
  state.selected = null;
  state.hovered = null;
  refreshHighlight();
  updateInspector(state.inspected);
  fitGraph(600);
}

/* §11 — single rAF loop, cancellable; never setInterval */
function toggleOrbit() {
  if (state.orbiting) { stopOrbit(); return; }
  if (!state.graph3d || reducedMotion()) return;

  state.orbiting = true;
  const btn = $('btn-graph-orbit');
  if (btn) btn.classList.add('tool-active');
  setText('orbit-label', 'Pause');

  const cam = state.graph3d.cameraPosition();
  let angle = Math.atan2(cam.x || 0, cam.z || 1);
  const radius = Math.hypot(cam.x || 0, cam.z || 260) || 260;

  const step = () => {
    if (!state.orbiting || !state.graph3d) return;
    angle += 0.0022;
    state.graph3d.cameraPosition({ x: radius * Math.sin(angle), z: radius * Math.cos(angle) });
    state.orbitFrame = requestAnimationFrame(step);
  };
  state.orbitFrame = requestAnimationFrame(step);
}

function stopOrbit() {
  state.orbiting = false;
  if (state.orbitFrame) { cancelAnimationFrame(state.orbitFrame); state.orbitFrame = null; }
  const btn = $('btn-graph-orbit');
  if (btn) btn.classList.remove('tool-active');
  setText('orbit-label', 'Orbit');
}

function resizeGraph() {
  const container = $('graph-canvas');
  if (state.graph3d && container && container.clientWidth) {
    state.graph3d.width(container.clientWidth).height(container.clientHeight || 560);
  }
}

/* §8.7 — 2D fallback follows the same encoding rules */
function init2DFallback(graphData) {
  const container = $('graph-canvas');
  const canvas = $('network-canvas');
  if (!canvas) return;
  if (container) { container.innerHTML = ''; container.classList.add('hidden'); }
  canvas.classList.remove('hidden');

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1000;
  const height = rect.height || 520;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (state.graph2dFrame) { cancelAnimationFrame(state.graph2dFrame); state.graph2dFrame = null; }

  const nodes = graphData.nodes.map((n, i) => {
    const angle = (i / graphData.nodes.length) * 2 * Math.PI;
    const dist = n.is_focal ? 0 : 130 + (i % 3) * 45;
    const style = nodeStyle(n);
    return {
      id: n.id, label: n.label || n.id, type: n.type, is_focal: !!n.is_focal,
      x: width / 2 + Math.cos(angle) * dist,
      y: height / 2 + Math.sin(angle) * dist,
      vx: 0, vy: 0,
      // match the 3D renderer's volume→radius mapping so both look alike (§8.7)
      radius: Math.max(5, Math.cbrt(style.size) * 3.6),
      color: style.color,
      degree: 0, connectedNodes: new Set(), connectedCustomers: new Set()
    };
  });

  const map = {};
  nodes.forEach((n) => { map[n.id] = n; });

  const edges = graphData.edges.map((e) => {
    const s = map[e.source];
    const t = map[e.target];
    if (s && t) {
      s.degree++; t.degree++;
      s.connectedNodes.add(t.id); t.connectedNodes.add(s.id);
      if (s.type === 'customer') t.connectedCustomers.add(s.id);
      if (t.type === 'customer') s.connectedCustomers.add(t.id);
    }
    return { source: s, target: t, isShared: String(e.relation || '').indexOf('shared') !== -1 };
  }).filter((e) => e.source && e.target);

  updateInspector(nodes.find((n) => n.is_focal) || nodes[0]);

  let frame = 0;
  const maxFrames = reducedMotion() ? 1 : 110;

  const step = () => {
    frame++;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy || 1;
        const d = Math.sqrt(d2);
        const f = 820 / d2;
        a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
        b.vx += (dx / d) * f; b.vy += (dy / d) * f;
      }
    }
    edges.forEach((e) => {
      const dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 95) * 0.04;
      if (!e.source.is_focal) { e.source.vx += (dx / d) * f; e.source.vy += (dy / d) * f; }
      e.target.vx -= (dx / d) * f; e.target.vy -= (dy / d) * f;
    });
    nodes.forEach((n) => {
      n.vx += (width / 2 - n.x) * (n.is_focal ? 0.08 : 0.005);
      n.vy += (height / 2 - n.y) * (n.is_focal ? 0.08 : 0.005);
      n.vx *= 0.78; n.vy *= 0.78;
      n.x += n.vx; n.y += n.vy;
    });

    ctx.clearRect(0, 0, width, height);

    edges.forEach((e) => {
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);
      if (e.isShared) {
        ctx.strokeStyle = GRAPH_STYLE.edge.shared.color;
        ctx.lineWidth = GRAPH_STYLE.edge.shared.width;
      } else if (e.source.is_focal || e.target.is_focal) {
        ctx.strokeStyle = GRAPH_STYLE.edge.focal.color;
        ctx.lineWidth = GRAPH_STYLE.edge.focal.width;
      } else {
        ctx.strokeStyle = GRAPH_STYLE.edge.ambient.color;
        ctx.lineWidth = GRAPH_STYLE.edge.ambient.width;
      }
      ctx.stroke();
    });

    nodes.forEach((n) => {
      if (n.is_focal) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 7, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(240,205,148,0.14)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(230,241,241,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + n.radius + 12);
    });

    if (frame < maxFrames) state.graph2dFrame = requestAnimationFrame(step);
    else state.graph2dFrame = null;
  };

  step();
}

/* --------------------------------------------------------------------------
   §9 Deterministic console — composes API fields, never paraphrases them
   -------------------------------------------------------------------------- */
function runConsole(raw) {
  const out = $('console-output');
  const input = (raw || '').trim();
  if (!out || !input) return;

  const data = state.cases[state.currentCaseId];
  const q = input.toLowerCase();

  // A bare transaction id navigates
  if (/^t\d+$/i.test(input)) { selectCase(input.toUpperCase()); return; }
  if (q === 'evaluation' || q === 'metrics') { switchTab('evaluation'); return; }
  if (q === 'queue' || q === 'overview') { switchTab('cases'); return; }

  if (!data) {
    out.innerHTML = '<p>Load a case first.</p>';
    out.classList.remove('hidden');
    return;
  }

  const f = data.features || {};
  const g = data.graph || {};
  const da = data.delta_analysis || {};
  let html = '';

  if (q.indexOf('help') === 0) {
    html = '<h4>Deterministic commands</h4><ul>' +
      '<li><b>summary</b> — verdicts, delta, and recommended action</li>' +
      '<li><b>why</b> — the deterministic reason codes behind the score</li>' +
      '<li><b>graph</b> — causal-window topology facts</li>' +
      '<li><b>timeline</b> — pre-event trajectory</li>' +
      '<li><b>action</b> — recommendation guidance verbatim</li>' +
      '<li><b>T60698</b> — jump to a transaction · <b>evaluation</b> — model metrics</li>' +
      '</ul>';
  } else if (q.indexOf('why') === 0 || q.indexOf('flag') !== -1 || q.indexOf('reason') !== -1) {
    html = '<h4>Reason codes · ' + escapeHtml(data.txn_id) + '</h4><ul>' +
      (data.reasons || []).map((r) =>
        '<li><b>' + escapeHtml(r.title) + '</b> — ' + escapeHtml(r.detail) +
        ' <span class="mono text-muted">[' + escapeHtml(r.code) + ' · ' + escapeHtml(r.severity) + ']</span></li>'
      ).join('') + '</ul>';
  } else if (q.indexOf('graph') === 0 || q.indexOf('topolog') !== -1 || q.indexOf('network') !== -1) {
    html = '<h4>Causal 24h topology · ' + escapeHtml(data.txn_id) + '</h4><ul>' +
      '<li>Window <span class="mono">' + escapeHtml(String(g.window_start || '')) + '</span> → <span class="mono">' + escapeHtml(String(g.window_end || '')) + '</span></li>' +
      '<li><b class="mono">' + fmtNum(g.total_window_txns || 0) + '</b> transactions · <b class="mono">' + (g.nodes || []).length + '</b> entities · <b class="mono">' + (g.edges || []).length + '</b> relations</li>' +
      '<li>Accounts sharing this device: <b class="mono">' + fmtNum(f.shared_device_customers_24h, 0) + '</b> · sharing this payment method: <b class="mono">' + fmtNum(f.shared_pm_customers_24h, 0) + '</b></li>' +
      '<li>2-hop customer reach: <b class="mono">' + fmtNum(f.two_hop_customer_count_24h, 0) + '</b> · local cluster density: <b class="mono">' + fmtNum(f.local_cluster_density_24h, 4) + '</b></li>' +
      '</ul>';
  } else if (q.indexOf('timeline') === 0 || q.indexOf('trajector') !== -1) {
    html = '<h4>Pre-event trajectory</h4><ul>' +
      (data.timeline || []).map((t) =>
        '<li><b class="mono">' + escapeHtml(t.offset) + '</b> ' + escapeHtml(t.title) + ' — ' + escapeHtml(t.detail) + '</li>'
      ).join('') + '</ul>';
  } else if (q.indexOf('action') === 0 || q.indexOf('recommend') !== -1) {
    const rec = data.recommendation || {};
    html = '<h4>Recommended action</h4><ul>' +
      '<li><b>' + escapeHtml(rec.action || '') + '</b> · severity <span class="mono">' + escapeHtml(rec.level || '') + '</span> · reversible: <b>' + (rec.reversible ? 'yes' : 'no') + '</b></li>' +
      '<li>' + escapeHtml(rec.guidance || '') + '</li></ul>';
  } else {
    // default: summary
    html = '<h4>Case summary · ' + escapeHtml(data.txn_id) + '</h4><ul>' +
      '<li>Model C (temporal): <b class="mono">' + data.model_C.risk_score.toFixed(4) + '</b> vs threshold <span class="mono">' + data.model_C.threshold.toFixed(4) + '</span> → <b>' + (data.model_C.prediction ? 'flagged' : 'cleared') + '</b></li>' +
      '<li>Model B (temporal + graph): <b class="mono">' + data.model_B.risk_score.toFixed(4) + '</b> vs threshold <span class="mono">' + data.model_B.threshold.toFixed(4) + '</span> → <b>' + (data.model_B.prediction ? 'flagged' : 'cleared') + '</b></li>' +
      '<li>Graph impact: <b>' + escapeHtml(da.graph_impact || '—') + '</b> (Δ <span class="mono">' + fmtSigned(da.score_diff || 0, 4) + '</span>) — ' + escapeHtml(da.explanation || '') + '</li>' +
      '<li>Ground truth: <b>' + (data.is_abuse_ground_truth ? 'abuse' : 'legitimate') + '</b> · recommended: <b>' + escapeHtml((data.recommendation || {}).action || '') + '</b></li>' +
      '</ul>';
  }

  out.innerHTML = html + '<p class="text-muted" style="margin-top:var(--space-3);font-size:var(--fs-micro)">' +
    'Composed from model output and deterministic reason codes. No language model is involved.</p>';
  out.classList.remove('hidden');
}

/* --------------------------------------------------------------------------
   Evaluation view
   -------------------------------------------------------------------------- */
function renderEvaluation(data) {
  const agg = data.aggregate_comparison || {};
  const mC = agg.model_C || {};
  const mB = agg.model_B || {};

  const metrics = [
    { label: 'PR-AUC', b: mB.pr_auc, c: mC.pr_auc, fmt: (v) => v.toFixed(4), better: 'up' },
    { label: 'Precision', b: mB.precision, c: mC.precision, fmt: (v) => fmtPct(v), better: 'up' },
    { label: 'Recall', b: mB.recall, c: mC.recall, fmt: (v) => fmtPct(v), better: 'up' },
    { label: 'False positive rate', b: mB.fpr, c: mC.fpr, fmt: (v) => fmtPct(v, 2), better: 'down' }
  ];

  const host = $('eval-metrics');
  if (host) {
    host.innerHTML = metrics.map((m) => {
      if (typeof m.b !== 'number' || typeof m.c !== 'number') return '';
      const diff = m.b - m.c;
      const good = m.better === 'up' ? diff > 0 : diff < 0;
      const deltaTxt = m.label === 'PR-AUC' ? fmtSigned(diff, 4) : fmtSigned(diff * 100, 2) + 'pp';
      return '<div class="eval-metric"><div class="metric">' +
        '<span class="metric-label">' + escapeHtml(m.label) + '</span>' +
        '<span class="metric-value metric-value-lg">' + m.fmt(m.b) + '</span>' +
        '<span class="metric-note">Model C ' + m.fmt(m.c) + ' · <span class="delta ' +
        (good ? 'delta-good' : 'delta-bad') + '">' + deltaTxt + '</span></span>' +
        '</div></div>';
    }).join('');
  }

  const cmC = (data.held_out_confusion_matrices || {}).model_C || {};
  const cmB = (data.held_out_confusion_matrices || {}).model_B || {};
  ['tn', 'fp', 'fn', 'tp'].forEach((k) => {
    setText('mat-c-' + k, fmtNum(cmC[k]));
    setText('mat-b-' + k, fmtNum(cmB[k]));
  });
  setText('mat-c-thresh', typeof cmC.threshold === 'number' ? cmC.threshold.toFixed(4) : '—');
  setText('mat-b-thresh', typeof cmB.threshold === 'number' ? cmB.threshold.toFixed(4) : '—');
  setText('mat-c-cost', fmtNum(cmC.cost));
  setText('mat-b-cost', fmtNum(cmB.cost));
  setText('ev-thresholds', 'thresholds C ' + (cmC.threshold || 0).toFixed(4) + ' · B ' + (cmB.threshold || 0).toFixed(4));

  // Seed sensitivity — includes the seed where graph context lost
  const seeds = data.seed_sensitivity || [];
  const seedBody = $('seed-tbody');
  if (seedBody) {
    const n = seeds.length || 1;
    const mean = {
      c: seeds.reduce((s, x) => s + x.model_C_pr_auc, 0) / n,
      b: seeds.reduce((s, x) => s + x.model_B_pr_auc, 0) / n,
      prec: seeds.reduce((s, x) => s + parseFloat(x.precision_delta), 0) / n,
      cost: seeds.reduce((s, x) => s + x.cost_delta, 0) / n
    };
    const cell = (txt, positiveIsGood) => {
      const v = parseFloat(txt);
      const good = positiveIsGood ? v > 0 : v < 0;
      return '<td class="num ' + (v === 0 ? 'text-muted' : good ? 'text-low' : 'text-high') + '">' + escapeHtml(txt) + '</td>';
    };
    seedBody.innerHTML = seeds.map((s) => {
      const regressed = parseFloat(s.pr_auc_delta) < 0;
      return '<tr' + (regressed ? ' class="row-flagged"' : '') + '>' +
        '<td>Seed ' + escapeHtml(String(s.seed)) + (regressed ? ' <span class="chip chip-medium chip-status">regression</span>' : '') + '</td>' +
        '<td class="num">' + s.model_C_pr_auc.toFixed(4) + '</td>' +
        '<td class="num">' + s.model_B_pr_auc.toFixed(4) + '</td>' +
        cell(s.pr_auc_delta, true) +
        cell(s.precision_delta, true) +
        '<td class="num ' + (s.cost_delta < 0 ? 'text-low' : 'text-high') + '">' + (s.cost_delta >= 0 ? '+' : '') + fmtNum(s.cost_delta) + '</td>' +
        '</tr>';
    }).join('') +
      '<tr class="row-emphasis"><td>Mean</td>' +
      '<td class="num">' + mean.c.toFixed(4) + '</td>' +
      '<td class="num">' + mean.b.toFixed(4) + '</td>' +
      '<td class="num ' + (mean.b - mean.c >= 0 ? 'text-low' : 'text-high') + '">' + fmtSigned(mean.b - mean.c, 4) + '</td>' +
      '<td class="num ' + (mean.prec >= 0 ? 'text-low' : 'text-high') + '">' + fmtSigned(mean.prec, 4) + '</td>' +
      '<td class="num ' + (mean.cost < 0 ? 'text-low' : 'text-high') + '">' + (mean.cost >= 0 ? '+' : '') + fmtNum(Math.round(mean.cost)) + '</td></tr>';
  }

  // Scenario table
  const scenBody = $('eval-scenario-tbody');
  if (scenBody) {
    scenBody.innerHTML = (data.scenario_performance || []).map((s) => {
      const isFPR = String(s.metric_type).indexOf('False Positive') !== -1;
      const cRate = parseFloat(s.model_C_rate);
      const bRate = parseFloat(s.model_B_rate);
      const improved = isFPR ? bRate < cRate : bRate >= cRate;
      return '<tr>' +
        '<td>' + escapeHtml(cleanScenario(String(s.scenario).replace(/\s*\(.*\)$/, ''))) + '</td>' +
        '<td class="num">' + fmtNum(s.sample_count) + '</td>' +
        '<td>' + escapeHtml(isFPR ? 'False positive rate' : 'Detection rate') + '</td>' +
        '<td class="num text-muted">' + escapeHtml(s.model_C_rate) + '</td>' +
        '<td class="num ' + (improved ? 'text-low' : 'text-medium') + '">' + escapeHtml(s.model_B_rate) + '</td>' +
        '<td>' + escapeHtml(s.verdict) + '</td>' +
        '</tr>';
    }).join('');
  }
}

/* §16 — chart in the same visual language, restrained and readable */
function renderPRCurve() {
  const data = state.evaluation;
  const canvas = $('pr-curve-canvas');
  if (!canvas || !data) return;

  const frame = canvas.parentElement;
  const rect = frame.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(280, Math.floor(rect.width - 32));
  const h = 290;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const padL = 46, padR = 16, padT = 16, padB = 38;
  const plotW = Math.max(40, w - padL - padR);
  const plotH = Math.max(40, h - padT - padB);

  // grid
  ctx.strokeStyle = 'rgba(150,205,205,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padT + (plotH * i) / 5;
    const x = padL + (plotW * i) / 5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
  }

  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#4a5c61';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    ctx.fillText((1 - i * 0.2).toFixed(1), padL - 8, padT + (plotH * i) / 5);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= 5; i++) {
    ctx.fillText((i * 0.2).toFixed(1), padL + (plotW * i) / 5, h - padB + 8);
  }

  ctx.fillStyle = '#6b8085';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.fillText('Recall', padL + plotW / 2, h - padB + 22);
  ctx.save();
  ctx.translate(12, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Precision', 0, 0);
  ctx.restore();

  const draw = (pts, color, width, dashed) => {
    if (!pts || !pts.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = padL + Number(pt.recall) * plotW;
      const y = (h - padB) - Number(pt.precision) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  };

  const curves = data.pr_curves || {};
  draw(curves.model_C, '#6b8085', 1.6, true);
  draw(curves.model_B, '#45d6cd', 2.2, false);

  // Legend sits low-left: the curves hug the top of the plot, so anything
  // placed up there collides with the data.
  const lx = padL + 14, ly = h - padB - 34;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#45d6cd'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke();
  ctx.fillStyle = '#e6f1f1'; ctx.font = '500 11px Inter, sans-serif';
  ctx.fillText('Model B · temporal + graph', lx + 24, ly);

  ctx.save();
  ctx.strokeStyle = '#6b8085'; ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(lx, ly + 16); ctx.lineTo(lx + 18, ly + 16); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#9fb3b6';
  ctx.fillText('Model C · temporal only', lx + 24, ly + 16);
}

/* --------------------------------------------------------------------------
   Wiring
   -------------------------------------------------------------------------- */
function bindEvents() {
  ['cases', 'investigate', 'evaluation'].forEach((name) => {
    const btn = $('tab-btn-' + name);
    if (btn) btn.addEventListener('click', () => switchTab(name));
  });

  const back = $('btn-back');
  if (back) back.addEventListener('click', () => switchTab('cases'));

  // Rail collapse — persisted
  const toggle = $('rail-toggle');
  const shell = $('app-shell');
  if (toggle && shell) {
    if (localStorage.getItem('ars.rail') === 'collapsed') shell.classList.add('rail-collapsed');
    toggle.addEventListener('click', () => {
      const collapsed = shell.classList.toggle('rail-collapsed');
      toggle.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
      try { localStorage.setItem('ars.rail', collapsed ? 'collapsed' : 'expanded'); } catch (e) { /* private mode */ }
      setTimeout(moveNavIndicator, 260);
    });
  }

  // Lookup
  const lookupInput = $('cb-lookup-input');
  const lookupBtn = $('btn-lookup');
  const doLookup = () => {
    const value = (lookupInput.value || '').trim().toUpperCase();
    if (value) selectCase(value);
  };
  if (lookupBtn) lookupBtn.addEventListener('click', doLookup);
  if (lookupInput) lookupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });

  // Graph controls
  const controls = [
    ['btn-graph-focus', focusFocal],
    ['btn-graph-fit', () => fitGraph()],   // not `fitGraph` — the click event would land in `duration`
    ['btn-graph-reset', resetGraph],
    ['btn-graph-orbit', toggleOrbit]
  ];
  controls.forEach(([id, fn]) => {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
  });

  if (reducedMotion()) {
    const orbitBtn = $('btn-graph-orbit');
    if (orbitBtn) {
      orbitBtn.disabled = true;
      orbitBtn.title = 'Auto-orbit disabled — reduced motion is enabled in your system settings';
    }
  }

  // Disposition
  [['btn-act-monitor', 'Monitor'],
   ['btn-act-review', 'Analyst review'],
   ['btn-act-escalate', 'Escalate for analyst authorization']
  ].forEach(([id, action]) => {
    const el = $(id);
    if (el) el.addEventListener('click', () => applyDisposition(action));
  });

  // Console
  const consoleInput = $('console-input');
  const consoleRun = $('console-run');
  if (consoleRun) consoleRun.addEventListener('click', () => runConsole(consoleInput.value));
  if (consoleInput) {
    consoleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { runConsole(consoleInput.value); }
      if (e.key === 'Escape') { consoleInput.value = ''; const o = $('console-output'); if (o) o.classList.add('hidden'); }
    });
  }

  const onResize = debounce(() => {
    moveNavIndicator();
    if (state.activeTab === 'investigate') resizeGraph();
    if (state.activeTab === 'evaluation') renderPRCurve();
  }, 140);
  window.addEventListener('resize', onResize);
}

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  moveNavIndicator();
  setText('cb-eyebrow', VIEW_META.cases.eyebrow);
  setText('cb-title', VIEW_META.cases.title);

  renderQueue();
  loadEvaluation();
});
