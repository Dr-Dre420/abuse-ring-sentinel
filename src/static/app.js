// Abuse-Ring Sentinel Dashboard Logic

let currentCaseId = "T57997";
let graphSimulation = null;
let currentGraphData = null;

// Tab Management
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

  if (tabName === 'investigator') {
    document.getElementById('tab-btn-investigator').classList.add('active');
    document.getElementById('view-investigator').classList.add('active');
  } else if (tabName === 'evaluation') {
    document.getElementById('tab-btn-evaluation').classList.add('active');
    document.getElementById('view-evaluation').classList.add('active');
    loadEvaluationData();
  }
}

// -----------------------------------------------------------------------------
// CASE INVESTIGATOR
// -----------------------------------------------------------------------------

async function selectDemoCase(txnId) {
  document.querySelectorAll('.demo-btn').forEach(btn => btn.classList.remove('active'));
  if (txnId === 'T57997') document.getElementById('btn-case-A').classList.add('active');
  if (txnId === 'T59899') document.getElementById('btn-case-B').classList.add('active');
  if (txnId === 'T60698') document.getElementById('btn-case-C').classList.add('active');

  await loadCase(txnId);
}

async function loadCustomCase() {
  const input = document.getElementById('custom-case-input').value.trim();
  if (!input) return;
  document.querySelectorAll('.demo-btn').forEach(btn => btn.classList.remove('active'));
  await loadCase(input);
}

async function loadCase(txnId) {
  const loadingEl = document.getElementById('case-loading');
  const contentEl = document.getElementById('case-content');

  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');

  try {
    const res = await fetch(`/case/${txnId}`);
    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || `Case ${txnId} not found.`, 'error');
      loadingEl.classList.add('hidden');
      return;
    }

    const data = await res.json();
    currentCaseId = txnId;
    renderCaseDetails(data);
    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    // Trigger canvas graph render
    if (data.graph && data.graph.nodes && data.graph.nodes.length > 0) {
      initNetworkGraph(data.graph);
    }
  } catch (e) {
    console.error("Error loading case:", e);
    showToast("Failed to connect to Sentinel API. Please ensure backend is running.", "error");
    loadingEl.classList.add('hidden');
  }
}

