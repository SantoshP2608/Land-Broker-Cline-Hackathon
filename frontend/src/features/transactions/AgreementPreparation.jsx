import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Badge, Panel, Modal, Icon, formatINR } from '../seller/SellerUI.jsx';
import { TransactionHeading, ProgressSteps, LandSummary, HelpCard } from './TransactionUI.jsx';
import './AgreementPreparation.css';

const steps = [
  { label: 'Request Accepted', detail: '12 Oct 2025' },
  { label: 'Document Verification', detail: '14 Oct 2025' },
  { label: 'Discussion & Negotiate', detail: '16 Oct 2025' },
  { label: 'Agreement Preparation', detail: 'Current Stage' },
  { label: 'Registration Process', detail: 'Pending' },
  { label: 'Completion', detail: 'Pending' },
];
const tabs = [
  { label: 'Draft Agreement', icon: 'file' },
  { label: 'Terms & Conditions', icon: 'shield' },
  { label: 'Parties Confirmation', icon: 'users' },
  { label: 'Registration Application', icon: 'file' },
];
const paymentModes = ['Bank Transfer (via escrow)', 'Bank Transfer', 'Other agreed method'];
const titles = { edit: 'Edit agreed terms', register: 'Submit for registration?', fullscreen: 'Draft sale deed · synthetic preview', guide: 'Agreement & registration guide', checklist: 'Registration readiness checklist', details: 'Registration application details', land: 'Agricultural land · demonstration details' };

function isConfirmed(party, draftVersion) {
  return party?.confirmed === true && party.draft_version === draftVersion;
}

