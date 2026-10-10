import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Badge, Panel, Modal, Icon, formatINR } from '../seller/SellerUI.jsx';
import { TransactionHeading, ProgressSteps, LandSummary, HelpCard } from './TransactionUI.jsx';
import './CancellationResolution.css';

const STAGES = [
  { label: 'Request Accepted', detail: '12 Oct 2025' },
  { label: 'Under Discussion', detail: 'Current Stage' },
  { label: 'Evidence Review', detail: 'Pending' },
  { label: 'Authority Decision', detail: 'Pending' },
  { label: 'Final Status', detail: 'Pending' },
];

const DOCUMENTS = [
  { id: 'D1', label: 'Sale Deed', detail: '(Draft)', name: 'Sale deed (draft)', text: 'SYNTHETIC DOCUMENT — NOT A LEGAL INSTRUMENT\n\nDraft sale deed for the demonstration agricultural parcel, Survey No. 123/2, Narsingi, Hyderabad, Telangana. Extent: 2.5 acres. Buyer: Ravi Kumar. Seller: Suresh Reddy.\n\nThis illustrative draft is not signed or registered. No ownership, payment, registration, or approval is established by viewing it.' },
  { id: 'D2', label: 'Encumbrance', detail: 'Certificate', name: 'Encumbrance certificate', text: 'SYNTHETIC CERTIFICATE — FOR DEMONSTRATION ONLY\n\nIllustrative encumbrance-certificate reference for Survey No. 123/2. A discrepancy was raised by the buyer and a response was supplied by the seller.\n\nAuthenticity and any discrepancy remain subject to authority review. This example is not a verified certificate or title opinion.' },
  { id: 'D3', label: 'Survey Map', detail: '', name: 'Survey map', text: 'SYNTHETIC SURVEY REFERENCE\n\nAgricultural land • Survey No. 123/2 • 2.5 acres\nNarsingi, Hyderabad, Telangana\n\nThis text represents a demonstration survey reference. It is not a cadastral map, boundary confirmation, or survey approval.' },
  { id: 'D4', label: 'Conversation', detail: 'Records', name: 'Conversation records', text: 'SYNTHETIC CONVERSATION RECORD\n\n15 Oct 2025 — Ravi Kumar (Buyer) requested cancellation because of an encumbrance-certificate discrepancy.\n16 Oct 2025 — Suresh Reddy (Seller) responded and requested that the transaction continue.\n\nThe disagreement remains under review. Messages entered in this demonstration are local only and do not represent a response or decision from an authority.' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

function errorText(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback;
}

function validSnapshot(value) {
  return value && typeof value.id === 'string' && Number.isInteger(value.version)
    && Array.isArray(value.evidence) && Array.isArray(value.response_evidence)
    && Array.isArray(value.messages);
}

function validateFiles(files) {
  if (!files.length) return 'Choose at least one additional evidence file.';
  if (files.length > 10) return 'Choose no more than 10 files in one batch.';
  for (const file of files) {
    if (!(file instanceof File)) return 'Select valid files from your device.';
    const extension = file.name.split('.').pop().toLowerCase();
    if (!file.name.trim() || file.name.trim() !== file.name || !/^[^<>:"/\\|?*\u0000-\u001f]+$/.test(file.name)
      || !/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      return `${file.name || 'This file'} has an invalid filename. Use a PDF, JPEG, or PNG extension.`;
    }
    if (FILE_TYPES[extension] !== file.type) return `${file.name}: the file type must match its PDF, JPEG, or PNG extension.`;
    if (!file.size || file.size > MAX_FILE_SIZE) return `${file.name}: files must be non-empty and no larger than 10 MiB each.`;
  }
  return '';
}

function fileSize(bytes) {
  if (!Number.isFinite(bytes)) return 'Synthetic document';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

export default function CancellationResolution({ service, onNavigate = () => {} }) {
  const prefix = useId();
  const [cancellation, setCancellation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceAttempt, setEvidenceAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [uploadReview, setUploadReview] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const lifecycle = ++lifecycleRef.current;
    busyRef.current = false;
    setBusy(false);
    setCancellation(null);
    setModal(null);
    setDraft('');
    setFiles([]);
    setActionError('');
    setNotice('');
    return () => {
      mountedRef.current = false;
      if (lifecycleRef.current === lifecycle) lifecycleRef.current += 1;
    };
  }, [service]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    async function load() {
      try {
        if (typeof service?.getCancellation !== 'function') throw new Error('The cancellation simulation is unavailable. Please retry.');
        const result = await service.getCancellation();
        if (!validSnapshot(result)) throw new Error('The cancellation simulation returned an invalid record. Please retry.');
        if (active) setCancellation(result);
      } catch (error) {
        if (active) setLoadError(errorText(error, 'Unable to load the cancellation request. Please retry.'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [service, loadAttempt]);

  useEffect(() => {
    let active = true;
    setEvidence(null);
    setEvidenceError('');
    setEvidenceLoading(false);
    if (!modal || !['evidence', 'documents'].includes(modal.kind) || !selectedDocument) return undefined;
    if (modal.kind === 'documents') {
      setEvidence(DOCUMENTS.find(document => document.id === selectedDocument) || null);
      return undefined;
    }
    setEvidenceLoading(true);
    async function loadEvidence() {
      try {
        if (typeof service?.getEvidence !== 'function') throw new Error('Synthetic evidence is unavailable. Please retry.');
        const result = await service.getEvidence(selectedDocument);
        if (!result || typeof result.name !== 'string' || typeof result.text !== 'string') throw new Error('Synthetic evidence could not be displayed. Please retry.');
        if (active) setEvidence(result);
      } catch (error) {
        if (active) setEvidenceError(errorText(error, 'Unable to view this synthetic evidence. Please retry.'));
      } finally {
        if (active) setEvidenceLoading(false);
      }
    }
    void loadEvidence();
    return () => { active = false; };
  }, [service, modal, selectedDocument, evidenceAttempt]);

  const withdrawalRequested = cancellation?.withdrawal_requested || cancellation?.status === 'WITHDRAWAL_REQUESTED';
  const disabled = busy || loading || !cancellation || Boolean(loadError);
  const response = cancellation?.response;
  const reviewSteps = [
    { label: 'Request Submitted', detail: cancellation?.requested_at || '15 Oct 2025' },
    { label: 'Other Party Responded', detail: response?.date || '16 Oct 2025' },
    { label: 'Under Review', detail: 'Current Stage' },
    { label: 'Authority Decision', detail: 'Pending' },
    { label: 'Final Status', detail: 'Pending' },
  ];

  function openModal(kind, options = {}) {
    if (busyRef.current) return;
    setActionError('');
    setFileError('');
    setUploadReview(false);
    setModal({ kind, ...options });
    setSelectedDocument(options.selectedId || options.documents?.[0]?.id || DOCUMENTS[0].id);
  }

  function closeModal() {
    if (busyRef.current) return;
    setModal(null);
    setActionError('');
    setFileError('');
    setFiles([]);
    setUploadReview(false);
  }

  async function runOperation(work, successText, afterCommit) {
    if (busyRef.current || disabled) return;
    const lifecycle = lifecycleRef.current;
    busyRef.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    let committed = false;
    try {
      const result = await work();
      committed = true;
      if (!mountedRef.current || lifecycle !== lifecycleRef.current) return;
      if (validSnapshot(result)) setCancellation(result);
      afterCommit?.(result);
      setNotice(successText);
      const latest = await service.getCancellation();
      if (!validSnapshot(latest)) throw new Error('The updated simulation record could not be loaded.');
      if (mountedRef.current && lifecycle === lifecycleRef.current) setCancellation(latest);
    } catch (error) {
      if (!mountedRef.current || lifecycle !== lifecycleRef.current) return;
      if (committed) {
        setModal(null);
        setLoadError(`${errorText(error, 'The updated record could not be loaded.')} The local action was saved; reload the record before taking another action.`);
      } else {
        setActionError(errorText(error, 'The local action could not be completed. Please retry.'));
      }
    } finally {
      if (mountedRef.current && lifecycle === lifecycleRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function requestWithdrawal() {
    if (withdrawalRequested) return;
    void runOperation(async () => {
      if (typeof service?.withdrawCancellation !== 'function') throw new Error('Withdrawal simulation is unavailable. Please retry.');
      return service.withdrawCancellation(cancellation.version);
    }, 'Withdrawal requested in the local simulation. Authority decision is pending; the transaction has not resumed.', () => {
      setCancellation(previous => ({ ...previous, withdrawal_requested: true, status: 'WITHDRAWAL_REQUESTED' }));
      setModal(null);
    });
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 2000) {
      setActionError('Enter a message between 1 and 2,000 characters.');
      return;
    }
    void runOperation(async () => {
      if (typeof service?.sendMessage !== 'function') throw new Error('Message simulation is unavailable. Please retry.');
      return service.sendMessage(text, cancellation.version);
    }, 'Message saved locally for this demonstration. Nothing was sent to a server or an authority.', () => {
      setDraft('');
    });
  }

  function selectFiles(event) {
    const selected = Array.from(event.target.files || []);
    setFiles(selected);
    setFileError(selected.length ? validateFiles(selected) : '');
    setActionError('');
    setUploadReview(false);
  }

  function uploadEvidence() {
    const validation = validateFiles(files);
    if (validation) {
      setFileError(validation);
      setUploadReview(false);
      return;
    }
    void runOperation(async () => {
      if (typeof service?.uploadEvidence !== 'function') throw new Error('Evidence simulation is unavailable. Please retry.');
      return service.uploadEvidence(files, cancellation.version);
    }, 'Additional evidence metadata added to the local simulation. No file was uploaded to a server; review and authority decision remain pending.', () => {
      setFiles([]);
      setUploadReview(false);
      setModal(null);
    });
  }

  const modalTitle = modal?.kind === 'withdraw' ? 'Request withdrawal of cancellation?'
    : modal?.kind === 'message' ? 'Send a Message'
      : modal?.kind === 'upload' ? 'Upload Additional Evidence'
        : modal?.kind === 'documents' ? 'Transaction Documents'
          : modal?.kind === 'land' ? 'Land Details'
            : modal?.kind === 'guide' ? 'Cancellation & Resolution Guide'
              : modal?.title || 'Supporting Evidence';

  return (
    <div className="cancellation-page" aria-busy={busy || loading}>
      <TransactionHeading title="Cancellation /" highlight="Hold & Resolution"
        subtitle="Request a cancellation, respond to the other party, and resolve with verified evidence."
        status={withdrawalRequested ? 'Withdrawal Requested' : 'Cancellation Requested'}
        id={cancellation?.id || 'TRX-2025-1043'} onBack={() => onNavigate('/transactions/TRX-2025-1043')} />

      <div className="cancellation-stages" aria-label="Transaction stages">
        <ProgressSteps steps={STAGES} current={1} />
      </div>

      {notice && <p className="cancellation-notice" role="status">{notice}</p>}
      {loadError && <div className="cancellation-error" role="alert"><Icon name="info" /><div><strong>Unable to load the request</strong><p>{loadError}</p></div><Button disabled={busy || loading} onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry loading</Button></div>}
      {loading && <Panel className="cancellation-loading"><Icon name="clock" /><p role="status">Loading cancellation request…</p></Panel>}

      {cancellation && !loading && <div className="cancellation-columns">
        <div className="cancellation-main-column">
          <Panel className="cancellation-request-panel" aria-labelledby={`${prefix}-request-heading`}>
            <div className="cancellation-section">
              <span className="cancellation-icon-circle cancellation-icon-circle--red"><Icon name="info" size={25} /></span>
              <div className="cancellation-section-content">
                <div className="cancellation-section-heading"><h2 id={`${prefix}-request-heading`}>Cancellation Request</h2><Badge tone="warning"><Icon name="clock" size={13} />{withdrawalRequested ? 'Withdrawal Pending' : 'Pending Resolution'}</Badge></div>
                <p className="cancellation-description">{withdrawalRequested ? 'Withdrawal has been requested. The cancellation remains under review until an authority makes a decision.' : 'You have requested cancellation for this transaction. The other party has responded. The request is under review.'}</p>
                <div className="cancellation-reason-box">
                  <div className="cancellation-reason-heading"><h3>Reason for Cancellation</h3><span><Icon name="user" size={15} />Ravi Kumar (Buyer)</span></div>
                  <div className="cancellation-quote-row"><span className="cancellation-quote-mark" aria-hidden="true">“</span><blockquote>{cancellation.reason}</blockquote><time>{cancellation.requested_at}</time></div>
                  <Button className="cancellation-evidence-button cancellation-evidence-button--red" aria-haspopup="dialog" disabled={busy}
                    onClick={() => openModal('evidence', { title: 'Supporting Evidence', documents: cancellation.evidence })}><Icon name="file" /><span>View Supporting Evidence ({cancellation.evidence.length} files)</span><Icon name="arrow" size={17} /></Button>
                </div>
              </div>
            </div>

            <div className="cancellation-section cancellation-response-section">
              <span className="cancellation-icon-circle cancellation-icon-circle--blue"><MessageIcon /></span>
              <div className="cancellation-section-content">
                <div className="cancellation-section-heading"><h2>Other Party’s Response</h2><Badge tone="warning"><Icon name="info" size={13} />{response ? 'Response Received' : 'Response Pending'}</Badge></div>
                {response ? <><div className="cancellation-response-meta"><span><Icon name="user" size={17} />{response.name} ({response.role})</span><time>{response.date}</time></div>
                  <div className="cancellation-quote-row"><span className="cancellation-quote-mark" aria-hidden="true">“</span><blockquote>{response.text}</blockquote></div></> : <p className="cancellation-description">No response has been recorded in this simulation.</p>}
                <Button className="cancellation-evidence-button cancellation-evidence-button--blue" aria-haspopup="dialog" disabled={busy}
                  onClick={() => openModal('evidence', { title: 'Other Party’s Response & Evidence', documents: cancellation.response_evidence })}><Icon name="file" /><span>View Response & Evidence ({cancellation.response_evidence.length} files)</span><Icon name="arrow" size={17} /></Button>
              </div>
            </div>
          </Panel>

          <Panel className="cancellation-review-panel" aria-labelledby={`${prefix}-review-heading`}>
            <div className="cancellation-section">
              <span className="cancellation-icon-circle cancellation-icon-circle--review"><ScalesIcon /></span>
              <div className="cancellation-section-content"><h2 id={`${prefix}-review-heading`}>Review Progress</h2><p className="cancellation-description">The cancellation request is being reviewed by the authorised officer. Both parties will be notified once a decision is made.</p></div>
            </div>
            <ProgressSteps steps={reviewSteps} current={2} compact />
            {withdrawalRequested && <p className="cancellation-pending-note"><Icon name="clock" size={15} />Withdrawal requested · Authority decision pending</p>}
          </Panel>

          {cancellation.messages.length > 0 && <Panel className="cancellation-messages-panel" aria-labelledby={`${prefix}-messages-heading`}><h2 id={`${prefix}-messages-heading`}>Local Sent Messages</h2><SentMessages messages={cancellation.messages} /><p className="cancellation-small-print">Demonstration messages only. No server delivery or authority response.</p></Panel>}
        </div>

        <aside className="cancellation-side-column" aria-label="Transaction details and actions">
          <Panel className="cancellation-land-panel"><h2>Land Details</h2><LandSummary compact onOpen={() => openModal('land')} /></Panel>

          <Panel className="cancellation-actions-panel" aria-labelledby={`${prefix}-actions-heading`}>
            <h2 id={`${prefix}-actions-heading`}>Actions</h2>
            <div className="cancellation-actions-grid">
              <Button className="cancellation-action cancellation-action--withdraw" disabled={disabled || withdrawalRequested} aria-haspopup="dialog" onClick={() => openModal('withdraw')}><Icon name="x" size={17} /><span>{withdrawalRequested ? 'Withdrawal Requested' : 'Withdraw Cancellation Request'}</span><Icon name="arrow" size={16} /></Button>
              <Button className="cancellation-action" disabled={disabled} aria-haspopup="dialog" onClick={() => openModal('message')}><MessageIcon size={18} /><span>Send a Message</span><Icon name="arrow" size={16} /></Button>
              <Button className="cancellation-action cancellation-action--upload" disabled={disabled} aria-haspopup="dialog" onClick={() => openModal('upload')}><Icon name="upload" size={19} /><span>Upload Additional Evidence</span><Icon name="arrow" size={16} /></Button>
            </div>
            {withdrawalRequested && <p className="cancellation-small-print">Request recorded. Authority decision pending; no transaction resumption.</p>}
          </Panel>

          <Panel className="cancellation-documents-panel" aria-labelledby={`${prefix}-documents-heading`}>
            <div className="cancellation-documents-heading"><h2 id={`${prefix}-documents-heading`}>Transaction Documents</h2><Button className="cancellation-view-all" aria-haspopup="dialog" onClick={() => openModal('documents')}>View All<Icon name="arrow" size={16} /></Button></div>
            <div className="cancellation-document-tiles">{DOCUMENTS.map(document => <button key={document.id} type="button" className="cancellation-document-tile" aria-label={`View synthetic ${document.name}`} aria-haspopup="dialog" disabled={busy}
              onClick={() => openModal('documents', { selectedId: document.id })}><Icon name="file" size={31} /><span>{document.label}{document.detail && <><br />{document.detail}</>}</span></button>)}</div>
          </Panel>

          <HelpCard onOpen={() => openModal('guide')} />
        </aside>
      </div>}

      <p className="cancellation-demo-note"><Icon name="shield" size={14} />Synthetic demonstration · Documents, people, locations, and dates are illustrative. Actions are in memory only; no files or messages are sent to a server.</p>

      <Modal open={Boolean(modal)} title={modalTitle} onClose={closeModal}>
        <div className="cancellation-modal" aria-busy={busy}>
          {modal?.kind === 'withdraw' && <><p>This only requests withdrawal of your cancellation request. It does not withdraw it immediately, resolve the disagreement, approve a document, or resume the transaction.</p><div className="cancellation-modal-callout"><Icon name="clock" /><div><strong>Authority decision remains pending</strong><p>The request stays under review. The other party’s response and evidence remain on the record.</p></div></div><p className="cancellation-small-print">Local simulation only; no backend withdrawal endpoint is called.</p><div className="cancellation-modal-actions"><Button disabled={busy} onClick={closeModal}>Keep Cancellation Request</Button><Button variant="danger" disabled={disabled || withdrawalRequested} onClick={requestWithdrawal}>{busy ? 'Requesting withdrawal…' : 'Confirm Withdrawal Request'}</Button></div></>}

          {modal?.kind === 'message' && <><p>Write to the other party in this local demonstration. Messages are not delivered to a server and do not change the review stage.</p><form onSubmit={sendMessage}><label className="cancellation-field-label" htmlFor={`${prefix}-message`}>Message to the other party</label><textarea id={`${prefix}-message`} className="cancellation-message-input" value={draft} onChange={event => { setDraft(event.target.value); setActionError(''); }} rows={5} maxLength={2000} required disabled={busy} aria-describedby={`${prefix}-message-hint`} /><p id={`${prefix}-message-hint`} className="cancellation-small-print">{draft.length.toLocaleString('en-IN')} / 2,000 characters · Saved for this session only</p><div className="cancellation-modal-actions"><Button disabled={busy} onClick={closeModal}>Close</Button><Button type="submit" variant="primary" disabled={disabled || !draft.trim()}>{busy ? 'Saving message…' : 'Send Message Locally'}</Button></div></form><h3>Local sent messages</h3><SentMessages messages={cancellation?.messages || []} /></>}

          {modal?.kind === 'upload' && <><p>Add evidence metadata to the local demonstration. No file contents are uploaded, persisted, verified, or reviewed by this action. Use synthetic documents only.</p><label className="cancellation-field-label" htmlFor={`${prefix}-files`}>Additional evidence files</label><input id={`${prefix}-files`} className="cancellation-file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} onChange={selectFiles} aria-describedby={`${prefix}-file-hint${fileError ? ` ${prefix}-file-error` : ''}`} aria-invalid={Boolean(fileError)} /><p id={`${prefix}-file-hint`} className="cancellation-small-print">PDF, JPEG, or PNG · Non-empty · Maximum 10 MiB per file · Valid matching filename extension required. The entire batch must be valid.</p>{files.length > 0 && <ul className="cancellation-file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><Icon name="file" size={18} /><span>{file.name}</span><small>{fileSize(file.size)}</small></li>)}</ul>}{fileError && <p id={`${prefix}-file-error`} className="cancellation-inline-error" role="alert">{fileError}</p>}{uploadReview && <div className="cancellation-modal-callout"><Icon name="info" /><div><strong>Confirm adding {files.length} evidence {files.length === 1 ? 'file' : 'files'} locally</strong><p>Only demonstration metadata will be added. Authority review and decision remain pending.</p></div></div>}<div className="cancellation-modal-actions"><Button disabled={busy} onClick={closeModal}>Cancel</Button>{uploadReview ? <Button variant="primary" disabled={disabled || Boolean(fileError)} onClick={uploadEvidence}>{busy ? 'Adding evidence…' : 'Confirm Local Evidence Upload'}</Button> : <Button variant="primary" disabled={disabled || !files.length || Boolean(fileError)} onClick={() => { const validation = validateFiles(files); setFileError(validation); if (!validation) setUploadReview(true); }}>Review Selected Files</Button>}</div></>}

          {modal && ['evidence', 'documents'].includes(modal.kind) && <><p className="cancellation-small-print">Synthetic document preview only. No private file URL, real certificate, or verified legal document is accessed.</p>{modal.title?.includes('Response') && response && <div className="cancellation-modal-callout"><Icon name="user" /><div><strong>{response.name} ({response.role}) · {response.date}</strong><p>{response.text}</p></div></div>}<div className="cancellation-document-viewer"><nav className="cancellation-document-selector" aria-label="Select a synthetic document">{(modal.kind === 'documents' ? DOCUMENTS : modal.documents || []).map(document => <button key={document.id} type="button" aria-pressed={selectedDocument === document.id} onClick={() => setSelectedDocument(document.id)}><Icon name="file" size={18} /><span>{document.name}<small>{fileSize(document.size)}</small></span></button>)}</nav><section className="cancellation-document-preview" aria-label="Synthetic document content" aria-live="polite" aria-busy={evidenceLoading}>{evidenceLoading ? <p role="status">Loading synthetic document…</p> : evidenceError ? <div className="cancellation-inline-error" role="alert"><p>{evidenceError}</p><Button onClick={() => setEvidenceAttempt(attempt => attempt + 1)}>Retry document</Button></div> : evidence ? <><h3>{evidence.name}</h3><pre>{evidence.text}</pre></> : <p>No evidence files have been added.</p>}</section></div><div className="cancellation-modal-actions"><Button onClick={closeModal}>Close Preview</Button></div></>}

          {modal?.kind === 'land' && <><img className="cancellation-land-artwork" src="/assets/transactions/agricultural-land.webp" alt="Illustrative agricultural land, not a photograph of a verified parcel" /><h3>Agricultural Land</h3><dl className="cancellation-land-facts"><div><dt>Location</dt><dd>Narsingi, Hyderabad, Telangana</dd></div><div><dt>Survey number</dt><dd>123/2</dd></div><div><dt>Land extent</dt><dd>2.5 acres</dd></div><div><dt>Illustrative asking price</dt><dd>{formatINR(4500000)} per acre</dd></div></dl><p className="cancellation-small-print">All parcel details are synthetic. This preview does not establish title, boundaries, ownership, or document validity.</p><div className="cancellation-modal-actions"><Button onClick={closeModal}>Close Land Details</Button></div></>}

          {modal?.kind === 'guide' && <><p>A cancellation request records a concern, not a final transaction decision. Both parties can provide statements and supporting evidence.</p><ol className="cancellation-guide-list"><li><strong>Explain the concern.</strong> State the discrepancy clearly and use relevant, synthetic supporting documents in this demonstration.</li><li><strong>Review the other party’s response.</strong> Read their statement and evidence before adding a message or additional evidence.</li><li><strong>Await review and a decision.</strong> Evidence review and authority decision are separate stages. Adding a file does not verify it or decide the outcome.</li><li><strong>Withdrawal is a request.</strong> It remains pending until an authority decides. It does not automatically resume or cancel the transaction.</li></ol><div className="cancellation-modal-callout"><Icon name="shield" /><p>There is no guaranteed resolution timeline or simulated authority decision. Files and messages stay in memory, and are cleared when the demonstration session resets.</p></div><div className="cancellation-modal-actions"><Button onClick={closeModal}>Close Guide</Button></div></>}

          {actionError && <div className="cancellation-inline-error" role="alert"><Icon name="info" size={18} /><p>{actionError} You can retry using the action above.</p></div>}
          {busy && <p className="cancellation-small-print" role="status">Saving local simulation changes. Please wait; this dialog cannot be closed while the action is in progress.</p>}
        </div>
      </Modal>
    </div>
  );
}

function SentMessages({ messages }) {
  if (!messages.length) return <p className="cancellation-small-print">No messages sent in this demonstration yet.</p>;
  return <ol className="cancellation-sent-messages">{messages.map((message, index) => <li key={message.id || `local-${index}`}><div><strong>You · Local demonstration</strong>{(message.date || message.created_at) && <span>{message.date || message.created_at}</span>}</div><p>{message.text}</p></li>)}</ol>;
}

function MessageIcon({ size = 25 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 0 1-1-4 9 9 0 0 1 19 0Z" /><path d="M7 11h.01M12 11h.01M17 11h.01" /></svg>;
}

function ScalesIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M7 21h10M4 6h16M6 6l-4 9h8L6 6Zm12 0-4 9h8l-4-9Z" /><path d="M2 15a4 4 0 0 0 8 0M14 15a4 4 0 0 0 8 0" /></svg>;
}