function renderCaseDetails(data) {
  // Case Context Strip
  document.getElementById('display-case-id').innerText = data.txn_id;
  document.getElementById('disp-ts').innerText = new Date(data.ts).toLocaleString();
  document.getElementById('disp-amount').innerText = `₹${data.amount.toFixed(2)}`;
  document.getElementById('disp-cust').innerText = data.customer_id;
  document.getElementById('disp-merch').innerText = data.merchant_id;
  document.getElementById('disp-dev').innerText = data.device_id;
  document.getElementById('disp-pm').innerText = data.pm_id;

  const scenarioDesc = data.demo_info ? data.demo_info.demo_type : data.scenario_id;
  document.getElementById('disp-scenario').innerText = scenarioDesc;

  // Ground Truth Pill
  const gtPill = document.getElementById('disp-ground-truth-pill');
  if (gtPill) {
    if (data.is_abuse_ground_truth === 1) {
      gtPill.innerText = "🚨 ABUSE GROUND TRUTH";
      gtPill.className = "status-pill pill-abuse";
    } else {
      gtPill.innerText = "✓ LEGITIMATE (NO ABUSE)";
      gtPill.className = "status-pill pill-legit";
    }
  }

  // Model C (Temporal Behavioral Control)
  const scoreC = data.model_C.risk_score;
  const threshC = data.model_C.threshold;
  document.getElementById('disp-score-c').innerText = scoreC.toFixed(4);
  const scoreCPct = document.getElementById('disp-score-c-pct');
  if (scoreCPct) scoreCPct.innerText = `${(scoreC * 100).toFixed(1)}% Risk Score`;
  document.getElementById('disp-thresh-c').innerText = threshC.toFixed(4);
  const diffC = scoreC - threshC;
  const relC = document.getElementById('disp-thresh-c-rel');
  if (relC) relC.innerText = `${diffC >= 0 ? '+' : ''}${diffC.toFixed(4)} ${diffC >= 0 ? 'above threshold' : 'below threshold'}`;
  
  const progC = document.getElementById('progress-c');
  progC.style.width = `${Math.min(100, Math.max(2, scoreC * 100))}%`;
  const markerC = document.getElementById('marker-c');
  if (markerC) markerC.style.left = `${Math.min(96, Math.max(4, threshC * 100))}%`;

  const verdictC = document.getElementById('disp-verdict-c');
  if (data.model_C.prediction === 1) {
    verdictC.innerText = "🚨 FLAGGED (ABUSE)";
    verdictC.className = "model-verdict-badge verdict-flagged";
    progC.className = "progress-bar-fill fill-warning";
  } else {
    verdictC.innerText = "✓ CLEARED (LEGITIMATE)";
    verdictC.className = "model-verdict-badge verdict-cleared";
    progC.className = "progress-bar-fill fill-success";
  }

  // Model B (Temporal + Graph Proposed)
  const scoreB = data.model_B.risk_score;
  const threshB = data.model_B.threshold;
  document.getElementById('disp-score-b').innerText = scoreB.toFixed(4);
  const scoreBPct = document.getElementById('disp-score-b-pct');
  if (scoreBPct) scoreBPct.innerText = `${(scoreB * 100).toFixed(1)}% Risk Score`;
  document.getElementById('disp-thresh-b').innerText = threshB.toFixed(4);
  const diffB = scoreB - threshB;
  const relB = document.getElementById('disp-thresh-b-rel');
  if (relB) relB.innerText = `${diffB >= 0 ? '+' : ''}${diffB.toFixed(4)} ${diffB >= 0 ? 'above threshold' : 'below threshold'}`;

  const progB = document.getElementById('progress-b');
  progB.style.width = `${Math.min(100, Math.max(2, scoreB * 100))}%`;
  const markerB = document.getElementById('marker-b');
  if (markerB) markerB.style.left = `${Math.min(96, Math.max(4, threshB * 100))}%`;

  const verdictB = document.getElementById('disp-verdict-b');
  if (data.model_B.prediction === 1) {
    verdictB.innerText = "🚨 FLAGGED (ABUSE)";
    verdictB.className = "model-verdict-badge verdict-flagged";
    progB.className = "progress-bar-fill fill-danger";
  } else {
    verdictB.innerText = "✓ CLEARED (LEGITIMATE)";
    verdictB.className = "model-verdict-badge verdict-cleared";
    progB.className = "progress-bar-fill fill-success";
  }

  // Disagreement Status Pill in Card Header
  const disPill = document.getElementById('disp-disagreement-pill');
  if (disPill) {
    if (data.delta_analysis.graph_impact === "Suppressed False Alarm") {
      disPill.innerText = "✓ FALSE ALARM SUPPRESSED";
      disPill.className = "disagreement-status-pill pill-suppressed";
    } else if (data.delta_analysis.graph_impact === "Detected Coordinated Abuse") {
      disPill.innerText = "⚠️ COORDINATED ABUSE DETECTED";
      disPill.className = "disagreement-status-pill pill-abuse-detected";
    } else {
      disPill.innerText = "DIRECTIONAL AGREEMENT";
      disPill.className = "disagreement-status-pill pill-agreement";
    }
  }

  // Relational Context Impact Callout Box
  const deltaBox = document.getElementById('disp-delta-box');
  const deltaIcon = document.getElementById('disp-delta-icon');
  const deltaHeadline = document.getElementById('disp-delta-headline');
  const deltaText = document.getElementById('disp-delta-text');

  if (data.delta_analysis.graph_impact === "Suppressed False Alarm") {
    deltaBox.className = "delta-insight-box box-suppressed";
    if (deltaIcon) deltaIcon.innerText = "⚖️";
    if (deltaHeadline) deltaHeadline.innerHTML = `LOWER RISK UNDER RELATIONAL CONTEXT &bull; RISK DELTA: ${data.delta_analysis.score_diff.toFixed(4)}`;
    deltaText.innerHTML = `<strong>Dispersed Organic Footprint:</strong> The temporal model detected an unusual burst (${scoreC.toFixed(4)} > threshold ${threshC.toFixed(4)}). Relational features showed the activity was broadly distributed (0 shared payment methods, minimal device sharing) rather than concentrated within a suspicious connected network, reducing the graph-enhanced model's risk score to ${scoreB.toFixed(4)} (< threshold ${threshB.toFixed(4)}).`;
  } else if (data.delta_analysis.graph_impact === "Detected Coordinated Abuse") {
    deltaBox.className = "delta-insight-box box-coordinated";
    if (deltaIcon) deltaIcon.innerText = "⚠️";
    if (deltaHeadline) deltaHeadline.innerHTML = `COORDINATED ABUSE INDICATED (HIGH CONFIDENCE) &bull; RISK SCORE: ${scoreB.toFixed(4)}`;
    deltaText.innerHTML = `<strong>Dense Entity Multiplexing:</strong> High temporal velocity and multi-account entity reuse mutually reinforced risk score to ${scoreB.toFixed(4)} (exceeding threshold ${threshB.toFixed(4)}). Relational graph indicates interlocked shared infrastructure.`;
  } else {
    deltaBox.className = "delta-insight-box box-agreement";
    if (deltaIcon) deltaIcon.innerText = "✓";
    if (deltaHeadline) deltaHeadline.innerHTML = `DIRECTIONAL MODEL AGREEMENT &bull; DELTA: ${data.delta_analysis.score_diff > 0 ? '+' : ''}${data.delta_analysis.score_diff.toFixed(4)}`;
    deltaText.innerHTML = `Model B and Model C are in directional agreement. Both models classify this transaction consistently relative to their respective validation operating thresholds.`;
  }

  // Defensive Recommendation & Analyst Action Log
  const recGuidance = document.getElementById('disp-rec-guidance');
  if (recGuidance) recGuidance.innerText = data.recommendation.guidance;
  recordAnalystAction(data.recommendation.action, data.ts);

  // Render Static Timeline
  renderTimeline(data.timeline);

  // Populate Split Evidence Panels (Temporal vs Relational)
  renderSplitEvidence(data);

  // Graph Subtitle
  const gSubtitle = document.getElementById('graph-subtitle');
  if (data.graph && gSubtitle) {
    gSubtitle.innerText = `Visualizing ${data.graph.nodes.length} entities and ${data.graph.edges.length} relations active in [t - 24h, t]. (Strictly causal, zero lookahead).`;
  }
}

