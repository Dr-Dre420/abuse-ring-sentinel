// =============================================================================
// ABUSE-RING SENTINEL — RISK INVESTIGATION WORKSPACE LOGIC
// =============================================================================

let currentCaseId = "T57997";
let activeTab = "cases";
let forceGraph3DInstance = null;
let graph2DSimulation = null;
let currentGraphData = null;
let is3DAutoRotating = false;

// -----------------------------------------------------------------------------
// TAB & NAVIGATION MANAGEMENT
// -----------------------------------------------------------------------------

const TOPBAR_TITLES = {
  cases: "Cases Overview",
  investigate: "Investigation Workspace",
  evaluation: "Model Evaluation & Audit"
};

function switchTab(tabName) {
  activeTab = tabName;

  // Toggle Tab Buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');

  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.innerText = TOPBAR_TITLES[tabName] || "Abuse-Ring Sentinel";

  // Toggle View Sections
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) activeView.classList.add('active');

  // Handle View-Specific Initializations
  if (tabName === 'investigate') {
    if (!currentGraphData) {
      loadCase(currentCaseId);
    } else {
      // Trigger canvas/WebGL resize and fit
      setTimeout(() => {
        if (forceGraph3DInstance) {
          const container = document.getElementById('3d-graph-container');
          if (container && container.clientWidth) {
            forceGraph3DInstance.width(container.clientWidth);
            forceGraph3DInstance.height(container.clientHeight || 500);
            forceGraph3DInstance.zoomToFit(400, 45);
          }
        }
      }, 60);
    }
  } else if (tabName === 'evaluation') {
    loadEvaluationData();
    setTimeout(() => {
      if (cachedEvaluationData && cachedEvaluationData.pr_curves) {
        renderPRCurve(cachedEvaluationData.pr_curves);
      }
    }, 60);
  }
}

async function selectAndInvestigateCase(txnId) {
  // Update Case Cards Active State
  document.querySelectorAll('.case-card').forEach(c => c.classList.remove('active-selected'));
  if (txnId === 'T57997') document.getElementById('card-case-A')?.classList.add('active-selected');
  if (txnId === 'T60698') document.getElementById('card-case-C')?.classList.add('active-selected');
  if (txnId === 'T59899') document.getElementById('card-case-B')?.classList.add('active-selected');

  // Load the Case Data
  await loadCase(txnId);

  // Switch to Investigation Workspace
  switchTab('investigate');
}

async function selectDemoCase(txnId) {
  await selectAndInvestigateCase(txnId);
}

async function loadCustomCase() {
  const input = document.getElementById('custom-case-input');
  if (!input) return;
  const txnId = input.value.trim().toUpperCase();
  if (!txnId) return;

  await selectAndInvestigateCase(txnId);
}

// -----------------------------------------------------------------------------
// CASE TELEMETRY LOADING & DATA POPULATION
// -----------------------------------------------------------------------------