function toPaise(value) {
  const text = String(value).trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function decimalMoney(value) {
  const paise = toPaise(value);
  return paise === null ? '' : `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;
}

function SyntheticDeed({ agreement, page = 1, miniature = false }) {
  const { terms, draft } = agreement;
  return <article className={`agreement-deed${miniature ? ' agreement-deed--miniature' : ''}`} aria-label={miniature ? undefined : `Synthetic draft sale deed, page ${page} of 3`} aria-hidden={miniature || undefined}>
    <div className="agreement-deed__brand"><Icon name="shield" size={25} /><span>LANDSHIELD<br /><small>SYNTHETIC DOCUMENT PREVIEW</small></span></div>
    <p className="agreement-deed__disclaimer">DEMONSTRATION ONLY · NOT A LEGAL INSTRUMENT</p>
    <h3>{page === 1 ? 'DRAFT SALE DEED' : page === 2 ? 'TERMS OF SALE' : 'PARTIES & REGISTRATION'}</h3>
    <p className="agreement-deed__reference">{agreement.id} · {draft.id} · Draft version {draft.version}</p>
    {page === 1 && <>
      <p>This synthetic sale deed illustrates the proposed purchase of agricultural land. Execution date: to be agreed by the parties.</p>
      <p className="agreement-deed__center">BETWEEN</p>
      <p><strong>Mr. Ravi Kumar (Buyer)</strong><br />Demonstration party · identity record is simulated.</p>
      <p className="agreement-deed__center">AND</p>
      <p><strong>Mr. Suresh Reddy (Seller)</strong><br />Demonstration party · identity record is simulated.</p>
      <h4>1. PROPERTY DETAILS</h4>
      <dl><div><dt>Survey reference</dt><dd>123/2 (synthetic)</dd></div><div><dt>Locality</dt><dd>Narsingi, Hyderabad, Telangana</dd></div><div><dt>Total area</dt><dd>2.5 acres</dd></div><div><dt>Land type</dt><dd>Agricultural land</dd></div><div><dt>Proposed total</dt><dd>{formatINR(terms.total)}</dd></div></dl>
      <p>No address, title certificate, government seal, or legal approval is represented by this preview. The accompanying land artwork is illustrative.</p>
    </>}
    {page === 2 && <>
      <h4>2. CONSIDERATION & PAYMENT</h4>
      <dl><div><dt>Price per acre</dt><dd>{formatINR(terms.price_per_acre)}</dd></div><div><dt>Total consideration</dt><dd>{formatINR(terms.total)}</dd></div><div><dt>Advance recorded</dt><dd>{formatINR(terms.advance)}</dd></div><div><dt>Remaining amount</dt><dd>{formatINR(terms.remaining)}</dd></div><div><dt>Payment mode</dt><dd>{terms.payment_mode}</dd></div></dl>
      <p>The advance is a demo record only. No money has been transferred, paid, reserved, or held in escrow by this application.</p>
      <h4>3. AGREEMENT CONDITIONS</h4>
      <p>Both parties must review and confirm the same current draft version. Changes to any agreed term invalidate both prior confirmations.</p>
      <p>The remaining amount is proposed to be payable at registration, subject to independently agreed legal and financial arrangements.</p>
      <p>Stamp duty, registration fees, applicable taxes and eligibility must be checked with qualified local professionals. They are not calculated here.</p>
    </>}
    {page === 3 && <>
      <h4>4. PARTY CONFIRMATIONS</h4>
      <p>Buyer: {isConfirmed(agreement.confirmations.buyer, draft.version) ? `confirmed draft version ${draft.version}` : 'awaiting confirmation of this draft'}.</p>
      <p>Seller: {isConfirmed(agreement.confirmations.seller, draft.version) ? `confirmed draft version ${draft.version}` : 'awaiting independent seller confirmation'}.</p>
      <p>These are simulated workflow acknowledgements, not signatures or legally binding execution.</p>
      <h4>5. REGISTRATION PREPARATION</h4>
      <p>Registration requires current confirmations from both parties and a completed identity check. The mock submission does not contact a sub-registrar or government system.</p>
      <p>Original records, title review, execution, witnesses, appointment availability and registration requirements must be arranged independently.</p>
      <div className="agreement-deed__signatures"><span>Buyer · unsigned</span><span>Seller · unsigned</span></div>
      <p>This draft is generated from the currently displayed terms. It has no legal effect and must not be used as evidence of ownership.</p>
    </>}
    <footer>LandShield synthetic draft · version {draft.version}<span>Page {page} of 3</span></footer>
  </article>;
}

export default function AgreementPreparation({ service, onNavigate }) {
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ price_per_acre: '', advance: '', payment_mode: paymentModes[0] });
  const [formError, setFormError] = useState('');
  const [registrationConsent, setRegistrationConsent] = useState(false);
  const alive = useRef(false);
  const commandLock = useRef(false);
  const readVersion = useRef(0);
  const objectUrls = useRef(new Set());
  const tabRefs = useRef([]);
  const uid = useId();

  const load = useCallback(async () => {
    if (commandLock.current) return;
    const request = ++readVersion.current;
    setLoading(true);
    setError('');
    try {
      const next = await service.getAgreement();
      if (alive.current && request === readVersion.current) { setAgreement(next); setNeedsRefresh(false); }
    } catch (failure) {
      if (alive.current && request === readVersion.current) { setError(failure.message || 'Unable to load the agreement. Please retry.'); setNeedsRefresh(true); }
    } finally {
      if (alive.current && request === readVersion.current) setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    alive.current = true;
    setAgreement(null);
    setModal(null);
    setNotice('');
    load();
    return () => {
      alive.current = false;
      readVersion.current += 1;
      objectUrls.current.forEach(url => URL.revokeObjectURL(url));
      objectUrls.current.clear();
    };
  }, [load]);

  async function run(name, action, message) {
    if (commandLock.current || loading || needsRefresh) return;
    commandLock.current = true;
    setBusy(name);
    setError('');
    setFormError('');
    setNotice('');
    try {
      await action();
      const next = await service.getAgreement();
      if (alive.current) { setAgreement(next); setNotice(message); setNeedsRefresh(false); setModal(null); }
    } catch (failure) {
      let refreshed = false;
      try {
        const next = await service.getAgreement();
        if (alive.current) { setAgreement(next); refreshed = true; }
      } catch { /* A failed refresh must not enable commands against stale state. */ }
      if (alive.current) {
        setNeedsRefresh(!refreshed);
        setError(`${failure.message || 'The action could not be completed.'}${refreshed ? ' Current transaction state has been refreshed; review it before retrying.' : ' Refresh the transaction before trying again; the outcome may be unknown.'}`);
      }
    } finally {
      commandLock.current = false;
      if (alive.current) setBusy('');
    }
  }

  async function downloadDraft() {
    if (commandLock.current || loading || needsRefresh) return;
    commandLock.current = true;
    setBusy('download'); setError(''); setNotice('');
    let url;
    try {
      const blob = await service.downloadDraft();
      if (!(blob instanceof Blob) || !blob.size) throw new Error('The draft download is empty or unavailable.');
      if (!alive.current) return;
      url = URL.createObjectURL(blob);
      objectUrls.current.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LandShield-${agreement.id}-draft-v${agreement.draft.version}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setNotice('Synthetic draft PDF downloaded. It is a demonstration document, not a legally executed deed.');
      // Allow the browser to consume the URL before releasing the object.
      window.setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); }, 1500);
    } catch (failure) {
      if (alive.current) setError(failure.message || 'Unable to download the draft. Please retry Download PDF.');
      if (url) { URL.revokeObjectURL(url); objectUrls.current.delete(url); }
    } finally { commandLock.current = false; if (alive.current) setBusy(''); }
  }

  function openEdit() {
    setForm({ price_per_acre: agreement.terms.price_per_acre, advance: agreement.terms.advance, payment_mode: agreement.terms.payment_mode });
    setFormError(''); setError(''); setModal('edit');
  }

  function saveTerms(event) {
    event.preventDefault();
    const price = toPaise(form.price_per_acre);
    const advance = toPaise(form.advance);
    if (price === null || price <= 0n || advance === null) { setFormError('Enter a positive price and a non-negative advance, with at most two decimal places.'); return; }
    if (advance * 2n > price * 5n) { setFormError('The advance cannot exceed the total value for 2.5 acres.'); return; }
    if (!paymentModes.includes(form.payment_mode)) { setFormError('Choose one of the supported payment modes.'); return; }
    run('terms', () => service.updateTerms({ price_per_acre: decimalMoney(form.price_per_acre), advance: decimalMoney(form.advance), payment_mode: form.payment_mode }, agreement.version), 'Terms updated. A new draft was created and both confirmations were invalidated. You can confirm as buyer; the seller must confirm independently.');
  }

  function moveTab(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault(); setTab(next); tabRefs.current[next]?.focus();
  }

  const locked = Boolean(busy) || loading || needsRefresh;
  const buyerConfirmed = agreement && isConfirmed(agreement.confirmations.buyer, agreement.draft.version);
  const sellerConfirmed = agreement && isConfirmed(agreement.confirmations.seller, agreement.draft.version);
  const submitted = agreement?.registration_status === 'SUBMITTED';
  const editable = agreement?.status === 'AGREEMENT_PREPARATION' && !submitted;
  const canSubmit = editable && buyerConfirmed && sellerConfirmed && agreement.identity_confirmed;
  const checklist = agreement ? [
    { label: 'Both parties have reviewed the draft deed', complete: buyerConfirmed && sellerConfirmed, description: 'Each party acknowledges their review by confirming the current draft version.' },
    { label: 'Price and terms agreed by both parties', complete: buyerConfirmed && sellerConfirmed, description: 'Any terms edit clears both confirmations. Only the other party can supply their own confirmation.' },
    { label: 'Same current deed confirmed by both parties', complete: buyerConfirmed && sellerConfirmed, description: `The required draft version is ${agreement.draft.version}. Earlier draft confirmations are not accepted.` },
    { label: 'Identity verification completed', complete: agreement.identity_confirmed, description: 'This local identity-check flag is simulated. It is not a government or real identity verification.' },
    { label: 'Registration application submitted', complete: submitted, description: 'Mock submission advances the demonstration workflow only; no application reaches a government system.' },
  ] : [];

  function TermsCard({ expanded = false }) {
    const rows = [
      ['Agreed Price', formatINR(agreement.terms.price_per_acre), 'per acre', 'info', 'green'],
      ['Total Value', formatINR(agreement.terms.total), '2.5 acres', 'list', 'gold'],
      ['Payment Mode', agreement.terms.payment_mode, '', 'list', 'blue'],
      ['Advance Amount', formatINR(agreement.terms.advance), 'demo recorded, not paid', 'check', 'green'],
      ['Remaining Amount', formatINR(agreement.terms.remaining), 'proposed at registration', 'clock', 'gold'],
    ];
    return <Panel className={`agreement-terms${expanded ? ' agreement-terms--expanded' : ''}`}>
      <div className="agreement-card-heading"><h2>Agreed Terms</h2><Button className="agreement-small-button" aria-label="Edit agreed terms" disabled={locked || !editable} onClick={openEdit}><Icon name="edit" size={14} />Edit</Button></div>
      <dl className="agreement-term-list">{rows.map(([label, value, detail, icon, tone]) => <div key={label}><dt><span className={`agreement-term-icon agreement-term-icon--${tone}`}><Icon name={icon} size={18} /></span>{label}</dt><dd><strong>{value}</strong>{detail && <small>{detail}</small>}</dd></div>)}</dl>
      {expanded && <div className="agreement-conditions"><h3>Terms & conditions</h3><ol><li>Both parties must confirm the same current draft before registration preparation can proceed.</li><li>Editing terms creates a new draft and invalidates both party confirmations.</li><li>Only the buyer can confirm here. The seller must independently confirm in their own session.</li><li>No real funds or escrow are handled. Stamp duty, taxes, execution and professional legal review are outside this demo.</li></ol><p>Current draft: <strong>Version {agreement.draft.version}</strong> · Current record: <strong>Version {agreement.version}</strong></p></div>}
    </Panel>;
  }

  function PartiesCard({ expanded = false }) {
    return <Panel className={`agreement-parties${expanded ? ' agreement-parties--expanded' : ''}`}>
      <h2>Parties Confirmation</h2>
      <div className="agreement-party-list">{[['buyer', 'R', 'Ravi Kumar (You)', 'Buyer', buyerConfirmed], ['seller', 'S', 'Suresh Reddy', 'Seller', sellerConfirmed]].map(([key, initial, name, role, confirmed]) => <div className="agreement-party" key={key}><span className="agreement-avatar" aria-hidden="true">{initial}</span><div className="agreement-party__name"><strong>{name}</strong><small>{role}</small></div><Badge tone={confirmed ? 'success' : 'warning'}>{confirmed ? 'Confirmed' : 'Awaiting'}{confirmed && <Icon name="check" size={14} />}</Badge><small className="agreement-party__date">{confirmed ? agreement.confirmations[key].date || `Draft v${agreement.draft.version}` : 'Current draft'}</small></div>)}</div>
      {buyerConfirmed && sellerConfirmed ? <p className="agreement-confirmed-note"><span><Icon name="check" size={23} /></span>Both parties have confirmed the same current deed and agreed terms.</p> : <div className="agreement-pending-note"><p>Confirmations must match draft version {agreement.draft.version}.</p>{!buyerConfirmed && <Button variant="primary" disabled={locked || !editable} onClick={() => run('confirm', () => service.confirmDeed(agreement.version, agreement.draft.version), 'Buyer confirmation recorded for the current draft. Seller confirmation can only be provided independently by the seller.')}>{busy === 'confirm' ? 'Confirming…' : 'Confirm as Buyer'}</Button>}{!sellerConfirmed && <p className="agreement-other-party"><Icon name="lock" size={15} />Awaiting independent seller confirmation. You cannot confirm on the seller’s behalf.</p>}</div>}
      {expanded && <p className="agreement-explanation">Confirmations are simulated workflow acknowledgements, not legal signatures. Editing any term clears both confirmations. Buyer confirmation alone cannot submit the application.</p>}
    </Panel>;
  }

  function RegistrationCard({ expanded = false }) {
    return <Panel className={`agreement-registration${expanded ? ' agreement-registration--expanded' : ''}`}>
      <div className="agreement-card-heading"><h2>Registration Application</h2><Button className="agreement-text-button" onClick={() => setModal('details')}>View Details<Icon name="arrow" size={17} /></Button></div>
      <div className={`agreement-registration-status${submitted ? ' agreement-registration-status--submitted' : ''}`}><span><Icon name={submitted ? 'check' : 'clock'} size={22} /></span><strong>{submitted ? 'Submitted · demo' : 'Not Yet Submitted'}</strong></div>
      <p>{submitted ? 'Your mock application is recorded. The demonstration is now in Registration Process; no government submission has been made.' : 'Once both parties confirm the same current draft and the identity check is complete, the demo application can be submitted.'}</p>
      {!submitted && !canSubmit && <p className="agreement-registration-reason">{!editable ? 'This transaction is not in agreement preparation.' : !buyerConfirmed || !sellerConfirmed ? 'Waiting for current buyer and seller confirmations.' : 'The identity check is not complete.'}</p>}
      {expanded && <dl className="agreement-detail-list"><div><dt>Transaction</dt><dd>{agreement.id}</dd></div><div><dt>Current draft</dt><dd>{agreement.draft.id} · version {agreement.draft.version}</dd></div><div><dt>Identity check</dt><dd>{agreement.identity_confirmed ? 'Completed · simulated' : 'Pending'}</dd></div><div><dt>Registration</dt><dd>{submitted ? 'Submitted · simulated' : 'Not submitted'}</dd></div></dl>}
      <Button variant="primary" className="agreement-submit-button" disabled={locked || !canSubmit} onClick={() => { setRegistrationConsent(false); setError(''); setModal('register'); }}><Icon name={submitted ? 'check' : 'arrow'} size={21} />{busy === 'register' ? 'Submitting…' : submitted ? 'Application Submitted' : 'Submit for Registration'}{!submitted && <Icon name="arrow" size={19} />}</Button>
    </Panel>;
  }

  return <div className="agreement-page" aria-busy={loading || Boolean(busy)}>
    <TransactionHeading title="Agreement &" highlight="Registration Preparation" subtitle="Review the draft agreement, confirm details, and proceed to registration preparation." status={submitted ? 'Registration Pending' : 'Agreement Stage'} id={agreement?.id || 'TRX-2025-1043'} onBack={() => onNavigate?.('/transactions/TRX-2025-1043')} />
    <ProgressSteps steps={submitted ? steps.map((step, index) => index === 3 ? { ...step, detail: 'Completed · demo' } : index === 4 ? { ...step, detail: 'Current Stage' } : step) : steps} current={submitted ? 4 : 3} />
    {notice && <p className="agreement-notice" role="status"><Icon name="check" size={18} />{notice}</p>}
    {error && <div className="agreement-error" role="alert"><p>{error}</p><Button disabled={loading || Boolean(busy)} onClick={load}>{loading ? 'Refreshing…' : agreement ? 'Refresh transaction' : 'Retry loading agreement'}</Button></div>}
    {loading && !agreement && <Panel className="agreement-loading"><Icon name="clock" size={28} /><h2>Loading agreement…</h2><p role="status">Fetching the current draft, terms and party confirmations.</p></Panel>}
    {!loading && !agreement && !error && <Panel><p>No agreement is available. Please retry.</p><Button onClick={load}>Retry loading agreement</Button></Panel>}
    {agreement && <div className="agreement-columns">
      <div className="agreement-main-column">
        <LandSummary compact={false} onOpen={() => setModal('land')} />
        <div className="agreement-tabs" role="tablist" aria-label="Agreement preparation sections">{tabs.map((item, index) => <button type="button" key={item.label} ref={element => { tabRefs.current[index] = element; }} id={`${uid}-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls={`${uid}-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => moveTab(event, index)}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</div>
        {tabs.map((item, index) => <div className="agreement-tab-panel" key={item.label} role="tabpanel" id={`${uid}-panel-${index}`} aria-labelledby={`${uid}-tab-${index}`} tabIndex={0} hidden={tab !== index}>
          {index === 0 && tab === 0 && <div className="agreement-draft-grid">
            <Panel className="agreement-draft-panel">
              <div className="agreement-draft-toolbar"><div className="agreement-draft-title"><h2>Draft Sale Deed</h2><Badge tone="success"><Icon name="check" size={14} />Simulated check</Badge></div><div className="agreement-draft-actions"><Button className="agreement-small-button" disabled={locked} onClick={downloadDraft}><Icon name="file" size={14} />{busy === 'download' ? 'Downloading…' : 'Download PDF'}</Button><Button className="agreement-small-button agreement-fullscreen-button" aria-label="Open fullscreen draft deed" onClick={() => setModal('fullscreen')}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg></Button></div></div>
              <div className="agreement-deed-viewer"><div className="agreement-thumbnails" role="group" aria-label="Draft deed pages">{[1, 2, 3].map(number => <button type="button" className={page === number ? 'is-selected' : ''} key={number} aria-label={`View draft page ${number}`} aria-pressed={page === number} onClick={() => setPage(number)}><span className="agreement-thumbnail-paper"><SyntheticDeed agreement={agreement} page={number} miniature /></span><span>{number}</span></button>)}</div><div className="agreement-deed-sheet"><SyntheticDeed agreement={agreement} page={page} /></div></div>
              <p className="agreement-preview-caption">Live synthetic preview · {agreement.draft.id} · version {agreement.draft.version} · page {page}/3</p>
            </Panel>
            <div className="agreement-draft-side"><TermsCard /><Panel className="agreement-checklist"><div className="agreement-card-heading"><h2>Checklist</h2><Button className="agreement-text-button" aria-label="View registration readiness checklist" onClick={() => setModal('checklist')}>{checklist.filter(item => item.complete).length}/5 completed</Button></div><ul>{checklist.map(item => <li key={item.label}><button type="button" onClick={() => setModal('checklist')}><span className={`agreement-check-dot${item.complete ? ' is-complete' : ''}`}><Icon name={item.complete ? 'check' : 'clock'} size={12} /></span><span>{item.label}</span><Icon name="chevron" size={13} /></button></li>)}</ul></Panel></div>
          </div>}
          {index === 1 && tab === 1 && <TermsCard expanded />}
          {index === 2 && tab === 2 && <PartiesCard expanded />}
          {index === 3 && tab === 3 && <RegistrationCard expanded />}
        </div>)}
      </div>
      <aside className="agreement-sidebar" aria-label="Confirmation and registration summary"><PartiesCard /><RegistrationCard /><HelpCard onOpen={() => setModal('guide')} /></aside>
    </div>}
    <Modal open={Boolean(modal)} title={titles[modal] || ''} onClose={() => { if (!commandLock.current) setModal(null); }}>
      {agreement && <div className="agreement-modal-content">
        {modal === 'edit' && <form onSubmit={saveTerms}><p>Changing terms creates a new draft and invalidates <strong>both</strong> confirmations. You can only re-confirm as buyer; the seller must independently review and confirm.</p><label htmlFor={`${uid}-price`}>Price per acre (INR)<input id={`${uid}-price`} name="price_per_acre" inputMode="decimal" value={form.price_per_acre} onChange={event => setForm(previous => ({ ...previous, price_per_acre: event.target.value }))} required maxLength={15} pattern="[0-9]+(\.[0-9]{1,2})?" disabled={locked || !editable} /></label><label htmlFor={`${uid}-advance`}>Advance amount (INR) · demo record only<input id={`${uid}-advance`} name="advance" inputMode="decimal" value={form.advance} onChange={event => setForm(previous => ({ ...previous, advance: event.target.value }))} required maxLength={15} pattern="[0-9]+(\.[0-9]{1,2})?" disabled={locked || !editable} /></label><label htmlFor={`${uid}-payment`}>Payment mode<select id={`${uid}-payment`} name="payment_mode" value={form.payment_mode} onChange={event => setForm(previous => ({ ...previous, payment_mode: event.target.value }))} disabled={locked || !editable}>{paymentModes.map(mode => <option key={mode}>{mode}</option>)}</select></label><p className="agreement-modal-note">Total value is recalculated for 2.5 acres. No real payment or escrow is created.</p>{(formError || error) && <p className="agreement-form-error" role="alert">{formError || error}</p>}<div className="agreement-modal-actions"><Button disabled={Boolean(busy)} onClick={() => setModal(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={locked || !editable}>{busy === 'terms' ? 'Saving…' : 'Save terms'}</Button></div></form>}
        {modal === 'register' && <><p>Submit the mock application for <strong>{agreement.id}</strong> using current draft <strong>version {agreement.draft.version}</strong>?</p><p>The service rechecks both parties’ confirmations, the identity check and the current transaction version. A successful demo submission moves this transaction to Registration Process.</p><p className="agreement-modal-note">This is a local simulation. Nothing will be submitted to a sub-registrar; no fees are collected and no appointment is booked.</p><label className="agreement-consent"><input type="checkbox" checked={registrationConsent} disabled={locked} onChange={event => setRegistrationConsent(event.target.checked)} /><span>I understand this is a simulated registration submission.</span></label>{error && <p className="agreement-form-error" role="alert">{error}</p>}<div className="agreement-modal-actions"><Button disabled={Boolean(busy)} onClick={() => setModal(null)}>Cancel</Button><Button variant="primary" disabled={locked || !canSubmit || !registrationConsent} onClick={() => run('register', () => service.submitRegistration(agreement.version, agreement.draft.version), 'Mock application submitted. Registration is pending in the demonstration workflow; no government filing was made.')}>{busy === 'register' ? 'Submitting…' : 'Confirm registration submission'}</Button></div></>}
        {modal === 'fullscreen' && <div className="agreement-print"><div className="agreement-print-toolbar"><p>Three-page live draft · version {agreement.draft.version}. Not a legal instrument.</p><Button onClick={() => window.print()}><Icon name="file" size={17} />Print synthetic deed</Button><Button disabled={locked} onClick={downloadDraft}>{busy === 'download' ? 'Downloading…' : 'Download PDF'}</Button></div>{[1, 2, 3].map(number => <SyntheticDeed key={number} agreement={agreement} page={number} />)}</div>}
        {modal === 'guide' && <><p>Review the draft and agreed terms before proceeding. All records and checks on this page are synthetic.</p><ol className="agreement-guide-list"><li><strong>Review all three pages.</strong> Check parcel details, consideration and conditions. Download or print the synthetic draft for review.</li><li><strong>Agree terms.</strong> Editing terms creates a new version and clears both confirmations.</li><li><strong>Confirm separately.</strong> You confirm as buyer. The seller must independently confirm the same current version.</li><li><strong>Check readiness.</strong> Both confirmations and the simulated identity flag are required.</li><li><strong>Prepare registration.</strong> The demo submission records a mock application only. Consult a qualified professional for genuine title verification and registration.</li></ol><p className="agreement-modal-note">LandShield does not provide legal advice, official verification, escrow services or government registration in this demonstration.</p></>}
        {modal === 'checklist' && <ul className="agreement-checklist-details">{checklist.map(item => <li key={item.label}><Badge tone={item.complete ? 'success' : 'warning'}>{item.complete ? 'Complete · demo' : 'Pending'}</Badge><h3>{item.label}</h3><p>{item.description}</p></li>)}</ul>}
        {modal === 'details' && <><dl className="agreement-detail-list"><div><dt>Transaction ID</dt><dd>{agreement.id}</dd></div><div><dt>Draft</dt><dd>{agreement.draft.id} · version {agreement.draft.version}</dd></div><div><dt>Application status</dt><dd>{submitted ? 'Submitted · demo' : 'Not yet submitted'}</dd></div><div><dt>Buyer confirmation</dt><dd>{buyerConfirmed ? 'Current draft confirmed' : 'Awaiting current draft'}</dd></div><div><dt>Seller confirmation</dt><dd>{sellerConfirmed ? 'Current draft confirmed' : 'Awaiting independent seller confirmation'}</dd></div><div><dt>Identity check</dt><dd>{agreement.identity_confirmed ? 'Completed · simulated' : 'Pending'}</dd></div><div><dt>Total consideration</dt><dd>{formatINR(agreement.terms.total)}</dd></div></dl><p className="agreement-modal-note">No official application number, appointment or government acknowledgement is generated. This is a synthetic workflow record.</p></>}
        {modal === 'land' && <><img className="agreement-land-art" src="/assets/transactions/agricultural-land.webp" alt="Synthetic artwork of green agricultural land, not the actual listed parcel" /><h3>Agricultural Land · 2.5 acres</h3><p>Narsingi, Hyderabad, Telangana · Survey reference 123/2 (synthetic).</p><p>Price per acre: <strong>{formatINR(agreement.terms.price_per_acre)}</strong></p><p className="agreement-modal-note">All parcel details and artwork are illustrative. No actual land availability, ownership, title or surveyed boundary is asserted.</p></>}
        {modal !== 'edit' && modal !== 'register' && <div className="agreement-modal-actions agreement-print-hide"><Button onClick={() => setModal(null)} disabled={Boolean(busy)}>Close</Button></div>}
      </div>}
    </Modal>
  </div>;
}