import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Icon, Modal, Panel, formatINR, formatIST } from './SellerUI.jsx';
import { CORRECTION_TYPES, validateCorrectionFiles, validateListingEdit } from './listing-utils.mjs';
import './ListingManagement.css';

const statusLabels = { DRAFT: 'Draft · review required', UNDER_REVIEW: 'Under review', CHANGES_REQUIRED: 'Corrections required', APPROVED: 'Reviewer approved', PUBLISHED: 'Published', WITHDRAWN: 'Withdrawn', CLOSED: 'Closed' };
const hasAction = (listing, ...actions) => actions.some(action => listing?.allowed_actions?.some(value => value.toLowerCase() === action));

export default function ListingManagement({ service, listingId = 'LS-2041' }) {
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [batchStarted, setBatchStarted] = useState(false);
  const [modal, setModal] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const input = useRef(null);
  const type = useRef('SUPPORTING_EVIDENCE');
  const uploadVersion = useRef(null);
  const alive = useRef(true);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await service.getListing(listingId);
      if (alive.current) { setListing(next); setError(''); }
    } catch (failure) {
      if (alive.current) setError(failure.message || 'Unable to load listing.');
    } finally { refreshing.current = false; }
  }, [service, listingId]);

  useEffect(() => {
    alive.current = true;
    setListing(null);
    setFiles([]);
    refresh();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(visibleRefresh, 10000);
    window.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener('focus', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [refresh]);

  async function run(action, message) {
    if (busy) return;
    setBusy(true); setNotice(''); setError('');
    try {
      await action();
      if (alive.current) { setNotice(message); setModal(null); }
    } catch (failure) {
      if (alive.current) setNotice('');
      // Always refetch after a conflict or unknown transport outcome.
      await refresh();
      if (alive.current) setError((failure.message || 'Command outcome unknown. Refresh before trying again.') + (failure.partial ? ` ${failure.uploaded_documents.length} file(s) already saved privately. Retry the unchanged batch to resume; nothing was rolled back.` : ''));
      return;
    } finally { if (alive.current) setBusy(false); }
    await refresh();
  }

  function chooseFiles(documentType) { type.current = documentType; input.current.value = ''; input.current.click(); }
  function stageFiles(event) {
    const selected = [...event.target.files];
    if (!selected.length) return;
    const failure = validateCorrectionFiles(selected);
    if (failure) { setError(failure); return; }
    if (batchStarted) return;
    uploadVersion.current = null;
    setFiles(previous => [...previous, ...selected.map(file => ({ file, document_type: type.current }))]);
    setError(''); setNotice('Files selected locally. Assign each document type, then submit. Nothing has been uploaded yet.');
  }

  async function showEvidence(finding) {
    setModal({ kind: 'evidence', title: finding.title });
    setEvidence(null);
    try { const result = await service.getEvidence(listing.id, finding); if (alive.current) setEvidence(Array.isArray(result) ? result : result.evidence || []); }
    catch (failure) { if (alive.current) { setEvidence([]); setError(failure.message); } }
  }

  if (!listing) return <Panel><h1>Listing Verification &amp; <span>Management</span></h1>{error ? <><p className="ls-status ls-status--error" role="alert">{error}</p><Button onClick={refresh}>Retry loading</Button></> : <p role="status">Loading your listing…</p>}</Panel>;
  const editable = hasAction(listing, 'edit', 'edit_listing');
  const canUpload = hasAction(listing, 'upload_document', 'upload_documents', 'upload_corrections', 'upload') && !batchStarted;
  const canSubmit = hasAction(listing, 'submit_review', 'submit_corrections');
  const canPublish = hasAction(listing, 'publish', 'publish_listing');
  const approved = ['APPROVED', 'PUBLISHED'].includes(listing.status);
  const published = listing.status === 'PUBLISHED';
  const findings = listing.findings || [];
  const step = published ? 4 : approved ? 3 : ['DRAFT', 'CHANGES_REQUIRED'].includes(listing.status) ? 2 : 1;

  return <div className="listing-page" aria-busy={busy}>
    <p className="listing-breadcrumb ls-muted">Seller <span>/</span> My listings <span>/</span> {listing.id}</p>
    <div className="listing-heading"><div><h1>Listing Verification &amp; <span>Management</span></h1><p className="ls-muted">Review findings, resolve corrections, and manage publication.</p></div><Button disabled={!editable || busy} onClick={() => { setTitle(listing.title); setPrice(listing.asking_price_inr); setModal({ kind: 'edit', title: 'Edit listing' }); }}><Icon name="edit" />Edit listing</Button></div>
    {notice && <p className="ls-status" role="status">{notice}</p>}
    {error && <p className="ls-status ls-status--error" role="alert">{error}</p>}
    <Panel className="listing-summary"><img src="/assets/seller/residential-plot.webp" alt="Synthetic residential parcel outlined in cyan" /><div className="listing-summary__details"><h2>{listing.title}</h2><p className="ls-muted"><Icon name="pin" />{listing.location}<span>·</span>Survey {listing.survey}<span>·</span>{listing.area_display}</p></div><div className="listing-price"><span className="ls-muted">Asking price</span><strong>{formatINR(listing.asking_price_inr)}</strong></div><Badge tone={approved ? 'success' : 'warning'}><Icon name={approved ? 'check' : 'info'} />{statusLabels[listing.status] || listing.status}</Badge></Panel>
    <ol className="listing-steps" aria-label="Listing review stages">{['Submitted', 'Document checks', 'Corrections', 'Reviewer approval', 'Publish'].map((label, index) => <li key={label} className={`${index < step ? 'is-complete' : ''} ${index === step ? 'is-current' : ''}`} aria-current={index === step ? 'step' : undefined}><span className="listing-step__circle">{index < step ? <Icon name="check" /> : index + 1}</span><span>{label}</span></li>)}</ol>
    <div className="listing-columns">
      <Panel className="listing-findings"><div className="listing-panel-heading"><h2>Evidence-based findings</h2><span className="ls-muted">{listing.updated_at ? `Updated ${formatIST(listing.updated_at)}` : 'Update date unavailable'}</span></div>
        <div className="listing-findings__rows">{findings.length ? findings.map(finding => {
          const matches = finding.status === 'MATCHES_SOURCE';
          const missing = finding.status === 'EVIDENCE_MISSING';
          return <div key={finding.id} className="listing-finding"><span className={`listing-finding__icon ${matches ? 'is-success' : ''}`}><Icon name={matches ? 'check' : missing ? 'file' : 'info'} size={23} /></span><div><h3>{finding.title}</h3><p className="ls-muted">{finding.detail}</p></div>{matches ? <Button onClick={() => showEvidence(finding)}>View evidence<Icon name="arrow" size={17} /></Button> : <Button disabled={!canUpload || busy} onClick={() => chooseFiles(missing ? 'ENCUMBRANCE_CERTIFICATE' : 'LAND_RECORD')}>{missing ? 'Upload document' : 'Upload corrected record'}<Icon name="arrow" size={17} /></Button>}</div>;
        }) : <p className="ls-empty">No findings are available yet. Reviewer approval is still required.</p>}</div>
        <div className="listing-upload"><img src="/assets/seller/cloud-upload.webp" alt="" /><div><h3>Upload corrections</h3><p className="ls-muted">PDF, JPG or PNG <span>·</span> Up to 10 MB per file</p></div><Button disabled={!canUpload || busy} onClick={() => chooseFiles('SUPPORTING_EVIDENCE')}>Choose files</Button><input hidden ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={stageFiles} aria-label="Correction files" /></div>
        {files.length > 0 && <ul className="listing-files">{files.map((descriptor, index) => <li key={`${index}-${descriptor.file.name}`}><div><strong>{descriptor.file.name}</strong><small>{(descriptor.file.size / 1024).toFixed(1)} KB · {batchStarted ? 'batch pending confirmation' : 'not yet uploaded'}</small></div><label><span className="ls-sr-only">Document type for {descriptor.file.name}</span><select value={descriptor.document_type} disabled={busy || batchStarted} onChange={event => setFiles(previous => previous.map((item, i) => i === index ? { ...item, document_type: event.target.value } : item))}>{Object.entries(CORRECTION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Button disabled={busy || batchStarted} aria-label={`Remove ${descriptor.file.name}`} onClick={() => setFiles(previous => previous.filter((_, i) => i !== index))}><Icon name="x" size={16} /></Button></li>)}</ul>}
        {listing.blocked_reason && !canSubmit && <p className="ls-muted listing-blocked">{listing.blocked_reason}</p>}
        <div className="listing-submit"><Button variant="primary" disabled={busy || !canSubmit} onClick={() => setModal({ kind: 'submit', title: 'Submit corrections for review?' })}>{busy ? 'Processing…' : listing.status === 'DRAFT' ? 'Submit for review' : 'Submit corrections'}<Icon name="arrow" size={18} /></Button></div>
      </Panel>
      <div className="listing-right"><Panel className="listing-progress"><h2>Review progress</h2><ol>{(listing.review_progress || []).map((item, index) => {
        const state = item.status?.toLowerCase();
        const completed = ['completed', 'approved', 'published'].includes(state);
        const current = ['current', 'changes_required', 'under_review'].includes(state);
        return <li key={`${item.label}-${index}`} className={`is-${completed ? 'completed' : current ? 'current' : 'pending'}`}><span className="listing-progress__dot">{completed ? <Icon name="check" size={14} /> : current ? '!' : ''}</span><div><strong>{item.label}</strong>{current && <p className="ls-muted">{listing.status === 'UNDER_REVIEW' ? 'Awaiting document checks and reviewer decision.' : 'Resolve the items and resubmit.'}</p>}</div><time className="ls-muted">{formatIST(item.date)}</time></li>;
      })}</ol></Panel>
      <Panel className="listing-publication"><div className="listing-panel-heading"><h2>Publication controls</h2><Badge tone={published ? 'success' : 'neutral'}>{published ? 'Published' : 'Not published'}</Badge></div><p className="ls-muted">Publication unlocks after reviewer approval.</p><Button className="listing-publish" disabled={!canPublish || busy} onClick={() => setModal({ kind: 'publish', title: 'Publish this listing?' })}><Icon name="file" />Publish listing</Button><p className="ls-muted">{published ? 'Your parcel is visible in the marketplace. Availability remains backend-controlled.' : 'Your parcel is not visible in the marketplace.'}</p></Panel>
      <Panel className="listing-review-scope"><img src="/assets/seller/shield-lock.webp" alt="" /><p>Checks cover submitted evidence and recorded review scope. They do not guarantee legal title.</p></Panel></div>
    </div>
    <Modal open={Boolean(modal)} title={modal?.title || ''} onClose={() => { if (!busy) setModal(null); }}>
      {modal?.kind === 'evidence' && <>{evidence === null ? <p role="status">Loading authorised evidence…</p> : evidence.length ? evidence.map((item, index) => <div className="listing-evidence" key={index}><strong>{item.document_type || item.source || 'Source document'} · Page {item.page_number || item.page || '—'}</strong><blockquote>{item.quote || item.source_quote || item.text || 'No source quote was supplied.'}</blockquote></div>) : <p>No source references are currently available. Absence of evidence is not approval.</p>}<p className="ls-muted">Evidence remains private. In preview mode, all quotes are synthetic.</p></>}
      {modal?.kind === 'edit' && <form onSubmit={event => { event.preventDefault(); const failure = validateListingEdit(title, price); if (failure) { setError(failure); return; } run(() => service.updateListing(listing.id, { title: title.trim(), asking_price_inr: price }, listing.version), 'Listing updated. Earlier approval is invalidated; submit it for review again.'); }}><p className="ls-muted">Editing invalidates any previous approval. Parcel identifiers cannot be changed here.</p><label>Listing title<input value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={160} required disabled={busy} /></label><label>Asking price (INR)<input value={price} onChange={event => setPrice(event.target.value)} inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required disabled={busy} /></label>{error && <p role="alert" className="ls-status ls-status--error">{error}</p>}<div className="ls-dialog-actions"><Button disabled={busy} onClick={() => setModal(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></div></form>}
      {modal?.kind === 'submit' && <><p>{files.length ? `${files.length} file(s) will be uploaded privately, then this listing will be submitted for review.` : listing.status === 'CHANGES_REQUIRED' ? 'Choose correction files before submitting. Cancel this dialog and use Choose files to attach the required records.' : 'Submit this draft for document checks and reviewer assessment.'}</p><p className="ls-muted">Uploaded corrections do not resolve findings automatically. A reviewer must assess them before publication.</p>{error && <p role="alert">{error}</p>}<div className="ls-dialog-actions"><Button disabled={busy} onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" disabled={busy || (!files.length && listing.status === 'CHANGES_REQUIRED')} onClick={() => run(async () => { if (files.length) { const failure = validateCorrectionFiles(files.map(item => item.file)); if (failure) throw new Error(failure); uploadVersion.current ??= listing.version; setBatchStarted(true); try { await service.uploadCorrections(listing.id, files, uploadVersion.current); } catch (failure) { if (!failure.partial && !failure.outcome_unknown) { setBatchStarted(false); uploadVersion.current = null; } throw failure; } setFiles([]); setBatchStarted(false); uploadVersion.current = null; } const current = await service.getListing(listing.id); await service.submitCorrections(listing.id, current.version); }, 'Submitted for review. Publication remains locked until reviewer approval.')}>{busy ? 'Submitting…' : 'Confirm submission'}</Button></div></>}
      {modal?.kind === 'publish' && <><p>Your approved listing will become visible in the marketplace. The backend rechecks the current version, review and parcel availability.</p><div className="ls-dialog-actions"><Button disabled={busy} onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => run(() => service.publishListing(listing.id, listing.version), 'Listing published after backend confirmation.')}>Confirm publication</Button></div></>}
    </Modal>
  </div>;
}