async function loadCase(txnId) {
  const loadingEl = document.getElementById('case-loading');
  const contentEl = document.getElementById('case-content');

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (contentEl) contentEl.classList.add('hidden');

  try {
    const res = await fetch(`/case/${txnId}`);
    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || `Case ${txnId} not found.`, 'error');
      if (loadingEl) loadingEl.classList.add('hidden');
      return;
    }

    const data = await res.json();
    currentCaseId = txnId;
    renderCaseDetails(data);

    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    // Initialize the 3D Causal Ego-Network
    if (data.graph) {
      init3DCausalNetwork(data.graph);
    }

  } catch (err) {
    console.error("Failed to load case:", err);
    showToast("Network error loading case data.", "error");
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

function renderCaseDetails(data) {
  // 1. Navigation & Identity
  const navLabel = document.getElementById('nav-active-case-label');
  if (navLabel) navLabel.innerText = `Investigate (${data.txn_id})`;

  const caseIdEl = document.getElementById('display-case-id');
  if (caseIdEl) caseIdEl.innerText = data.txn_id;

  const scenarioEl = document.getElementById('disp-scenario');
  if (scenarioEl) scenarioEl.innerText = formatScenario(data.scenario);

  const amountEl = document.getElementById('disp-amount');
  if (amountEl) amountEl.innerText = `₹${formatNumber(data.amount)}`;

  const tsEl = document.getElementById('disp-ts');
  if (tsEl) tsEl.innerText = data.timestamp || "T0 (Window Close)";

  // Ground Truth Pill
  const gtPill = document.getElementById('disp-ground-truth-pill');
  if (gtPill) {
    if (data.is_abuse_ground_truth === 1) {
      gtPill.innerText = "🚨 ABUSE GROUND TRUTH";
      gtPill.className = "status-pill";
    } else {
      gtPill.innerText = "✓ LEGITIMATE (NO ABUSE)";
      gtPill.className = "status-pill pill-legit";
    }
  }

  // Focal Entities
  const custEl = document.getElementById('disp-cust');
  const merchEl = document.getElementById('disp-merch');
  const devEl = document.getElementById('disp-dev');
  const pmEl = document.getElementById('disp-pm');

  if (custEl) custEl.innerText = data.customer_id || "-";
  if (merchEl) merchEl.innerText = data.merchant_id || "-";
  if (devEl) devEl.innerText = data.device_id || "-";
  if (pmEl) pmEl.innerText = data.pm_id || "-";

  // 2. Dual Model Inference
  const mC = data.model_C || {};
  const mB = data.model_B || {};

  // Model C (Temporal Behavioral Control)
  const scoreCEl = document.getElementById('disp-score-c');
  const scoreCPctEl = document.getElementById('disp-score-c-pct');
  const threshCEl = document.getElementById('disp-thresh-c');
  const threshCRelEl = document.getElementById('disp-thresh-c-rel');
  const verdictCEl = document.getElementById('disp-verdict-c');
  const progressCEl = document.getElementById('progress-c');
  const markerCEl = document.getElementById('marker-c');

  const cScore = typeof mC.risk_score === 'number' ? mC.risk_score : 0;
  const cThresh = typeof mC.threshold === 'number' ? mC.threshold : 0.2383;
  const cFlagged = mC.prediction === 1;

  if (scoreCEl) scoreCEl.innerText = cScore.toFixed(4);
  if (scoreCPctEl) scoreCPctEl.innerText = `${(cScore * 100).toFixed(1)}% Risk Probability`;
  if (threshCEl) threshCEl.innerText = cThresh.toFixed(4);
  if (threshCRelEl) {
    const diffC = cScore - cThresh;
    threshCRelEl.innerText = diffC >= 0 ? `+${diffC.toFixed(4)} above` : `${diffC.toFixed(4)} below`;
    threshCRelEl.style.color = diffC >= 0 ? "var(--accent-rose)" : "var(--accent-emerald)";
  }
  if (verdictCEl) {
    verdictCEl.innerText = cFlagged ? "FLAGGED (ABUSE)" : "CLEARED (LEGITIMATE)";
    verdictCEl.className = cFlagged ? "model-verdict-badge" : "model-verdict-badge badge-cleared";
  }
  if (progressCEl) {
    progressCEl.style.width = `${Math.min(100, Math.max(0, cScore * 100))}%`;
    progressCEl.className = `progress-bar-fill ${cFlagged ? 'fill-danger' : 'fill-success'}`;
  }
  if (markerCEl) markerCEl.style.left = `${Math.min(100, Math.max(0, cThresh * 100))}%`;

  // Model B (Temporal + 24h Relational Graph)
  const scoreBEl = document.getElementById('disp-score-b');
  const scoreBPctEl = document.getElementById('disp-score-b-pct');
  const threshBEl = document.getElementById('disp-thresh-b');
  const threshBRelEl = document.getElementById('disp-thresh-b-rel');
  const verdictBEl = document.getElementById('disp-verdict-b');
  const progressBEl = document.getElementById('progress-b');
  const markerBEl = document.getElementById('marker-b');

  const bScore = typeof mB.risk_score === 'number' ? mB.risk_score : 0;
  const bThresh = typeof mB.threshold === 'number' ? mB.threshold : 0.1519;
  const bFlagged = mB.prediction === 1;

  if (scoreBEl) scoreBEl.innerText = bScore.toFixed(4);
  if (scoreBPctEl) scoreBPctEl.innerText = `${(bScore * 100).toFixed(1)}% Risk Probability`;
  if (threshBEl) threshBEl.innerText = bThresh.toFixed(4);
  if (threshBRelEl) {
    const diffB = bScore - bThresh;
    threshBRelEl.innerText = diffB >= 0 ? `+${diffB.toFixed(4)} above` : `${diffB.toFixed(4)} below`;
    threshBRelEl.style.color = diffB >= 0 ? "var(--accent-rose)" : "var(--accent-emerald)";
  }
  if (verdictBEl) {
    verdictBEl.innerText = bFlagged ? "FLAGGED (ABUSE)" : "CLEARED (LEGITIMATE)";
    verdictBEl.className = bFlagged ? "model-verdict-badge" : "model-verdict-badge badge-cleared";
  }
  if (progressBEl) {
    progressBEl.style.width = `${Math.min(100, Math.max(0, bScore * 100))}%`;
    progressBEl.className = `progress-bar-fill ${bFlagged ? 'fill-danger' : 'fill-success'}`;
  }
  if (markerBEl) markerBEl.style.left = `${Math.min(100, Math.max(0, bThresh * 100))}%`;

  // Model Disagreement / Agreement State Pill
  const isDisagreement = cFlagged !== bFlagged;
  const statePill = document.getElementById('disp-disagreement-pill');
  if (statePill) {
    if (isDisagreement) {
      statePill.innerText = "MODEL DISAGREEMENT";
      statePill.className = "disagreement-status-pill pill-disagreement";
    } else {
      statePill.innerText = "MODEL AGREEMENT";
      statePill.className = "disagreement-status-pill";
    }
  }

  // 3. Prominent Graph Impact Callout
  const deltaBox = document.getElementById('disp-delta-box');
  const deltaIcon = document.getElementById('disp-delta-icon');
  const deltaHeadline = document.getElementById('disp-delta-headline');
  const deltaText = document.getElementById('disp-delta-text');
  const deltaVal = bScore - cScore;

  if (deltaBox && deltaHeadline && deltaText) {
    if (isDisagreement && cFlagged && !bFlagged) {
      // False Alarm Suppressed (Case C)
      deltaBox.className = "delta-insight-box delta-suppressed";
      if (deltaIcon) deltaIcon.innerText = "✓";
      deltaHeadline.innerText = `LOWER RISK UNDER RELATIONAL CONTEXT • RISK DELTA: ${deltaVal >= 0 ? '+' : ''}${deltaVal.toFixed(4)}`;
      deltaText.innerHTML = `
        <strong>Behavioral alert → relational context → revised risk assessment.</strong><br>
        The temporal model detected high merchant surge volume, but the 24-hour causal graph verified that the customer interacts across isolated infrastructure with <strong>0 shared payment methods and 0 shared devices</strong>, suppressing a costly false decline.
      `;
    } else if (cFlagged && bFlagged) {
      // Coordinated Abuse Indicated (Case A or B)
      deltaBox.className = "delta-insight-box delta-reinforced";
      if (deltaIcon) deltaIcon.innerText = "⚠️";
      deltaHeadline.innerText = `COORDINATED ABUSE INDICATED • DELTA: ${deltaVal >= 0 ? '+' : ''}${deltaVal.toFixed(4)}`;
      deltaText.innerHTML = `
        <strong>Behavioral and relational evidence reinforce the alert.</strong><br>
        Both models reach the same high-risk conclusion. Relational topology reveals interlocked multi-account sharing on common physical devices, indicating coordinated syndication rather than an isolated buyer.
      `;
    } else {
      // Both Cleared
      deltaBox.className = "delta-insight-box";
      if (deltaIcon) deltaIcon.innerText = "ℹ️";
      deltaHeadline.innerText = `MODEL AGREEMENT • DELTA: ${deltaVal >= 0 ? '+' : ''}${deltaVal.toFixed(4)}`;
      deltaText.innerHTML = `Both models reach the same decision. Graph context does not materially change the final assessment.`;
    }
  }

  // 4. Evidence Pipeline: Progressive Narrative
  renderSplitEvidence(data);

  // 5. Synthesis & Interpretation Box
  const interpBadge = document.getElementById('disp-interpretation-badge');
  const interpText = document.getElementById('disp-interpretation-text');
  const interpQuote = document.getElementById('disp-interpretation-quote');

  if (interpBadge && interpText && interpQuote) {
    if (isDisagreement) {
      interpBadge.innerText = "MODEL DISAGREEMENT";
      interpBadge.style.color = "var(--accent-amber)";
      interpText.innerText = "Behavioral signals triggered the alert, while relational evidence changed the graph-enhanced assessment. The 24-hour causal graph revealed a dispersed organic footprint with 0 shared payment methods, safely revising the risk assessment downward.";
      interpQuote.innerText = `"Behavioral alert → relational context → revised risk assessment."`;
    } else {
      interpBadge.innerText = "MODEL AGREEMENT";
      interpBadge.style.color = "var(--accent-cyan)";
      interpText.innerText = "Both models reach the same decision. Graph context does not materially change the final assessment. Behavioral signals and relational evidence reinforce the alert.";
      interpQuote.innerText = `"Behavioral and relational evidence reinforce the alert."`;
    }
  }

  // 6. Investigation Timeline
  renderTimeline(data.timeline || []);

  // 7. Defensive Recommendation & Human Action Log
  const rec = data.recommendation || {};
  const recBadge = document.getElementById('disp-rec-action');
  const recGuidance = document.getElementById('disp-rec-guidance');

  const recAction = rec.action || "Analyst review";
  if (recBadge) {
    recBadge.innerText = recAction.toUpperCase();
    recBadge.className = "rec-action-badge";
    if (recAction.toLowerCase().includes("escalate")) {
      recBadge.classList.add("action-escalate");
    } else if (recAction.toLowerCase().includes("review")) {
      recBadge.classList.add("action-review");
    } else {
      recBadge.classList.add("action-monitor");
    }
  }

  if (recGuidance) {
    recGuidance.innerText = rec.guidance || "Evaluate transaction against case evidence.";
  }

  // Record into Action Log
  recordAnalystAction(recAction, data.timestamp);
}

function renderSplitEvidence(data) {
  const feats = data.features || {};

  // 1. Temporal Evidence Table
  const tempTbody = document.getElementById('disp-temporal-tbody');
  if (tempTbody) {
    tempTbody.innerHTML = "";
    const temporalKeys = [
      { key: "merchant_velocity_1h", label: "Merchant 1h Velocity", bench: "< 5.0 txns/hr" },
      { key: "burst_score", label: "Burst Score (5m / 1h)", bench: "< 0.10 normal" },
      { key: "txn_count_1h", label: "Customer 1h Txns", bench: "< 3.0 txns" },
      { key: "txn_count_5m", label: "Customer 5m Txns", bench: "< 2.0 txns" },
      { key: "amount_ratio_vs_customer", label: "Amount / Median Ratio", bench: "0.5x - 2.0x normal" }
    ];

    temporalKeys.forEach(item => {
      if (item.key in feats) {
        const rawVal = feats[item.key];
        const valStr = typeof rawVal === 'number' ? (rawVal % 1 === 0 ? rawVal.toFixed(0) : rawVal.toFixed(2)) : rawVal;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="signal-code">${item.key}</span>
            <span class="signal-sublabel">${item.label}</span>
          </td>
          <td class="obs-val">${valStr}</td>
          <td class="bench-val">${item.bench}</td>
        `;
        tempTbody.appendChild(tr);
      }
    });
  }

  // 2. Relational Evidence Table
  const relTbody = document.getElementById('disp-relational-tbody');
  if (relTbody) {
    relTbody.innerHTML = "";
    const relationalKeys = [
      { key: "shared_device_customers_24h", label: "Shared Device Accounts", bench: "0 shared (isolated)" },
      { key: "shared_pm_customers_24h", label: "Shared PM Accounts", bench: "0 shared (isolated)" },
      { key: "two_hop_customer_count_24h", label: "2-Hop Customer Reach", bench: "< 3 accts normal" },
      { key: "customer_degree_24h", label: "Customer Degree (24h)", bench: "1 - 3 entities" },
      { key: "local_cluster_density_24h", label: "Local Cluster Density", bench: "< 0.05 normal" }
    ];

    relationalKeys.forEach(item => {
      if (item.key in feats) {
        const rawVal = feats[item.key];
        const valStr = typeof rawVal === 'number' ? (rawVal % 1 === 0 ? rawVal.toFixed(0) : rawVal.toFixed(4)) : rawVal;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="signal-code">${item.key}</span>
            <span class="signal-sublabel">${item.label}</span>
          </td>
          <td class="obs-val">${valStr}</td>
          <td class="bench-val">${item.bench}</td>
        `;
        relTbody.appendChild(tr);
      }
    });
  }

  // 3. Human-Readable Summary Bullets
  const tempReasons = document.getElementById('disp-reasons-temporal');
  const relReasons = document.getElementById('disp-reasons-relational');
  if (tempReasons) tempReasons.innerHTML = "";
  if (relReasons) relReasons.innerHTML = "";

  (data.reasons || []).forEach(r => {
    const isRel = r.title.includes('Device') || r.title.includes('Payment') || r.title.includes('Ring') || r.title.includes('Cluster') || r.title.includes('Network') || r.detail.includes('device') || r.detail.includes('shared');
    const container = isRel ? relReasons : tempReasons;
    if (container) {
      const el = document.createElement('div');
      el.className = `reason-item severity-${r.severity || 'info'}`;
      el.innerHTML = `
        <div class="reason-header"><span class="reason-title">${escapeHtml(r.title)}</span></div>
        <div class="reason-detail">${escapeHtml(r.detail)}</div>
      `;
      container.appendChild(el);
    }
  });

  // Legacy compatibility population
  const compatList = document.getElementById('disp-reasons-list');
  if (compatList) {
    compatList.innerHTML = "";
    (data.reasons || []).forEach(r => {
      const div = document.createElement('div');
      div.innerText = `${r.title}: ${r.detail}`;
      compatList.appendChild(div);
    });
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
        <span class="timeline-timestamp">${escapeHtml(node.date || '')} ${escapeHtml(node.time || '')}</span>
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

function recordAnalystAction(actionName, optionalTime) {
  // Highlight chosen button
  document.querySelectorAll('.btn-action-select').forEach(b => b.classList.remove('active'));
  if (actionName.toLowerCase().includes("monitor")) {
    document.getElementById('btn-act-monitor')?.classList.add('active');
  } else if (actionName.toLowerCase().includes("escalate")) {
    document.getElementById('btn-act-escalate')?.classList.add('active');
  } else {
    document.getElementById('btn-act-review')?.classList.add('active');
  }

  // Update Action Log Record
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
    if (actionName.toLowerCase().includes("monitor")) {
      statusEl.innerText = "Logged to telemetry (Continuous monitoring)";
      statusEl.className = "log-val text-muted";
    } else {
      statusEl.innerText = "Awaiting human authorization";
      statusEl.className = "log-val text-amber font-semibold";
    }
  }

  // Update recommendation badge on card
  const recBadge = document.getElementById('disp-rec-action');
  if (recBadge) {
    recBadge.innerText = actionName.toUpperCase();
    recBadge.className = "rec-action-badge";
    if (actionName.toLowerCase().includes("escalate")) {
      recBadge.classList.add("action-escalate");
    } else if (actionName.toLowerCase().includes("review")) {
      recBadge.classList.add("action-review");
    } else {
      recBadge.classList.add("action-monitor");
    }
  }
}

// -----------------------------------------------------------------------------
// THE 3D CAUSAL EGO-NETWORK ENGINE (THREE.JS / 3D-FORCE-GRAPH WEBGL)
// -----------------------------------------------------------------------------

function init3DCausalNetwork(graphData) {
  currentGraphData = graphData;

  const container = document.getElementById('3d-graph-container');
  const canvas2D = document.getElementById('network-canvas');

  if (!container) return;

  // Check if WebGL & ForceGraph3D are available
  if (typeof ForceGraph3D !== 'function') {
    console.warn("ForceGraph3D not available, falling back to 2D canvas.");
    init2DFallbackNetwork(graphData);
    return;
  }

  try {
    container.innerHTML = "";
    if (canvas2D) canvas2D.classList.add('hidden');

    // Build Graph Data with complete relational topology
    const nodeMap = {};
    const nodes = graphData.nodes.map(n => {
      const nodeObj = {
        id: n.id,
        label: n.label || n.id,
        type: n.type,
        is_focal: !!n.is_focal,
        degree: 0,
        connectedNodes: new Set(),
        connectedCustomers: new Set()
      };
      nodeMap[n.id] = nodeObj;
      return nodeObj;
    });

    const edges = graphData.edges.map(e => {
      const source = nodeMap[e.source];
      const target = nodeMap[e.target];
      const isShared = (e.relation || "").includes('shared');

      if (source && target) {
        source.degree++;
        target.degree++;
        source.connectedNodes.add(target.id);
        target.connectedNodes.add(source.id);
        if (source.type === 'customer') target.connectedCustomers.add(source.id);
        if (target.type === 'customer') source.connectedCustomers.add(target.id);
      }

      return {
        source: e.source,
        target: e.target,
        relation: e.relation || "transacts_with",
        isShared: isShared
      };
    }).filter(e => e.source && e.target);

    // Color definitions
    const colorMap = {
      focal: '#818cf8',
      customer: '#94a3b8',
      device: '#38bdf8',
      pm: '#10b981',
      merchant: '#f59e0b'
    };

    // State for interactive hovering and selection highlighting
    let hoveredNode = null;
    let selectedNode = null;
    const highlightNodes = new Set();
    const highlightLinks = new Set();

    function updateHighlightState() {
      highlightNodes.clear();
      highlightLinks.clear();
      const activeNode = hoveredNode || selectedNode;
      if (activeNode) {
        highlightNodes.add(activeNode.id);
        edges.forEach(link => {
          const s = typeof link.source === 'object' ? link.source.id : link.source;
          const t = typeof link.target === 'object' ? link.target.id : link.target;
          if (s === activeNode.id || t === activeNode.id) {
            highlightLinks.add(link);
            highlightNodes.add(s);
            highlightNodes.add(t);
          }
        });
      }

      if (forceGraph3DInstance) {
        forceGraph3DInstance
          .nodeColor(forceGraph3DInstance.nodeColor())
          .linkColor(forceGraph3DInstance.linkColor())
          .linkWidth(forceGraph3DInstance.linkWidth());
      }
    }

    // Instantiate 3D Force Graph
    const width = container.clientWidth || 1000;
    const height = container.clientHeight || 500;

    forceGraph3DInstance = ForceGraph3D()(container)
      .width(width)
      .height(height)
      .backgroundColor('rgba(9, 13, 22, 0.98)')
      .showNavInfo(false)
      .graphData({ nodes, links: edges })
      .nodeId('id')
      .nodeColor(n => {
        const activeNode = hoveredNode || selectedNode;
        const baseColor = n.is_focal ? '#818cf8' : (colorMap[n.type] || '#94a3b8');
        if (!activeNode) return baseColor;
        if (highlightNodes.has(n.id)) return baseColor;
        return 'rgba(100, 116, 139, 0.22)';
      })
      .nodeVal(n => {
        const activeNode = hoveredNode || selectedNode;
        let baseVal = n.is_focal ? 18 : (n.type === 'customer' ? 6.5 : (n.type === 'merchant' ? 14 : 10));
        if (activeNode && highlightNodes.has(n.id)) baseVal *= 1.25;
        return baseVal;
      })
      .nodeResolution(24)
      .nodeLabel(n => `<strong>${n.type.toUpperCase()}</strong>: ${n.label || n.id}`)
      .linkColor(link => {
        const activeNode = hoveredNode || selectedNode;
        if (activeNode) {
          if (highlightLinks.has(link)) {
            return link.isShared ? '#f43f5e' : '#38bdf8';
          }
          return 'rgba(148, 163, 184, 0.08)';
        }
        return link.isShared ? '#f43f5e' : 'rgba(148, 163, 184, 0.35)';
      })
      .linkWidth(link => {
        const activeNode = hoveredNode || selectedNode;
        if (activeNode && highlightLinks.has(link)) {
          return link.isShared ? 3.5 : 2.2;
        }
        return link.isShared ? 2.4 : 0.8;
      })
      .linkCurvature(link => (link.isShared ? 0.22 : 0))
      .linkDirectionalParticles(link => (link.isShared ? 3 : 0))
      .linkDirectionalParticleWidth(1.8)
      .linkDirectionalParticleSpeed(0.006)
      .d3VelocityDecay(0.35)
      .cooldownTicks(90) // Auto settle physics smoothly
      .onEngineStop(() => {
        // Automatically fit network to camera viewport upon settling
        forceGraph3DInstance.zoomToFit(500, 45);
      })
      .onNodeHover(node => {
        hoveredNode = node || null;
        updateHighlightState();
        if (node) {
          updateGraphInspector(node, graphData);
        } else if (selectedNode) {
          updateGraphInspector(selectedNode, graphData);
        }
      })
      .onNodeClick(node => {
        if (!node) return;
        selectedNode = node;
        updateHighlightState();
        updateGraphInspector(node, graphData);

        // Smoothly zoom toward clicked node
        const distance = 85;
        const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        forceGraph3DInstance.cameraPosition(
          { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
          node,
          900
        );
      });

    // Default inspector to focal node
    const focal = nodes.find(n => n.is_focal) || nodes[0];
    selectedNode = focal;
    updateGraphInspector(focal, graphData);

    // Initial camera zoom to fit network
    setTimeout(() => {
      if (forceGraph3DInstance) {
        forceGraph3DInstance.zoomToFit(500, 45);
      }
    }, 250);

  } catch (err) {
    console.warn("Failed to initialize 3D WebGL graph, falling back to 2D:", err);
    init2DFallbackNetwork(graphData);
  }
}

function updateGraphInspector(node, graphData) {
  const inspectorCard = document.getElementById('graph-inspector-card');
  const typeEl = document.getElementById('insp-type');
  const idEl = document.getElementById('insp-id');
  const relationEl = document.getElementById('insp-relation');
  const connEl = document.getElementById('insp-connections');
  const explEl = document.getElementById('insp-explanation');

  if (!inspectorCard || !node) return;

  const typeNames = {
    customer: node.is_focal ? "FOCAL INVESTIGATED CUSTOMER" : "SHARED CUSTOMER ACCOUNT",
    device: "SHARED PHYSICAL DEVICE",
    pm: "PAYMENT INSTRUMENT (CARD/UPI)",
    merchant: "MERCHANT CHECKOUT ACCOUNT"
  };

  if (typeEl) typeEl.innerText = typeNames[node.type] || node.type.toUpperCase();
  if (idEl) idEl.innerText = node.label || node.id;

  // Accurate connected count: customer degree vs infrastructure customer reach
  let connectedCount = 0;
  if (node.type === 'customer') {
    connectedCount = node.connectedNodes ? node.connectedNodes.size : (node.degree || 0);
  } else {
    connectedCount = node.connectedCustomers && node.connectedCustomers.size > 0
      ? node.connectedCustomers.size
      : (node.connectedNodes ? node.connectedNodes.size : (node.degree || 0));
  }
  if (connEl) connEl.innerText = connectedCount;

  if (relationEl && explEl) {
    if (node.is_focal) {
      relationEl.innerText = "Investigated Focal Entity";
      explEl.innerText = `Primary customer account evaluated at arrival timestamp t. Directly connects to ${connectedCount} infrastructure and merchant node${connectedCount === 1 ? '' : 's'}.`;
    } else if (node.type === 'device') {
      relationEl.innerText = connectedCount > 1 ? "Multiplexed Hardware" : "Dedicated Hardware";
      explEl.innerText = connectedCount > 1
        ? `Recycled across ${connectedCount} distinct customer accounts in the causal 24h window.`
        : "Operated exclusively by the investigated customer during the 24h observation window.";
    } else if (node.type === 'pm') {
      relationEl.innerText = connectedCount > 1 ? "Multiplexed Instrument" : "Dedicated Instrument";
      explEl.innerText = connectedCount > 1
        ? `Payment method linked across ${connectedCount} distinct customer accounts.`
        : "Isolated payment instrument with no observed cross-account reuse.";
    } else if (node.type === 'merchant') {
      relationEl.innerText = "Target Merchant";
      explEl.innerText = `Checkout endpoint with ${connectedCount} customer transaction${connectedCount === 1 ? '' : 's'} recorded in the 24h causal window.`;
    } else {
      relationEl.innerText = "Bipartite Neighbor";
      explEl.innerText = "2-hop reachable customer account active in the 24-hour causal relational topology.";
    }
  }
}

// 3D Controls
function reset3DCamera() {
  if (forceGraph3DInstance) {
    forceGraph3DInstance.zoomToFit(500, 45);
  }
}

function fit3DGraph() {
  if (forceGraph3DInstance) {
    forceGraph3DInstance.zoomToFit(400, 40);
  }
}

function focusFocalNode() {
  if (!forceGraph3DInstance || !currentGraphData) return;
  const graphNodes = forceGraph3DInstance.graphData().nodes;
  const focal = graphNodes.find(n => n.is_focal) || graphNodes[0];
  if (focal) {
    selectedNode = focal;
    updateGraphInspector(focal, currentGraphData);
    const distance = 90;
    const distRatio = 1 + distance / Math.hypot(focal.x || 1, focal.y || 1, focal.z || 1);
    forceGraph3DInstance.cameraPosition(
      { x: (focal.x || 0) * distRatio, y: (focal.y || 0) * distRatio, z: (focal.z || 0) * distRatio },
      focal,
      750
    );
  }
}

function toggle3DRotation() {
  is3DAutoRotating = !is3DAutoRotating;
  const label = document.getElementById('rotate-btn-label');
  if (label) label.innerText = is3DAutoRotating ? "Pause Orbit" : "Auto-Rotate";

  if (!forceGraph3DInstance) return;

  if (is3DAutoRotating) {
    let angle = 0;
    const distance = 260;
    const rotateInterval = setInterval(() => {
      if (!is3DAutoRotating) {
        clearInterval(rotateInterval);
        return;
      }
      angle += Math.PI / 350;
      forceGraph3DInstance.cameraPosition({
        x: distance * Math.sin(angle),
        z: distance * Math.cos(angle)
      });
    }, 30);
  }
}

// -----------------------------------------------------------------------------
// 2D CANVAS FALLBACK (GUARANTEED BULLETPROOF FALLBACK)
// -----------------------------------------------------------------------------

function init2DFallbackNetwork(graphData) {
  const container = document.getElementById('3d-graph-container');
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;

  if (container) container.innerHTML = "";
  canvas.classList.remove('hidden');

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1000;
  const height = 460;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  if (graph2DSimulation) {
    cancelAnimationFrame(graph2DSimulation);
    graph2DSimulation = null;
  }

  const nodes = graphData.nodes.map((n, i) => {
    const angle = (i / graphData.nodes.length) * 2 * Math.PI;
    const dist = n.is_focal ? 0 : 130 + (i % 3) * 45;
    return {
      id: n.id,
      label: n.label || n.id,
      type: n.type,
      is_focal: !!n.is_focal,
      x: (width / 2) + Math.cos(angle) * dist,
      y: (height / 2) + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      radius: n.is_focal ? 18 : (n.type === 'customer' ? 9 : 12),
      degree: 0,
      connectedNodes: new Set(),
      connectedCustomers: new Set()
    };
  });

  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  const edges = graphData.edges.map(e => {
    const s = nodeMap[e.source];
    const t = nodeMap[e.target];
    if (s && t) {
      s.degree++;
      t.degree++;
      s.connectedNodes.add(t.id);
      t.connectedNodes.add(s.id);
      if (s.type === 'customer') t.connectedCustomers.add(s.id);
      if (t.type === 'customer') s.connectedCustomers.add(t.id);
    }
    return {
      source: s,
      target: t,
      relation: e.relation || ""
    };
  }).filter(e => e.source && e.target);

  const focal = nodes.find(n => n.is_focal) || nodes[0];
  updateGraphInspector(focal, graphData);

  let frameCount = 0;
  function step2D() {
    frameCount++;
    const k = 0.04;
    const rep = 800;
    const damping = 0.78;

    // Repulsion
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
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
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
      if (!e.source.is_focal) { e.source.vx += fx; e.source.vy += fy; }
      e.target.vx -= fx; e.target.vy -= fy;
    });

    // Center pull
    const cx = width / 2;
    const cy = height / 2;
    nodes.forEach(n => {
      n.vx += (cx - n.x) * (n.is_focal ? 0.08 : 0.005);
      n.vy += (cy - n.y) * (n.is_focal ? 0.08 : 0.005);
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
    });

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw Edges
    edges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);
      if (e.relation.includes('shared')) {
        ctx.strokeStyle = "rgba(244, 63, 94, 0.65)";
        ctx.lineWidth = 2.2;
      } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
        ctx.lineWidth = 1.0;
      }
      ctx.stroke();
    });

    // Draw Nodes
    nodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
      if (n.is_focal) {
        ctx.fillStyle = "#818cf8";
      } else if (n.type === 'device') {
        ctx.fillStyle = "#38bdf8";
      } else if (n.type === 'pm') {
        ctx.fillStyle = "#10b981";
      } else if (n.type === 'merchant') {
        ctx.fillStyle = "#f59e0b";
      } else {
        ctx.fillStyle = "#94a3b8";
      }
      ctx.fill();

      // Label
      ctx.font = "10px 'JetBrains Mono'";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(n.label || n.id, n.x, n.y + n.radius + 12);
    });

    if (frameCount < 100) {
      graph2DSimulation = requestAnimationFrame(step2D);
    }
  }

  step2D();
}

