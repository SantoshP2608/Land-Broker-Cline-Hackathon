import React, { useRef, useState } from 'react';
import BuyerLayout from './BuyerLayout.jsx';
import { Icon } from './icons.jsx';
import { LandIllustration } from './illustrations.jsx';
import { LISTINGS, DOCUMENT_TYPES } from './listings.js';
import './LandDetail.css';

const VERIFICATION_ITEMS = [
  { key: 'authenticity', label: 'Document Authenticity', status: 'Verified' },
  { key: 'ownership', label: 'Ownership Details', status: 'Matched' },
  { key: 'survey', label: 'Survey & Area Check', status: 'Verified' },
  { key: 'encumbrance', label: 'Encumbrance Check', status: 'Clear' },
  { key: 'zoning', label: 'Land Use & Zoning', status: 'Valid' },
];

export default function LandDetail({ id, account, onSignIn, onSwitchToSelling, onGoHome, onProfile, onBack, saved, onToggleSave }) {
  const listing = LISTINGS.find((item) => item.id === id) || LISTINGS[0];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const docsDialogRef = useRef(null);
  const total = listing.gallery.length;

  function nextPhoto() { setPhotoIndex((i) => (i + 1) % total); }
  function prevPhoto() { setPhotoIndex((i) => (i - 1 + total) % total); }

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}#land-${listing.id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage('Link copied to clipboard.');
      } else {
        setShareMessage(url);
      }
    } catch {
      setShareMessage(url);
    }
    window.setTimeout(() => setShareMessage(''), 4000);
  }

  function handleSendRequest() {
    if (!account) { onSignIn?.(); return; }
    setRequestMessage('This is a demo-only request. No backend, reservation, or seller contact is actually created — sign-in simply unlocks this preview.');
  }

  return (
    <BuyerLayout active="marketplace" onNavigate={() => {}} onSwitchToSelling={onSwitchToSelling} onGoHome={onGoHome} onProfile={onProfile} account={account} onSignIn={onSignIn}>
      <button type="button" className="detail-back" onClick={onBack}><Icon kind="back" /> Back to Listings</button>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="detail-gallery">
            <div className="detail-gallery__hero">
              <button type="button" className="detail-gallery__arrow detail-gallery__arrow--left" onClick={prevPhoto} aria-label="Previous photo"><Icon kind="chevron-left" /></button>
              <LandIllustration type={listing.typeKey} variant={photoIndex} className="detail-gallery__img" />
              <button type="button" className="detail-gallery__arrow detail-gallery__arrow--right" onClick={nextPhoto} aria-label="Next photo"><Icon kind="chevron-right" /></button>
              <span className="detail-gallery__count">{photoIndex + 1} / {total}</span>
              <div className="detail-gallery__actions">
                <button type="button" className={`detail-save${saved ? ' detail-save--active' : ''}`} aria-pressed={saved} onClick={() => onToggleSave(listing.id)}>
                  <Icon kind={saved ? 'heart-filled' : 'heart'} /> Save
                </button>
                <button type="button" className="detail-share" onClick={handleShare}><Icon kind="share" /> Share</button>
              </div>
            </div>
            <div className="detail-gallery__thumbs">
              {listing.gallery.map((v, idx) => (
                <button key={v} type="button" className={`detail-thumb${idx === photoIndex ? ' detail-thumb--active' : ''}`} onClick={() => setPhotoIndex(idx)} aria-label={`Show photo ${idx + 1}`}>
                  <LandIllustration type={listing.typeKey} variant={v} className="detail-thumb__img" />
                </button>
              ))}
            </div>
            {shareMessage ? <p className="detail-share__message" role="status"><Icon kind="copy" /> {shareMessage}</p> : null}
          </div>

          <div className="detail-heading">
            <h1>{listing.title} <span className="detail-badge"><Icon kind="check" /> {listing.status}</span></h1>
            <p className="detail-loc"><Icon kind="pin" /> {listing.location}, {listing.state}</p>
            <p className="detail-survey"><Icon kind="doc" /> Survey No. {listing.survey} &nbsp;|&nbsp; Mandal: {listing.mandal} &nbsp;|&nbsp; District: {listing.district}</p>
            <div className="detail-heading__right">
              <span className="detail-price">₹ {listing.priceLabel}<small>({listing.priceUnit})</small></span>
              <span className="detail-area-pill">Total Area: {listing.areaLabel}</span>
            </div>
          </div>

          <div className="detail-specs">
            <div className="detail-spec"><Icon kind="leaf" /><div><span>Land Type</span><strong>{listing.type}</strong></div></div>
            <div className="detail-spec"><Icon kind="ruler" /><div><span>Area</span><strong>{listing.areaLabel}</strong></div></div>
            <div className="detail-spec"><Icon kind="road" /><div><span>Road Access</span><strong>{listing.roadAccess}</strong></div></div>
            <div className="detail-spec"><Icon kind="zoning" /><div><span>Zoning</span><strong>{listing.zoning}</strong></div></div>
          </div>

          <section className="detail-description">
            <h2><Icon kind="doc" /> Description</h2>
            <p>{listing.description}</p>
            <p className="detail-description__scope">This is an evidence summary generated for this demo (scope &amp; date: {listing.listedOn}). It reflects document checks performed in this prototype only and is not a legal guarantee of title, ownership, or registrability.</p>
          </section>
        </div>

        <aside className="detail-side">
          <div className="side-card">
            <div className="side-card__head"><h2>Verification Status</h2><span className="detail-badge"><Icon kind="check" /> {listing.status}</span></div>
            <ul className="verification-list">
              {VERIFICATION_ITEMS.map((v) => (
                <li key={v.key}><Icon kind="check" /> <span>{v.label}</span><strong>{v.status}</strong></li>
              ))}
            </ul>
          </div>

          <div className="side-card">
            <div className="side-card__head"><h2><Icon kind="pin" /> Location</h2><span className="side-card__link">Open in Maps <Icon kind="arrow-right" /></span></div>
            <div className="side-map"><LandIllustration type={listing.typeKey} variant={3} className="side-map__img" /></div>
          </div>

          <div className="side-card">
            <div className="side-card__head">
              <h2>Documents</h2>
              <button type="button" className="side-card__link" onClick={() => docsDialogRef.current?.showModal()}>View All Documents <Icon kind="arrow-right" /></button>
            </div>
            <div className="doc-grid">
              {DOCUMENT_TYPES.map((doc) => (
                <div key={doc} className="doc-chip"><Icon kind="doc" /><span>{doc}</span><Icon kind="check" className="doc-chip__check" /></div>
              ))}
            </div>
            <p className="side-card__note"><Icon kind="info" /> Private seller documents are not exposed in this demo — only verification outcomes are shown.</p>
          </div>

          <div className="side-actions">
            <button type="button" className="side-actions__contact"><Icon kind="message" /> Contact Seller</button>
            <button type="button" className="side-actions__request" onClick={handleSendRequest}><Icon kind="send" /> Send Purchase Request</button>
          </div>
          {requestMessage ? <p className="detail-request-note" role="status"><Icon kind="info" /> {requestMessage}</p> : null}
        </aside>
      </div>

      <dialog ref={docsDialogRef} className="docs-dialog" aria-labelledby="docs-dialog-title">
        <form method="dialog"><button className="docs-dialog__close" aria-label="Close">×</button></form>
        <h2 id="docs-dialog-title">Document evidence, not public access</h2>
        <p>Private seller documents are never exposed to buyers directly in this demo. What you see are verification outcomes (authenticity, ownership match, survey check, encumbrance, zoning) produced from a one-time automated and human review.</p>
        <p>This list does not constitute a legal guarantee of genuine, verified, or clear title. Always perform independent legal due diligence before any real transaction.</p>
      </dialog>
    </BuyerLayout>
  );
}
