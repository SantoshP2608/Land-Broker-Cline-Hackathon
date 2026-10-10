import React, { useMemo, useState } from "react";
import "./OfficerPage.css";

const REVIEWER_CASES = [
  {
    id: "RV-2041",
    title: "Madhurawada Residential Plot",
    type: "Land review",
    status: "Corrections required",
    statusTone: "amber",
    submitted: "10 Oct 2026",
    seller: "Santosh Pabolu",
    survey: "128/2",
    area: "240 sq yd",
    image: "🌳",
    findings: [
      { check: "Survey number", source: "Sale deed + land record", finding: "Matches: 128/2", tone: "ok" },
      { check: "Area", source: "240 sq yd vs 235 sq yd", finding: "Discrepancy", tone: "warn" },
      { check: "Encumbrance certificate", source: "Not uploaded", finding: "Missing", tone: "warn" },
    ],
    identity: [
      { label: "Seller ID verified", value: "Matches Aadhaar record" },
      { label: "Photo match", value: "Confirmed" },
    ],
    history: [
      { label: "Submitted for review", value: "10 Oct 2026, 11:05 AM" },
      { label: "Document comparison flagged area discrepancy", value: "10 Oct 2026, 1:15 PM" },
    ],
  },
  {
    id: "ID-108",
    title: "Kushwanth Alla",
    type: "Identity review",
    status: "Pending",
    statusTone: "blue",
    submitted: "09 Oct 2026",
    seller: "Kushwanth Alla",
    survey: "—",
    area: "—",
    image: "🪪",
    findings: [
      { check: "ID document", source: "Aadhaar upload", finding: "Pending review", tone: "pending" },
    ],
    identity: [{ label: "Face match", value: "Awaiting check" }],
    history: [{ label: "Submitted", value: "09 Oct 2026, 4:10 PM" }],
  },
  {
    id: "HC-2030",
    title: "Cancellation request",
    type: "Hold case",
    status: "Parcel on hold",
    statusTone: "red",
    submitted: "08 Oct 2026",
    seller: "—",
    survey: "—",
    area: "—",
    image: "🌾",
    findings: [
      { check: "Cancellation reason", source: "Buyer request", finding: "Under hold", tone: "warn" },
    ],
    identity: [{ label: "Identity", value: "Not applicable" }],
    history: [{ label: "Hold placed", value: "08 Oct 2026, 2:00 PM" }],
  },
  {
    id: "RV-2042",
    title: "Anandapuram Plot",
    type: "Land review",
    status: "Awaiting review",
    statusTone: "blue",
    submitted: "10 Oct 2026",
    seller: "Ravi Teja",
    survey: "45/1",
    area: "180 sq yd",
    image: "🌳",
    findings: [
      { check: "Survey number", source: "Sale deed", finding: "Matches", tone: "ok" },
    ],
    identity: [{ label: "Seller ID verified", value: "Confirmed" }],
    history: [{ label: "Submitted", value: "10 Oct 2026, 9:40 AM" }],
  },
];

const REGISTRAR_APPS = [
  {
    id: "APP-2048",
    title: "Bheemili Coastal Plot",
    survey: "76/3",
    status: "Ready for review",
    statusTone: "blue",
    price: "₹60,00,000",
    seller: "Santosh Pabolu",
    buyer: "Kushwanth Alla",
    deedVersion: "v3",
    deedRef: "D-2048-V3",
    confirmations: [
      { label: "Seller confirmed v3", value: "10 Oct 2026, 5:45 PM" },
      { label: "Buyer confirmed v3", value: "10 Oct 2026, 6:20 PM" },
    ],
    checklist: [
      { label: "Identity eligibility reviewed", value: "10 Oct 2026, 4:10 PM" },
      { label: "Application evidence checked", value: "10 Oct 2026, 4:35 PM" },
      { label: "No active hold", value: "10 Oct 2026, 5:00 PM" },
    ],
    history: [
      { label: "Application submitted", value: "08 Oct 2026, 10:00 AM" },
      { label: "Both parties confirmed deed v3", value: "10 Oct 2026, 6:20 PM" },
    ],
  },
  {
    id: "APP-2035",
    title: "Anandapuram Plot",
    survey: "128/2",
    status: "Clarification requested",
    statusTone: "amber",
    price: "₹42,00,000",
    seller: "Ravi Teja",
    buyer: "Meena Rao",
    deedVersion: "v2",
    deedRef: "D-2035-V2",
    confirmations: [{ label: "Seller confirmed v2", value: "07 Oct 2026, 3:15 PM" }],
    checklist: [
      { label: "Identity eligibility reviewed", value: "07 Oct 2026, 2:00 PM" },
      { label: "Application evidence checked", value: "Pending" },
    ],
    history: [{ label: "Clarification requested", value: "07 Oct 2026, 4:00 PM" }],
  },
  {
    id: "APP-2029",
    title: "Vizianagaram Plot",
    survey: "45/1",
    status: "Awaiting review",
    statusTone: "blue",
    price: "₹28,50,000",
    seller: "Harika Devi",
    buyer: "Suresh Kumar",
    deedVersion: "v1",
    deedRef: "D-2029-V1",
    confirmations: [],
    checklist: [{ label: "Identity eligibility reviewed", value: "Pending" }],
    history: [{ label: "Application submitted", value: "09 Oct 2026, 1:00 PM" }],
  },
];