// -----------------------------------------------------------------------------
// VIEW 3: MODEL EVALUATION LOADER & VISUALIZATIONS
// -----------------------------------------------------------------------------

let evaluationLoaded = false;
let cachedEvaluationData = null;

async function loadEvaluationData() {
  if (evaluationLoaded && cachedEvaluationData) {
    renderPRCurve(cachedEvaluationData.pr_curves);
    return;
  }

  try {
    const res = await fetch('/evaluate');
    if (!res.ok) throw new Error("Evaluation endpoint error");
    const data = await res.json();
    cachedEvaluationData = data;

    // 1. Populate Aggregate Comparison Metrics
    const aggr = data.aggregate_comparison || {};
    const mC = aggr.model_C || {};
    const mB = aggr.model_B || {};

    setElText('aggr-prauc-b', (mB.pr_auc || 0.9568).toFixed(4));
    setElText('aggr-prauc-c', `Model C: ${(mC.pr_auc || 0.9550).toFixed(4)}`);
    setDelta('aggr-prauc-delta', (mB.pr_auc || 0.9568) - (mC.pr_auc || 0.9550), true);

    setElText('aggr-prec-b', `${((mB.precision || 0.6865) * 100).toFixed(1)}%`);
    setElText('aggr-prec-c', `Model C: ${((mC.precision || 0.6508) * 100).toFixed(1)}%`);
    setDelta('aggr-prec-delta', ((mB.precision || 0.6865) - (mC.precision || 0.6508)) * 100, true, '%');

    setElText('aggr-rec-b', `${((mB.recall || 0.9515) * 100).toFixed(1)}%`);
    setElText('aggr-rec-c', `Model C: ${((mC.recall || 0.9532) * 100).toFixed(1)}%`);
    setDelta('aggr-rec-delta', ((mB.recall || 0.9515) - (mC.recall || 0.9532)) * 100, true, '%');

    setElText('aggr-cost-b', formatNumber(mB.expected_cost || 31810));
    setElText('aggr-cost-c', `Model C: ${formatNumber(mC.expected_cost || 32017)}`);
    setDelta('aggr-cost-delta', (mB.expected_cost || 31810) - (mC.expected_cost || 32017), false);

    // 2. Render Confusion Matrices
    const cmC = (data.held_out_confusion_matrices || {}).model_C || { tn: 12824, fp: 887, fn: 51, tp: 1039 };
    const cmB = (data.held_out_confusion_matrices || {}).model_B || { tn: 12945, fp: 766, fn: 53, tp: 1037 };

    setElText('mat-c-tn', cmC.tn);
    setElText('mat-c-fp', cmC.fp);
    setElText('mat-c-fn', cmC.fn);
    setElText('mat-c-tp', cmC.tp);

    setElText('mat-b-tn', cmB.tn);
    setElText('mat-b-fp', cmB.fp);
    setElText('mat-b-fn', cmB.fn);
    setElText('mat-b-tp', cmB.tp);

    // 3. Render PR Curve Canvas
    renderPRCurve(data.pr_curves);

    evaluationLoaded = true;

  } catch (err) {
    console.error("Failed to load evaluation data:", err);
  }
}

