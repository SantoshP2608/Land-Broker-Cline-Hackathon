import React, { useState } from 'react';
import { Badge, Button, Icon } from '../seller/SellerUI.jsx';

export function TransactionHeading({ title, highlight, subtitle, status, onBack, id = 'TRX-2025-1043' }) {
  const [copied, setCopied] = useState('');
  async function copyId() {
    try { await navigator.clipboard.writeText(id); setCopied('Copied transaction ID'); }
    catch { setCopied(`Copy unavailable. Transaction ID: ${id}`); }
  }
  return <div className="tx-heading">
    <div><Button className="tx-back" onClick={onBack}><span aria-hidden="true">←</span> Back to Transaction</Button><h1>{title} <span>{highlight}</span></h1><p>{subtitle}</p></div>
    <div className="tx-heading-meta"><Button className="tx-id" aria-label="Copy transaction ID" onClick={copyId}><span><small>Transaction ID</small><strong>{id}</strong></span><Icon name="file" size={16} /></Button><Badge tone="success"><Icon name="shield" size={16} />{status}</Badge></div>
    {copied && <p className="tx-copy-status" role="status">{copied}</p>}
  </div>;
}

export function ProgressSteps({ steps, current, compact = false }) {
  return <ol className={`tx-steps ${compact ? 'tx-steps--compact' : ''}`} aria-label={compact ? 'Review progress' : 'Transaction stages'}>{steps.map((step, i) => <li key={step.label} className={i < current ? 'is-complete' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}><span className="tx-step-number">{compact && i < current ? <Icon name="check" size={19} /> : i + 1}</span><strong>{step.label}</strong><small>{step.detail || (i === current ? 'Current Stage' : 'Pending')}</small></li>)}</ol>;
}

export function LandSummary({ compact = false, onOpen }) {
  return <div className={`tx-land ${compact ? 'tx-land--compact' : ''}`}>
    <img src="/assets/transactions/agricultural-land.webp" alt="Synthetic agricultural parcel from the supplied design" />
    <div className="tx-land-copy"><h3>Agricultural Land</h3><p><Icon name="pin" size={17} /> Narsingi, Hyderabad, Telangana</p><p><Icon name="file" size={17} /> Survey No. 123/2 <span>│</span> 2.5 Acres</p>{compact && <strong>₹ 45,00,000 <small>(per acre)</small></strong>}</div>
    {!compact && <div className="tx-land-price"><strong>₹ 45,00,000</strong><small>(per acre)</small></div>}
    {onOpen && <Button className="tx-land-open" onClick={onOpen} aria-label="View land details"><Icon name="arrow" size={18} /></Button>}
  </div>;
}

export function HelpCard({ onOpen }) {
  return <section className="tx-help"><Icon name="help" size={30} /><div><h3>Need Help?</h3><p>Learn about the process, required evidence, and review steps.</p><Button onClick={onOpen}>View Guide <Icon name="arrow" size={17} /></Button></div><img src="/assets/transactions/document-help.webp" alt="" /></section>;
}