import React, { useRef, useState } from 'react';
import { AccountFooter, Brand, DemoBadge, Icon } from './AccountShared.jsx';
import './ProfilePage.css';

export default function ProfilePage({ account, journey, onJourneyChange, onSignOut, onOpenPanel }) {
  const [details, setDetails] = useState({ name: account?.name || 'Santosh Pabolu', email: account?.email || 'santosh@example.com', mobile: '', location: 'Visakhapatnam, Andhra Pradesh' });
  const [documentType, setDocumentType] = useState('');
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeSection, setActiveSection] = useState('My profile');
  const fileRef = useRef(null);
  const evidenceRef = useRef(null);
  const personalRef = useRef(null);
  const reviewRef = useRef(null);
  const selectionVersion = useRef(0);
  const initials = details.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'DC';
  function edit(field, value) { setDetails(previous => ({ ...previous, [field]: value })); setReady(false); setMessage(''); }
  async function selectFile(candidate) {
    const version = ++selectionVersion.current;
    setFile(null); setReady(false); setError(''); setMessage(''); setChecking(false);
    if (!candidate) return;
    if (candidate.size > 10 * 1024 * 1024 || candidate.size === 0) { setError('Choose a non-empty sample file up to 10 MB.'); return; }
    if (!/\.(pdf|jpe?g|png)$/i.test(candidate.name) || !['application/pdf', 'image/jpeg', 'image/png', ''].includes(candidate.type)) { setError('Only sample PDF, JPG, or PNG files are supported.'); return; }
    setChecking(true);
    try {
      const bytes = new Uint8Array(await candidate.slice(0, 8).arrayBuffer());
      const pdf = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
      const valid = /\.pdf$/i.test(candidate.name) ? pdf : /\.png$/i.test(candidate.name) ? png : jpeg;
      if (version !== selectionVersion.current) return;
      if (!valid) { setError('The file content does not match its PDF/JPG/PNG extension. Choose a valid sample document.'); return; }
      setFile(candidate); setMessage('Sample file selected locally. It has not been uploaded.');
    } catch { if (version === selectionVersion.current) setError('This file could not be read. Please choose it again.'); }
    finally { if (version === selectionVersion.current) setChecking(false); }
  }
  function review(event) {
    event.preventDefault();
    if (!file) { setError('Choose sample identity evidence before reviewing.'); return; }
    setError(''); reviewRef.current.showModal();
  }
  function completePreview() {
    reviewRef.current.close(); setReady(true);
    setMessage('Demo submission ready — not sent to a reviewer. Identity remains unverified.');
  }
  function focusSection(label) {
    setActiveSection(label);
    const target = ['Identity verification', 'Documents'].includes(label) ? evidenceRef.current : personalRef.current;
    target?.scrollIntoView({ behavior: 'instant', block: 'center' }); target?.focus();
  }
  return <div className="account-shell profile-page">
    <header className="profile-header"><Brand /><nav aria-label="Dashboard navigation"><button className="is-active" onClick={() => focusSection('Dashboard')}>Dashboard</button><button onClick={() => onOpenPanel('marketplace')}>Marketplace</button><button onClick={() => onOpenPanel('transactions')}>My transactions</button></nav><div className="profile-header-actions"><div className="profile-context" role="group" aria-label="Journey context">{['buying', 'selling'].map(value => <button key={value} aria-pressed={journey === value} onClick={() => onJourneyChange(value)}><Icon name="swap" />{value === 'buying' ? 'Buying' : 'Selling'}</button>)}</div><span className="profile-avatar profile-avatar--small" aria-label="Demo account initials">{initials}</span><button className="account-link" onClick={onSignOut}>Sign out</button></div></header>
    <div className="profile-body"><aside className="profile-sidebar"><nav aria-label="Account sections">{[['Dashboard','home'],['My profile','user'],['Identity verification','shield'],['Documents','file'],['Settings','settings']].map(([label,icon]) => <button key={label} className={activeSection === label ? 'is-active' : ''} aria-current={activeSection === label ? 'page' : undefined} onClick={() => label === 'Settings' ? onOpenPanel('settings') : focusSection(label)}><Icon name={icon} />{label}</button>)}</nav><button className="profile-help" onClick={() => onOpenPanel('help')}><Icon name="help" />Help &amp; support</button></aside>
    <main className="profile-main"><div className="profile-demo-banner"><DemoBadge /><span>SIMULATED GOVERNMENT RECORDS · Use sample identity documents only.</span></div><p className="profile-breadcrumb">Account / My profile</p>
      <div className="profile-columns"><section className="profile-workspace" aria-labelledby="profile-title"><div className="profile-title-row"><h1 id="profile-title">Profile &amp; Identity <span className="account-gradient">Verification</span></h1><span className="profile-status">! {ready ? 'Demo ready' : 'Not submitted'}</span></div><p className="profile-subtitle">Complete your details and submit identity evidence for review.</p>
      <ol className="profile-steps" aria-label="Verification steps">{['Personal details','Identity evidence','Review & submit'].map((label,index) => <li key={label} className={index === (ready ? 2 : file ? 1 : 0) ? 'is-active' : ''}><span>{index + 1}</span>{label}</li>)}</ol>
      <form className="account-card profile-form" onSubmit={review}>
        <h2 ref={personalRef} tabIndex="-1">Personal details</h2><div className="profile-fields">{[['name','Full name','text'],['email','Email address','email'],['mobile','Mobile number','tel'],['location','Location','text']].map(([key,label,type]) => <label className="account-field" key={key}>{label}<input type={type} value={details[key]} onChange={event => edit(key,event.target.value)} required maxLength={key === 'email' ? 254 : 100} placeholder={key === 'mobile' ? '+91 ·········· (sample only)' : ''} pattern={key === 'name' || key === 'location' ? '.*\\S.*' : undefined} /></label>)}</div>
        <section className="profile-evidence" aria-labelledby="evidence-title"><h2 id="evidence-title" ref={evidenceRef} tabIndex="-1">Identity evidence</h2><label className="account-field profile-document">Document type<select aria-label="Document type" value={documentType} required onChange={event => { setDocumentType(event.target.value); setReady(false); setMessage(''); }}><option value="">Choose a document</option><option>Sample identity card</option><option>Sample passport</option><option>Sample driving licence</option></select></label>
        <div className={`profile-upload${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]); }}><img src="/assets/cloud-upload.png" alt="" /><div><strong>Upload sample identity evidence</strong><p>PDF, JPG or PNG · Up to 10 MB</p><input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-label="Sample identity evidence file" onChange={event => selectFile(event.target.files[0])} /><button type="button" className="account-button" onClick={() => fileRef.current.click()} disabled={checking}>{checking ? 'Checking file…' : 'Choose file'}</button>{file && <p className="profile-file-name">{file.name} <button type="button" className="account-link" onClick={() => { selectionVersion.current++; setFile(null); setReady(false); setMessage('Sample evidence removed.'); fileRef.current.value = ''; }}>Remove</button></p>}</div></div>
        <label className="profile-consent"><input type="checkbox" checked={consent} required onChange={event => { setConsent(event.target.checked); setReady(false); setMessage(''); }} />I consent to identity review for this demo using sample evidence only.</label></section>
        {error && <p className="profile-error" role="alert">{error}</p>}<p className="profile-message" role="status">{message}</p>
        <div className="profile-form-actions"><button type="button" className="account-button" onClick={() => setMessage('Draft kept in this page memory only. Refresh or sign out clears it.')}>Save draft</button><button type="submit" className="account-button account-button--primary" disabled={checking}>Submit for review<Icon name="arrow" /></button></div>
      </form></section>
      <aside className="profile-summary" aria-label="Identity summary"><section className="account-card profile-summary-person"><span className="profile-avatar">{initials}</span><div><h2>{details.name || 'Demo citizen'}</h2><p>One account for buying and selling.</p></div></section><section className="account-card profile-verification"><h2>Verification status</h2><ol><li><span>Personal details</span><strong>{ready ? 'Demo ready' : 'In progress'}</strong></li><li className={file ? 'has-evidence' : ''}><span>Evidence upload</span><strong>{file ? 'Local file only' : 'Required'}</strong></li><li><span>Reviewer decision</span><strong>Pending submission</strong></li></ol><p>{ready ? 'Demo preview only. No review request was sent and no identity approval was granted.' : 'Submission starts a review after backend integration. Eligibility updates only after approval.'}</p></section><section className="account-card profile-privacy"><img src="/assets/privacy-shield.png" alt="" /><div><h2>Demo privacy</h2><p>Use sample documents. Do not upload real identity numbers.</p></div></section></aside>
      </div>
    </main></div><AccountFooter onOpenPanel={onOpenPanel} />
    <dialog ref={reviewRef} className="home-preview-dialog profile-review" aria-labelledby="review-title"><form method="dialog"><button className="home-preview-dialog__close" aria-label="Close review">×</button></form><h2 id="review-title">Review sample submission</h2><p>Confirm these demo details before finishing the local preview.</p><dl><dt>Name</dt><dd>{details.name}</dd><dt>Email</dt><dd>{details.email}</dd><dt>Document type</dt><dd>{documentType}</dd><dt>Sample evidence</dt><dd>{file?.name}</dd></dl><p>No document will be uploaded and no reviewer decision will be issued. Identity remains unverified.</p><div className="profile-form-actions"><button className="account-button" onClick={() => reviewRef.current.close()}>Back to edit</button><button className="account-button account-button--primary" onClick={completePreview}>Finish demo preview</button></div></dialog>
  </div>;
}