function renderSplitEvidence(data) {
  // Benchmarks dictionary
  const benchmarks = {
    "merchant_velocity_1h": "< 5 txns",
    "burst_score": "< 0.10",
    "shared_device_customers_24h": "0 shared",
    "shared_pm_customers_24h": "0 shared",
    "two_hop_customer_count_24h": "< 3 accounts",
    "local_cluster_density_24h": "< 0.05",
    "amount_ratio_vs_customer": "0.5x - 2.0x",
    "txn_count_1h": "< 3 txns",
    "txn_count_5m": "< 2 txns",
    "time_since_last_txn": "> 3600s"
  };

  // Populate hidden compatibility tables for test assertions
  const compatTbody = document.getElementById('disp-features-tbody');
  if (compatTbody) {
    compatTbody.innerHTML = "";
    Object.keys(data.features).forEach(k => {
      const isGraph = k.includes('shared_') || k.includes('two_hop') || k.includes('density') || k.includes('degree');
      const val = typeof data.features[k] === 'number' ? data.features[k].toFixed(4) : data.features[k];
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><code>${k}</code></td>
        <td class="${isGraph ? 'feat-type-graph' : 'feat-type-temporal'}">${isGraph ? 'Graph Relational' : 'Temporal Behavioral'}</td>
        <td class="feat-val">${val}</td>
        <td style="color: var(--text-muted); font-size: 0.75rem;">${benchmarks[k] || '-'}</td>
      `;
      compatTbody.appendChild(row);
    });
  }

  const compatReasons = document.getElementById('disp-reasons-list');
  if (compatReasons) {
    compatReasons.innerHTML = "";
    data.reasons.forEach(r => {
      const el = document.createElement('div');
      el.className = `reason-item sev-${r.severity}`;
      el.innerHTML = `
        <div class="reason-header"><span class="reason-title">${escapeHtml(r.title)}</span></div>
        <div class="reason-detail">${escapeHtml(r.detail)}</div>
      `;
      compatReasons.appendChild(el);
    });
  }

  // 1. Render Temporal Evidence Table
  const tempTbody = document.getElementById('disp-temporal-tbody');
  if (tempTbody) {
    tempTbody.innerHTML = "";
    const temporalKeys = [
      { key: "merchant_velocity_1h", label: "Merchant 1h Velocity", bench: "< 5.0 txns/hr", unit: "txns/hr" },
      { key: "burst_score", label: "Burst Score (Short/Long)", bench: "< 0.10 normal", unit: "" },
      { key: "txn_count_1h", label: "Customer 1h Txns", bench: "< 3.0 txns", unit: "txns" },
      { key: "txn_count_5m", label: "Customer 5m Txns", bench: "< 2.0 txns", unit: "txns" },
      { key: "amount_ratio_vs_customer", label: "Amount / Median", bench: "0.5x - 2.0x normal", unit: "" },
      { key: "time_since_last_txn", label: "Inter-Arrival Interval", bench: "> 3600s normal", unit: "s" }
    ];

    temporalKeys.forEach(item => {
      if (item.key in data.features) {
        const rawVal = data.features[item.key];
        const valStr = typeof rawVal === 'number' ? (rawVal % 1 === 0 ? rawVal.toFixed(0) : rawVal.toFixed(2)) : rawVal;
        
        let statusTag = `<span class="status-tag tag-baseline">Baseline</span>`;
        if (item.key === "merchant_velocity_1h" && rawVal >= 20) {
          statusTag = `<span class="status-tag tag-elevated">Surge</span>`;
        } else if (item.key === "merchant_velocity_1h" && rawVal >= 5) {
          statusTag = `<span class="status-tag tag-moderate">Elevated</span>`;
        } else if (item.key === "burst_score" && rawVal >= 0.20) {
          statusTag = `<span class="status-tag tag-elevated">Spike</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="signal-code">${item.key}</span>
            <span class="signal-sublabel">${item.label}</span>
          </td>
          <td class="obs-val">${valStr} ${item.unit}</td>
          <td class="bench-val">${item.bench}</td>
          <td>${statusTag}</td>
        `;
        tempTbody.appendChild(tr);
      }
    });
  }

  // 2. Render Relational Evidence Table
  const relTbody = document.getElementById('disp-relational-tbody');
  if (relTbody) {
    relTbody.innerHTML = "";
    const relationalKeys = [
      { key: "shared_device_customers_24h", label: "Shared Device Accounts", bench: "0 shared (isolated device)", unit: "accts" },
      { key: "shared_pm_customers_24h", label: "Shared PM Accounts", bench: "0 shared (isolated card/UPI)", unit: "accts" },
      { key: "two_hop_customer_count_24h", label: "2-Hop Customer Reach", bench: "< 3 accounts normal", unit: "accts" },
      { key: "customer_degree_24h", label: "Customer Degree (24h)", bench: "1 - 3 entities normal", unit: "edges" },
      { key: "local_cluster_density_24h", label: "Local Cluster Density", bench: "< 0.05 normal (neg corr: -0.16)", unit: "" }
    ];

    relationalKeys.forEach(item => {
      if (item.key in data.features) {
        const rawVal = data.features[item.key];
        const valStr = typeof rawVal === 'number' ? (rawVal % 1 === 0 ? rawVal.toFixed(0) : rawVal.toFixed(4)) : rawVal;
        
        let statusTag = `<span class="status-tag tag-baseline">Dispersed</span>`;
        if ((item.key === "shared_device_customers_24h" || item.key === "shared_pm_customers_24h") && rawVal >= 5) {
          statusTag = `<span class="status-tag tag-elevated">Multiplexed</span>`;
        } else if ((item.key === "shared_device_customers_24h" || item.key === "shared_pm_customers_24h") && rawVal >= 1) {
          statusTag = `<span class="status-tag tag-moderate">Shared</span>`;
        } else if (item.key === "two_hop_customer_count_24h" && rawVal >= 10) {
          statusTag = `<span class="status-tag tag-elevated">Dense Cluster</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="signal-code">${item.key}</span>
            <span class="signal-sublabel">${item.label}</span>
          </td>
          <td class="obs-val">${valStr} ${item.unit}</td>
          <td class="bench-val">${item.bench}</td>
          <td>${statusTag}</td>
        `;
        relTbody.appendChild(tr);
      }
    });
  }

  // 3. Populate deterministic findings for Temporal vs Relational
  const tempReasons = document.getElementById('disp-reasons-temporal');
  const relReasons = document.getElementById('disp-reasons-relational');
  if (tempReasons) tempReasons.innerHTML = "";
  if (relReasons) relReasons.innerHTML = "";

  data.reasons.forEach(r => {
    const isRelational = r.title.includes('Device') || r.title.includes('Payment') || r.title.includes('Ring') || r.title.includes('Cluster') || r.title.includes('Network') || r.detail.includes('device') || r.detail.includes('shared');
    const targetContainer = isRelational ? relReasons : tempReasons;
    if (targetContainer) {
      const el = document.createElement('div');
      el.className = `reason-item sev-${r.severity}`;
      el.innerHTML = `
        <div class="reason-header"><span class="reason-title">${escapeHtml(r.title)}</span></div>
        <div class="reason-detail">${escapeHtml(r.detail)}</div>
      `;
      targetContainer.appendChild(el);
    }
  });

  if (tempReasons && tempReasons.children.length === 0) {
    tempReasons.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0;">No adverse temporal threshold violations observed.</div>`;
  }
  if (relReasons && relReasons.children.length === 0) {
    relReasons.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0;">No multi-account entity reuse or collusive ring patterns observed.</div>`;
  }
}

// -----------------------------------------------------------------------------
// ANALYST ACTION LOG & TIMELINE
// -----------------------------------------------------------------------------

function recordAnalystAction(actionName, optionalTime) {
  // Update button active states
  const btnMon = document.getElementById('btn-act-monitor');
  const btnRev = document.getElementById('btn-act-review');
  const btnEsc = document.getElementById('btn-act-escalate');

  if (btnMon) btnMon.className = "btn-action-select" + (actionName === "Monitor" ? " active-monitor" : "");
  if (btnRev) btnRev.className = "btn-action-select" + (actionName === "Analyst review" ? " active-review" : "");
  if (btnEsc) btnEsc.className = "btn-action-select" + (actionName.startsWith("Escalate") ? " active-escalate" : "");

  // Update Action Log fields
  const timeEl = document.getElementById('log-time');
  const caseEl = document.getElementById('log-case-id');
  const actEl = document.getElementById('log-rec-action');
  const statusEl = document.getElementById('log-status');
  const badgeEl = document.getElementById('log-status-badge');

  const now = new Date();
  const timeStr = optionalTime ? new Date(optionalTime).toLocaleTimeString() : now.toLocaleTimeString();

  if (timeEl) timeEl.innerText = timeStr;
  if (caseEl) caseEl.innerText = currentCaseId;
  if (actEl) actEl.innerText = actionName;
  if (badgeEl) badgeEl.innerText = "Recommendation Recorded";

  if (statusEl) {
    if (actionName === "Monitor") {
      statusEl.innerText = "Logged to telemetry (Continuous monitoring)";
      statusEl.className = "log-val text-muted";
    } else {
      statusEl.innerText = "Awaiting human authorization";
      statusEl.className = "log-val text-amber font-semibold";
    }
  }

  // Update recommendation badge on the card too
  const recBadge = document.getElementById('disp-rec-action');
  if (recBadge) {
    recBadge.innerText = actionName.toUpperCase();
    recBadge.className = "rec-action-badge";
    if (actionName.startsWith("Escalate")) {
      recBadge.classList.add("action-escalate");
    } else if (actionName === "Analyst review") {
      recBadge.classList.add("action-review");
    } else {
      recBadge.classList.add("action-monitor");
    }
  }
}

function renderTimeline(timelineData) {
  const container = document.getElementById('disp-investigation-timeline');
  if (!container) return;
  container.innerHTML = "";

  if (!timelineData || timelineData.length === 0) {
    container.innerHTML = "<div style='color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem;'>No pre-event timeline events available.</div>";
    return;
  }

  const icons = {
    "T - 24h": "⏱️",
    "T - 12h": "📡",
    "T - 6h": "📈",
    "T - 1h": "⚡",
    "T0": "🎯"
  };

  timelineData.forEach(node => {
    const el = document.createElement('div');
    el.className = `timeline-node status-${node.status || 'info'}`;
    const icon = icons[node.offset] || "•";
    el.innerHTML = `
      <div class="timeline-node-header">
        <span class="timeline-offset-badge">${escapeHtml(node.offset)}</span>
        <span class="timeline-timestamp">${escapeHtml(node.date)} ${escapeHtml(node.time)}</span>
      </div>
      <div class="timeline-milestone-row">
        <span class="timeline-icon">${icon}</span>
        <span class="timeline-node-title">${escapeHtml(node.title)}</span>
      </div>
      <div class="timeline-node-detail">${escapeHtml(node.detail)}</div>
    `;
    container.appendChild(el);
  });
}


// -----------------------------------------------------------------------------
// INTERACTIVE CAUSAL NETWORK GRAPH (CANVAS SPRING PHYSICS & SETTLING)
// -----------------------------------------------------------------------------

function initNetworkGraph(graphData) {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Fix resolution scaling
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1100;
  const height = 460;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // Stop previous animation loop
  if (graphSimulation) {
    cancelAnimationFrame(graphSimulation);
    graphSimulation = null;
  }

  currentGraphData = graphData;

  // Build simulation nodes
  const nodes = graphData.nodes.map((n, i) => {
    const angle = (i / graphData.nodes.length) * 2 * Math.PI;
    const dist = n.is_focal ? 0 : 130 + (i % 3) * 45;
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      is_focal: n.is_focal,
      x: (width / 2) + Math.cos(angle) * dist,
      y: (height / 2) + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      radius: n.is_focal ? 18 : (n.type === 'customer' ? 10 : 13)
    };
  });

  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  const edges = graphData.edges.map(e => ({
    source: nodeMap[e.source],
    target: nodeMap[e.target],
    relation: e.relation
  })).filter(e => e.source && e.target);

  let draggedNode = null;
  let pulsePhase = 0;
  let iteration = 0;
  const maxIterations = 120; // Settle after 120 frames to avoid continuous spinning

  // Mouse interaction
  function getMousePos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top
    };
  }

  canvas.onmousedown = (e) => {
    const pos = getMousePos(e);
    for (let n of nodes) {
      const dx = n.x - pos.x;
      const dy = n.y - pos.y;
      if (dx * dx + dy * dy < (n.radius + 10) * (n.radius + 10)) {
        draggedNode = n;
        iteration = 0; // Restart physics on drag
        if (!graphSimulation) {
          graphSimulation = requestAnimationFrame(step);
        }
        break;
      }
    }
  };

  window.onmousemove = (e) => {
    if (draggedNode) {
      const pos = getMousePos(e);
      draggedNode.x = pos.x;
      draggedNode.y = pos.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
    }
  };

  window.onmouseup = () => {
    draggedNode = null;
  };

  function step() {
    iteration++;
    pulsePhase += 0.05;

    // Apply forces
    const k = 0.04;
    const rep = 850;
    const damping = 0.78;

    // Node repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) distSq = 1;
        const dist = Math.sqrt(distSq);
        const force = rep / distSq;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (a !== draggedNode) { a.vx -= fx; a.vy -= fy; }
        if (b !== draggedNode) { b.vx += fx; b.vy += fy; }
      }
    }

    // Edge springs
    edges.forEach(e => {
      let dx = e.target.x - e.source.x;
      let dy = e.target.y - e.source.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const targetDist = 95;
      const displacement = dist - targetDist;
      const force = displacement * k;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (e.source !== draggedNode && !e.source.is_focal) {
        e.source.vx += fx;
        e.source.vy += fy;
      }
      if (e.target !== draggedNode) {
        e.target.vx -= fx;
        e.target.vy -= fy;
      }
    });

    // Center gravity
    const cx = width / 2;
    const cy = height / 2;
    nodes.forEach(n => {
      if (n === draggedNode) return;
      if (n.is_focal) {
        n.vx += (cx - n.x) * 0.08;
        n.vy += (cy - n.y) * 0.08;
      } else {
        n.vx += (cx - n.x) * 0.005;
        n.vy += (cy - n.y) * 0.005;
      }

      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;

      // Bounds
      n.x = Math.max(n.radius + 15, Math.min(width - n.radius - 15, n.x));
      n.y = Math.max(n.radius + 15, Math.min(height - n.radius - 15, n.y));
    });

    // Draw
    ctx.clearRect(0, 0, width, height);

    // Draw Edges
    edges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);

      if (e.relation.includes('shared')) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });

    // Draw Nodes
    nodes.forEach(n => {
      ctx.save();
      ctx.translate(n.x, n.y);

      if (n.is_focal) {
        // Outer aura
        const glow = 22 + Math.sin(pulsePhase) * 4;
        ctx.beginPath();
        ctx.arc(0, 0, glow, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(99, 102, 241, 0.22)";
        ctx.fill();

        // Focal circle
        ctx.beginPath();
        ctx.arc(0, 0, n.radius, 0, 2 * Math.PI);
        ctx.fillStyle = "#6366f1";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.fill();
        ctx.stroke();
      } else if (n.type === 'merchant') {
        // Square for merchant
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(-n.radius, -n.radius, n.radius * 2, n.radius * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-n.radius, -n.radius, n.radius * 2, n.radius * 2);
      } else if (n.type === 'device') {
        // Diamond for device
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#06b6d4";
        ctx.fillRect(-n.radius * 0.9, -n.radius * 0.9, n.radius * 1.8, n.radius * 1.8);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-n.radius * 0.9, -n.radius * 0.9, n.radius * 1.8, n.radius * 1.8);
        ctx.rotate(-Math.PI / 4);
      } else if (n.type === 'pm') {
        // Rounded box for PM
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.roundRect(-n.radius * 1.15, -n.radius * 0.8, n.radius * 2.3, n.radius * 1.6, 3);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Secondary customer circle
        ctx.beginPath();
        ctx.arc(0, 0, n.radius, 0, 2 * Math.PI);
        ctx.fillStyle = "#475569";
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }

      // Label with dark background pill for high readability
      ctx.font = n.is_focal ? "bold 11px Plus Jakarta Sans, sans-serif" : "9px JetBrains Mono, monospace";
      const textWidth = ctx.measureText(n.label).width;
      ctx.fillStyle = "rgba(7, 10, 18, 0.85)";
      ctx.fillRect(-textWidth / 2 - 4, n.radius + 4, textWidth + 8, 14);
      ctx.fillStyle = n.is_focal ? "#a5b4fc" : "#f1f5f9";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.label, 0, n.radius + 11);

      ctx.restore();
    });

    // Settling logic: Stop loop after maxIterations if not dragging
    if (iteration < maxIterations || draggedNode !== null) {
      graphSimulation = requestAnimationFrame(step);
    } else {
      graphSimulation = null;
    }
  }

  step();
}