function Badge({ tone, children }) {
  return <span className={`officer-badge officer-badge--${tone}`}>{children}</span>;
}

function ReviewerDashboard() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(REVIEWER_CASES[0].id);
  const [tab, setTab] = useState("findings");
  const [decision, setDecision] = useState("Request corrections");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);

  const filtered = useMemo(() => {
    return REVIEWER_CASES.filter((c) => {
      const matchesQuery = c.id.toLowerCase().includes(query.toLowerCase()) || c.title.toLowerCase().includes(query.toLowerCase());
      const matchesFilter =
        filter === "All" ||
        (filter === "Land" && c.type === "Land review") ||
        (filter === "Identity" && c.type === "Identity review");
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  const selected = REVIEWER_CASES.find((c) => c.id === selectedId) || filtered[0];

  const stats = [
    { label: "Assigned cases", value: REVIEWER_CASES.length, icon: "📄" },
    { label: "Identity reviews", value: REVIEWER_CASES.filter((c) => c.type === "Identity review").length, icon: "👤" },
    { label: "Land reviews", value: REVIEWER_CASES.filter((c) => c.type === "Land review").length, icon: "🗺️" },
    { label: "Hold cases", value: REVIEWER_CASES.filter((c) => c.type === "Hold case").length, icon: "⚠️" },
  ];

  function handleSelect(id) {
    setSelectedId(id);
    setTab("findings");
    setMessage(null);
  }

  function handleSaveDraft() {
    if (!reason.trim()) {
      setMessage({ tone: "warn", text: "Add a reason before saving a draft." });
      return;
    }
    setMessage({ tone: "ok", text: "Draft saved locally (demo only — not sent anywhere)." });
  }

  function handleSubmit() {
    if (!reason.trim()) {
      setMessage({ tone: "warn", text: "A reason / evidence reference is required to submit a decision." });
      return;
    }
    setMessage({ tone: "ok", text: `Decision "${decision}" recorded locally for ${selected.id}. No real record was changed.` });
  }

  return (
    <>
      <div className="officer-stat-grid">
        {stats.map((s) => (
          <div className="officer-stat-card" key={s.label}>
            <span className="officer-stat-card__icon">{s.icon}</span>
            <div>
              <div className="officer-stat-card__value">{s.value}</div>
              <div className="officer-stat-card__label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="officer-columns">
        <div className="officer-panel officer-panel--list">
          <div className="officer-panel__header"><h2>Assigned cases</h2></div>
          <div className="officer-panel__body officer-panel__body--pad">
            <input className="officer-search" placeholder="Search case ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="officer-filter-row">
              {["All", "Land", "Identity"].map((f) => (
                <button key={f} className={`officer-filter-btn ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
            <div className="officer-case-list">
              {filtered.map((c) => (
                <button key={c.id} className={`officer-case-row ${selectedId === c.id ? "is-selected" : ""}`} onClick={() => handleSelect(c.id)}>
                  <span className="officer-case-row__thumb">{c.image}</span>
                  <span className="officer-case-row__body">
                    <span className="officer-case-row__title">{c.id} <span className="officer-case-row__name">{c.title}</span></span>
                    <span className="officer-case-row__meta">{c.type}</span>
                  </span>
                  <Badge tone={c.statusTone}>{c.status}</Badge>
                  <span className="officer-case-row__chevron">›</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="officer-empty">No cases match your search.</p>}
            </div>
            <p className="officer-list-footer">Showing assigned cases only · {filtered.length} cases</p>
          </div>
        </div>

        {selected && (
          <div className="officer-panel officer-panel--detail">
            <div className="officer-detail-header">
              <h2>Case {selected.id} <Badge tone={selected.statusTone}>{selected.status}</Badge></h2>
              <span className="officer-detail-sub">Submitted {selected.submitted}</span>
            </div>
            <div className="officer-detail-summary">
              <span className="officer-detail-thumb">{selected.image}</span>
              <div>
                <strong>{selected.title}</strong>
                <p>Seller: {selected.seller} · Survey {selected.survey}</p>
                <p>📍 Survey {selected.survey} &nbsp; 📐 {selected.area}</p>
              </div>
            </div>

            <div className="officer-tabs">
              {[{ key: "findings", label: "Evidence & findings" }, { key: "identity", label: "Identity check" }, { key: "history", label: "History" }].map((t) => (
                <button key={t.key} className={`officer-tab ${tab === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>

            {tab === "findings" && (
              <table className="officer-table">
                <thead><tr><th>Check</th><th>Source evidence</th><th>Finding</th></tr></thead>
                <tbody>
                  {selected.findings.map((f) => (
                    <tr key={f.check}>
                      <td>{f.check}</td>
                      <td>{f.source}</td>
                      <td><Badge tone={f.tone === "ok" ? "green" : f.tone === "warn" ? "amber" : "blue"}>{f.finding}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "identity" && (
              <ul className="officer-kv-list">
                {selected.identity.map((i) => (<li key={i.label}><span>{i.label}</span><strong>{i.value}</strong></li>))}
              </ul>
            )}
            {tab === "history" && (
              <ul className="officer-kv-list">
                {selected.history.map((h) => (<li key={h.label}><span>{h.label}</span><strong>{h.value}</strong></li>))}
              </ul>
            )}

            <div className="officer-decision">
              <h3>Record review decision</h3>
              <div className="officer-decision-grid">
                <label>
                  Decision
                  <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                    <option>Approve</option>
                    <option>Request corrections</option>
                    <option>Reject</option>
                    <option>Hold</option>
                  </select>
                </label>
                <label>
                  Reason / evidence reference
                  <textarea rows={2} placeholder="Explain the decision with reference to evidence…" value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </div>
              <p className="officer-note">ⓘ Decision applies to this review scope. Listing remains unpublished pending approval.</p>
              {message && <p className={`officer-message officer-message--${message.tone}`}>{message.text}</p>}
              <div className="officer-decision-actions">
                <button className="officer-btn officer-btn--ghost" onClick={handleSaveDraft}>Save draft</button>
                <button className="officer-btn officer-btn--primary" onClick={handleSubmit}>Submit review decision →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function RegistrarDashboard() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(REGISTRAR_APPS[0].id);
  const [tab, setTab] = useState("detail");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState(null);

  const filtered = useMemo(
    () => REGISTRAR_APPS.filter((a) => a.id.toLowerCase().includes(query.toLowerCase()) || a.title.toLowerCase().includes(query.toLowerCase())),
    [query]
  );
  const selected = REGISTRAR_APPS.find((a) => a.id === selectedId) || filtered[0];

  const stats = [
    { label: "Assigned", value: REGISTRAR_APPS.length, icon: "📄" },
    { label: "Clarifications", value: REGISTRAR_APPS.filter((a) => a.status === "Clarification requested").length, icon: "💬" },
    { label: "Awaiting review", value: REGISTRAR_APPS.filter((a) => a.status !== "Ready for review").length, icon: "⏱️" },
  ];

  function handleSelect(id) {
    setSelectedId(id);
    setTab("detail");
    setMessage(null);
  }

  function requireNotes(action) {
    if (!notes.trim()) {
      setMessage({ tone: "warn", text: "Decision notes are required before recording an outcome." });
      return;
    }
    setMessage({ tone: "ok", text: action });
  }

  function handleClarification() {
    requireNotes(`Clarification request recorded locally for ${selected.id}. No notification is actually sent (demo only).`);
  }

  function handleComplete() {
    requireNotes(`Simulated completion recorded locally for ${selected.id}. This does NOT perform a legal transfer of ownership.`);
  }

  return (
    <>
      <div className="officer-stat-grid">
        {stats.map((s) => (
          <div className="officer-stat-card" key={s.label}>
            <span className="officer-stat-card__icon">{s.icon}</span>
            <div>
              <div className="officer-stat-card__value">{s.value}</div>
              <div className="officer-stat-card__label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="officer-columns">
        <div className="officer-panel officer-panel--list">
          <div className="officer-panel__header"><h2>Assigned applications</h2></div>
          <div className="officer-panel__body officer-panel__body--pad">
            <input className="officer-search" placeholder="Search application ID…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="officer-case-list">
              {filtered.map((a) => (
                <button key={a.id} className={`officer-case-row ${selectedId === a.id ? "is-selected" : ""}`} onClick={() => handleSelect(a.id)}>
                  <span className="officer-case-row__thumb">🏝️</span>
                  <span className="officer-case-row__body">
                    <span className="officer-case-row__title">{a.id} <span className="officer-case-row__name">{a.title}</span></span>
                    <span className="officer-case-row__meta">Survey {a.survey}</span>
                  </span>
                  <Badge tone={a.statusTone}>{a.status}</Badge>
                  <span className="officer-case-row__chevron">›</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="officer-empty">No applications match your search.</p>}
            </div>
            <p className="officer-list-footer">Showing {filtered.length} of {REGISTRAR_APPS.length} assigned applications</p>
          </div>
        </div>

        {selected && (
          <div className="officer-panel officer-panel--detail">
            <div className="officer-detail-header">
              <h2>Application {selected.id} <Badge tone={selected.statusTone}>{selected.status}</Badge></h2>
            </div>
            <div className="officer-detail-summary officer-detail-summary--wide">
              <span className="officer-detail-thumb">🏝️</span>
              <div className="officer-detail-main">
                <strong>{selected.title}</strong>
                <p>Survey {selected.survey}</p>
              </div>
              <div className="officer-detail-price">
                <small>Agreed price</small>
                <strong>{selected.price}</strong>
              </div>
              <div className="officer-detail-parties">
                <div><small>Seller</small><strong>{selected.seller}</strong></div>
                <div><small>Buyer</small><strong>{selected.buyer}</strong></div>
              </div>
            </div>

            <div className="officer-tabs">
              {[{ key: "detail", label: "Application detail" }, { key: "deed", label: "Deed & evidence" }, { key: "history", label: "History" }].map((t) => (
                <button key={t.key} className={`officer-tab ${tab === t.key ? "is-active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
              <Badge tone="amber">⚠ Final decision pending</Badge>
            </div>

            {(tab === "detail" || tab === "deed") && (
              <div className="officer-registrar-grid">
                <div className="officer-subpanel">
                  <h3>Current deed confirmations</h3>
                  <div className="officer-deed-row">
                    <span>📄 Draft deed {selected.deedVersion}.pdf</span>
                    <button className="officer-link-btn">View deed →</button>
                  </div>
                  <p className="officer-deed-meta">Version {selected.deedVersion} · Reference {selected.deedRef}</p>
                  <ul className="officer-kv-list">
                    {selected.confirmations.length > 0 ? (
                      selected.confirmations.map((c) => (<li key={c.label}><span>✅ {c.label}</span><strong>{c.value}</strong></li>))
                    ) : (
                      <li><span>No confirmations recorded yet</span></li>
                    )}
                  </ul>
                  {selected.confirmations.length > 1 && <p className="officer-note">Both confirmations refer to the same current deed.</p>}
                </div>
                <div className="officer-subpanel">
                  <h3>Proceedings checklist</h3>
                  <ul className="officer-kv-list">
                    {selected.checklist.map((c) => (<li key={c.label}><span>✅ {c.label}</span><strong>{c.value}</strong></li>))}
                  </ul>
                </div>
              </div>
            )}
            {tab === "history" && (
              <ul className="officer-kv-list">
                {selected.history.map((h) => (<li key={h.label}><span>{h.label}</span><strong>{h.value}</strong></li>))}
              </ul>
            )}

            <div className="officer-decision">
              <h3>Record registrar outcome</h3>
              <label className="officer-decision-notes">
                Decision notes
                <textarea rows={2} placeholder="Record the outcome and supporting references…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              {message && <p className={`officer-message officer-message--${message.tone}`}>{message.text}</p>}
              <div className="officer-decision-actions officer-decision-actions--split">
                <button className="officer-btn officer-btn--danger" onClick={handleClarification}>Request clarification</button>
                <button className="officer-btn officer-btn--primary" onClick={handleComplete}>Record simulated completion →</button>
              </div>
              <p className="officer-note">ⓘ Records a demo outcome after review; it does not register a legal transfer.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function OfficerPage({ role = "reviewer" }) {
  const isRegistrar = role === "registrar";
  const [activeNav, setActiveNav] = useState(isRegistrar ? "Registrar dashboard" : "Review dashboard");

  const officer = isRegistrar
    ? { name: "Ananya N.", initials: "AN", role: "Registrar" }
    : { name: "Ravi Kumar", initials: "RK", role: "Reviewer" };

  const navItems = isRegistrar
    ? [
        { label: "Registrar dashboard", icon: "🏠" },
        { label: "Assigned applications", icon: "📄" },
        { label: "Clarifications", icon: "💬" },
        { label: "Demo outcomes", icon: "📊" },
        { label: "Audit trail", icon: "🕒" },
      ]
    : [
        { label: "Review dashboard", icon: "🏠" },
        { label: "Assigned cases", icon: "📄" },
        { label: "Identity reviews", icon: "👤" },
        { label: "Land reviews", icon: "🗺️" },
        { label: "Hold & cancellation", icon: "⚠️" },
        { label: "Audit trail", icon: "🕒" },
      ];

  return (
    <div className="officer-shell">
      <aside className="officer-sidebar">
        <div className="officer-brand">
          <span className="officer-brand__mark">🛡️</span>
          <div>
            <strong>LandShield</strong>
            <small>PROPERTY DOCUMENT VERIFICATION</small>
          </div>
        </div>
        <nav className="officer-nav">
          {navItems.map((item) => (
            <button key={item.label} className={`officer-nav__item ${activeNav === item.label ? "is-active" : ""}`} onClick={() => setActiveNav(item.label)}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="officer-sidebar__footer">
          <button className="officer-nav__item"><span>❓</span> Help &amp; support</button>
          <p>LandShield · Demo officer portal</p>
        </div>
      </aside>

      <div className="officer-main">
        <header className="officer-topbar">
          <div className="officer-topbar__brand">
            <span className="officer-brand__mark officer-brand__mark--small">🛡️</span>
            <strong>LandShield</strong>
            <span className="officer-topbar__divider">|</span>
            <span>Officer portal</span>
          </div>
          <div className="officer-topbar__tabs">
            <span className="is-active">{isRegistrar ? "Applications" : "Reviews"}</span>
            <span>Audit trail</span>
          </div>
          <div className="officer-topbar__right">
            <span className="officer-role-pill">🛡️ {officer.role}</span>
            <span className="officer-avatar">{officer.initials}</span>
          </div>
        </header>

        <div className="officer-demo-banner">
          <span className="officer-demo-dot" />
          <strong>DEMO {isRegistrar ? "MODE" : "VERSION"}</strong>
          <span>
            {isRegistrar
              ? "Registration outcomes are simulated. No legal ownership transfer."
              : "Sample cases and evidence. Real deployment will be government-controlled."}
          </span>
        </div>

        <main className="officer-content">
          <p className="officer-breadcrumb">Officer / {isRegistrar ? "Registration" : "Reviews"}</p>
          <h1 className="officer-title">{isRegistrar ? "Registrar" : "Reviewer"} <span>Dashboard</span></h1>
          <p className="officer-subtitle">
            {isRegistrar
              ? "Review assigned applications, deed confirmations, and proceedings."
              : "Review assigned evidence and record reasoned decisions."}
          </p>

          {isRegistrar ? <RegistrarDashboard /> : <ReviewerDashboard />}

          <footer className="officer-activity-bar">
            <span>Latest activity</span>
            <span className="officer-activity-bar__item">📄 {isRegistrar ? "Both parties confirmed deed v3" : "Document comparison flagged area discrepancy"}</span>
            <span className="officer-activity-bar__time">10 Oct 2026, {isRegistrar ? "6:20 PM" : "1:15 PM"}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