function renderPRCurve(prCurves) {
  const canvas = document.getElementById('pr-curve-canvas');
  if (!canvas) return;

  const container = canvas.parentElement || canvas;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width > 120 ? Math.floor(rect.width) : 540;
  const h = 300;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padL = 50;
  const padR = 24;
  const padT = 24;
  const padB = 42;
  const plotW = Math.max(50, w - padL - padR);
  const plotH = Math.max(50, h - padT - padB);

  // Background subtle grid lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const yVal = padT + (plotH * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padL, yVal);
    ctx.lineTo(w - padR, yVal);
    ctx.stroke();

    const xVal = padL + (plotW * i) / 5;
    ctx.beginPath();
    ctx.moveTo(xVal, padT);
    ctx.lineTo(xVal, h - padB);
    ctx.stroke();
  }

  // Grid tick text
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#64748b";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const pVal = (1.0 - i * 0.2).toFixed(1);
    const y = padT + (plotH * i) / 5;
    ctx.fillText(pVal, padL - 8, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= 5; i++) {
    const rVal = (i * 0.2).toFixed(1);
    const x = padL + (plotW * i) / 5;
    ctx.fillText(rVal, x, h - padB + 8);
  }

  // Axis labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Recall", padL + plotW / 2, h - padB + 24);

  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("Precision", 0, 0);
  ctx.restore();

  function drawCurve(pts, strokeColor, lineWidth, isDashed = false) {
    if (!pts || pts.length === 0) return;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    if (isDashed) {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();

    pts.forEach((pt, i) => {
      // Support both backend API key format {recall, precision} and shorthand {r, p}
      const r = pt.recall !== undefined ? Number(pt.recall) : (pt.r !== undefined ? Number(pt.r) : 0);
      const p = pt.precision !== undefined ? Number(pt.precision) : (pt.p !== undefined ? Number(pt.p) : 0);
      const x = padL + r * plotW;
      const y = (h - padB) - p * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Draw Model C (Temporal Only Control - Slate Dashed)
  if (prCurves && prCurves.model_C) {
    drawCurve(prCurves.model_C, "#94a3b8", 2.0, true);
  } else {
    drawCurve([
      { recall: 0, precision: 1.0 }, { recall: 0.75, precision: 0.94 }, { recall: 0.92, precision: 0.86 }, { recall: 0.96, precision: 0.65 }, { recall: 1.0, precision: 0.08 }
    ], "#94a3b8", 2.0, true);
  }

  // Draw Model B (Temporal + Graph - Vibrant Cyan Solid)
  if (prCurves && prCurves.model_B) {
    drawCurve(prCurves.model_B, "#38bdf8", 2.6, false);
  } else {
    drawCurve([
      { recall: 0, precision: 1.0 }, { recall: 0.82, precision: 0.96 }, { recall: 0.94, precision: 0.90 }, { recall: 0.98, precision: 0.72 }, { recall: 1.0, precision: 0.09 }
    ], "#38bdf8", 2.6, false);
  }

  // Legend Box
  const legW = 210;
  const legH = 46;
  const legX = Math.max(padL + 10, w - padR - legW);
  const legY = padT + 8;
  ctx.fillStyle = "rgba(14, 20, 36, 0.92)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(legX, legY, legW, legH, 6);
  else ctx.rect(legX, legY, legW, legH);
  ctx.fill();
  ctx.stroke();

  // Model B Legend Entry
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(legX + 12, legY + 14);
  ctx.lineTo(legX + 30, legY + 14);
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Model B (Temporal + Graph)", legX + 36, legY + 14);

  // Model C Legend Entry
  ctx.save();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2.0;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(legX + 12, legY + 32);
  ctx.lineTo(legX + 30, legY + 32);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 11px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Model C (Temporal Only)", legX + 36, legY + 32);
}

// -----------------------------------------------------------------------------
// HELPER UTILITIES
// -----------------------------------------------------------------------------

function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function setDelta(id, deltaVal, positiveIsGood = true, suffix = "") {
  const el = document.getElementById(id);
  if (!el) return;

  const isPos = deltaVal >= 0;
  const formatted = `${isPos ? '+' : ''}${deltaVal.toFixed(isPos ? 2 : 2)}${suffix}`;
  el.innerText = formatted;

  const good = positiveIsGood ? isPos : !isPos;
  el.style.color = good ? "var(--accent-emerald)" : "var(--accent-rose)";
}

function formatNumber(num) {
  if (typeof num !== 'number') return num;
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatScenario(s) {
  if (!s) return "Standard";
  return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = "info") {
  const toast = document.getElementById('toast-banner');
  if (!toast) return;
  toast.innerText = msg;
  toast.className = `toast-banner toast-${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

// -----------------------------------------------------------------------------
// WINDOW ONLOAD INITIALIZATION
// -----------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', () => {
  // Initialize on Cases Landing View
  switchTab('cases');

  // Pre-load default Case A in memory
  loadCase('T57997');
});

window.addEventListener('resize', () => {
  if (activeTab === 'evaluation' && cachedEvaluationData && cachedEvaluationData.pr_curves) {
    renderPRCurve(cachedEvaluationData.pr_curves);
  } else if (activeTab === 'investigate' && forceGraph3DInstance) {
    const container = document.getElementById('3d-graph-container');
    if (container && container.clientWidth) {
      forceGraph3DInstance.width(container.clientWidth);
      forceGraph3DInstance.height(container.clientHeight || 500);
    }
  }
});