// -----------------------------------------------------------------------------
// MODEL EVALUATION VIEW
// -----------------------------------------------------------------------------

let evaluationDataCached = null;

async function loadEvaluationData() {
  if (evaluationDataCached) {
    renderEvaluation(evaluationDataCached);
    return;
  }

  try {
    const res = await fetch('/evaluate');
    if (!res.ok) throw new Error("Failed to load /evaluate");
    const data = await res.json();
    evaluationDataCached = data;
    renderEvaluation(data);
  } catch (e) {
    console.error("Evaluation fetch error:", e);
    showToast("Failed to fetch evaluation metrics from /evaluate.", "error");
  }
}

function renderEvaluation(data) {
  // Aggregate Metrics
  const aggr = data.aggregate_comparison;
  document.getElementById('eval-pr-b').innerText = aggr.model_B.pr_auc.toFixed(4);
  document.getElementById('eval-pr-delta').innerText = aggr.deltas.pr_auc;
  document.getElementById('eval-prec-b').innerText = `${(aggr.model_B.precision * 100).toFixed(2)}%`;
  document.getElementById('eval-prec-delta').innerText = aggr.deltas.precision;
  document.getElementById('eval-cost-b').innerText = aggr.model_B.expected_cost.toLocaleString();
  document.getElementById('eval-cost-delta').innerText = aggr.deltas.expected_cost;

  // Seed Sensitivity Table
  const seedTbody = document.getElementById('eval-seeds-tbody');
  seedTbody.innerHTML = "";
  data.seed_sensitivity.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>Seed ${s.seed}</strong></td>
      <td>${s.model_C_pr_auc.toFixed(4)}</td>
      <td style="color: var(--accent-indigo); font-weight:700;">${s.model_B_pr_auc.toFixed(4)}</td>
      <td style="color: ${s.pr_auc_delta.startsWith('+') ? '#34d399' : '#f87171'}">${s.pr_auc_delta}</td>
      <td style="color: ${s.precision_delta.startsWith('+') ? '#34d399' : '#f87171'}">${s.precision_delta}</td>
      <td style="color: ${s.cost_delta <= 0 ? '#34d399' : '#f87171'}">${s.cost_delta <= 0 ? s.cost_delta : '+' + s.cost_delta}</td>
    `;
    seedTbody.appendChild(tr);
  });

  // PR Curve Chart
  renderPRCurve(data.pr_curves);

  // Scenario Cards List
  const scenList = document.getElementById('eval-scenarios-list');
  scenList.innerHTML = "";
  data.scenario_performance.forEach(sc => {
    const el = document.createElement('div');
    el.className = "scenario-item";
    const isHighlight = sc.scenario.includes('seasonal_burst');
    el.innerHTML = `
      <div class="scenario-header">
        <span class="scenario-name">${escapeHtml(sc.scenario)}</span>
        <span class="scenario-delta-badge ${isHighlight ? 'badge-legit' : 'badge-abuse'}">${escapeHtml(sc.delta)}</span>
      </div>
      <div class="scenario-rates">
        <span>Model C (${sc.metric_type}): <strong>${sc.model_C_rate}</strong></span>
        <span>Model B: <strong>${sc.model_B_rate}</strong></span>
      </div>
      <div class="scenario-verdict">${escapeHtml(sc.verdict)}</div>
    `;
    scenList.appendChild(el);
  });

  // Confusion Matrices
  const cmB = data.held_out_confusion_matrices.model_B;
  const cmC = data.held_out_confusion_matrices.model_C;

  document.getElementById('matrix-b-thresh').innerText = cmB.threshold.toFixed(4);
  document.getElementById('cm-b-tn').innerText = cmB.tn.toLocaleString();
  document.getElementById('cm-b-fp').innerText = cmB.fp.toLocaleString();
  document.getElementById('cm-b-fn').innerText = cmB.fn.toLocaleString();
  document.getElementById('cm-b-tp').innerText = cmB.tp.toLocaleString();
  document.getElementById('cm-b-cost').innerText = cmB.cost.toLocaleString();

  document.getElementById('matrix-c-thresh').innerText = cmC.threshold.toFixed(4);
  document.getElementById('cm-c-tn').innerText = cmC.tn.toLocaleString();
  document.getElementById('cm-c-fp').innerText = cmC.fp.toLocaleString();
  document.getElementById('cm-c-fn').innerText = cmC.fn.toLocaleString();
  document.getElementById('cm-c-tp').innerText = cmC.tp.toLocaleString();
  document.getElementById('cm-c-cost').innerText = cmC.cost.toLocaleString();

  // Feature Importance
  const impList = document.getElementById('eval-importance-list');
  impList.innerHTML = "";
  data.feature_importance.slice(0, 8).forEach(fi => {
    const isGraph = fi.type === 'graph';
    const pct = (fi.importance * 100).toFixed(1);
    const row = document.createElement('div');
    row.className = "importance-row";
    row.innerHTML = `
      <span class="feat-name ${isGraph ? 'is-graph' : ''}" title="${fi.feature}">${fi.feature} ${isGraph ? '(GRAPH)' : ''}</span>
      <div class="feat-bar-track">
        <div class="feat-bar-fill ${isGraph ? 'fill-graph' : ''}" style="width: ${pct}%"></div>
      </div>
      <span class="feat-pct">${pct}%</span>
    `;
    impList.appendChild(row);
  });
}

function renderPRCurve(prData) {
  const canvas = document.getElementById('pr-curve-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 480;
  const height = 260;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  ctx.clearRect(0, 0, width, height);

  // Draw Grid & Axes
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padTop + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();

    const val = (1 - (i / 4)).toFixed(2);
    ctx.fillStyle = "#64748b";
    ctx.font = "10px JetBrains Mono";
    ctx.textAlign = "right";
    ctx.fillText(val, padLeft - 8, y + 3);

    const x = padLeft + (plotW / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, height - padBottom);
    ctx.stroke();

    const xVal = (i / 4).toFixed(2);
    ctx.textAlign = "center";
    ctx.fillText(xVal, x, height - padBottom + 16);
  }

  // Axis Labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px Plus Jakarta Sans";
  ctx.textAlign = "center";
  ctx.fillText("Recall (True Positive Coverage)", padLeft + plotW / 2, height - 6);

  ctx.save();
  ctx.translate(14, padTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Precision", 0, 0);
  ctx.restore();

  // Helper to map recall, precision to coordinates
  function mapPoint(r, p) {
    return {
      x: padLeft + r * plotW,
      y: padTop + (1 - p) * plotH
    };
  }

  // Draw Model C Curve (Temporal Only - Slate Dashed)
  if (prData.model_C && prData.model_C.length > 0) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    prData.model_C.forEach((pt, idx) => {
      const coord = mapPoint(pt.recall, pt.precision);
      if (idx === 0) ctx.moveTo(coord.x, coord.y);
      else ctx.lineTo(coord.x, coord.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Draw Model B Curve (Graph Enhanced - Indigo Solid)
  if (prData.model_B && prData.model_B.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    prData.model_B.forEach((pt, idx) => {
      const coord = mapPoint(pt.recall, pt.precision);
      if (idx === 0) ctx.moveTo(coord.x, coord.y);
      else ctx.lineTo(coord.x, coord.y);
    });
    ctx.stroke();

    // Fill subtle gradient under curve
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, "rgba(99, 102, 241, 0.2)");
    grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }
}

// Utility
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast-banner');
  toast.innerText = msg;
  toast.className = `toast-banner ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  selectDemoCase(currentCaseId);
});
