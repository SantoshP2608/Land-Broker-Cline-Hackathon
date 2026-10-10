import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge, Button, Icon, Modal, Panel, formatIST } from './SellerUI.jsx';
import './BuyerRequests.css';

const BASE_TABS = [
  { status: 'PENDING', label: 'Pending', heading: 'Pending invitations' },
  { status: 'ACCEPTED', label: 'Accepted', heading: 'Accepted requests' },
  { status: 'DECLINED', label: 'Declined', heading: 'Declined requests' },
];

function hasAction(request, action) {
  return Array.isArray(request?.allowed_actions)
    && request.allowed_actions.some((value) => {
      const normalized = String(value).toLowerCase();
      return normalized === action || normalized === `${action}_invitation`;
    });
}

function canAct(request, action) {
  return request?.status === 'PENDING'
    && hasAction(request, action)
    && (action !== 'accept' || request.identity_status === 'CONFIRMED');
}

function errorText(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message : fallback;
}

function blockedText(request) {
  if (request?.identity_status !== 'CONFIRMED' && request?.status === 'PENDING') {
    return 'Identity eligibility is required before acceptance. You can still review this request.';
  }
  if (typeof request?.blocked_reason === 'string' && request.blocked_reason) {
    return request.blocked_reason;
  }
  if (request?.blocked_reason?.message) return request.blocked_reason.message;
  if (request?.status === 'PENDING' && !hasAction(request, 'accept')) {
    return 'Acceptance is unavailable for this request. The parcel may be reserved or eligibility checks may be incomplete.';
  }
  return '';
}

function requestDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Date unavailable';
  return formatIST(value).split(',')[0];
}

function initialsFor(request) {
  return request.initials || (request.buyer_name || 'Buyer').trim().split(/\s+/)
    .map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function IdentityBadge({ request }) {
  const confirmed = request.identity_status === 'CONFIRMED';
  const pending = request.identity_status === 'PENDING';
  const failed = ['FAILED', 'REJECTED', 'DECLINED', 'INELIGIBLE'].includes(request.identity_status);
  const label = confirmed ? 'Identity eligible' : pending ? 'Identity review pending'
    : failed ? 'Identity eligibility failed' : 'Identity eligibility unavailable';
  return (
    <span className={`buyer-identity ${confirmed ? 'is-confirmed' : failed ? 'is-failed' : 'is-pending'}`}>
      <Badge tone={confirmed ? 'success' : failed ? 'danger' : 'warning'}>
        <Icon name={confirmed ? 'check' : pending ? 'clock' : failed ? 'x' : 'info'} size={15} aria-hidden="true" />
        {label}
      </Badge>
    </span>
  );
}

function ParcelImage({ request, className = '' }) {
  const [failed, setFailed] = useState(false);
  const title = (request.listing_title || '').toLowerCase();
  const fallback = title.includes('coast') || title.includes('bheemili')
    ? '/assets/seller/coastal-plot.webp'
    : title.includes('farm') || title.includes('anandapuram')
      ? '/assets/seller/farm-plot.webp' : '/assets/seller/residential-plot.webp';
  const src = request.image || fallback;
  useEffect(() => setFailed(false), [src]);
  return failed ? (
    <div className={`buyer-parcel-image buyer-image-fallback ${className}`} role="img" aria-label={`${request.listing_title || 'Parcel'} image unavailable`}>
      <Icon name="home" size={30} aria-hidden="true" />
    </div>
  ) : (
    <img className={`buyer-parcel-image ${className}`} src={src}
      alt={request.listing_title || 'Parcel'} onError={() => setFailed(true)} />
  );
}

export default function BuyerRequests({ service, onNavigate = () => {} }) {
  const prefix = useId();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('PENDING');
  const [listingFilter, setListingFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refreshRef = useRef(null);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const tabRefs = useRef({});

  useEffect(() => {
    let alive = true;
    let sequence = 0;
    let fetching = false;
    mountedRef.current = true;
    lifecycleRef.current += 1;
    busyRef.current = false;
    setRequests([]);
    setLoading(true);
    setError('');
    setMessage('');
    setBusy(false);
    setConfirmation(null);
    setSelectedId(null);
    setListingFilter('all');

    async function load({ force = false } = {}) {
      if (!alive || (fetching && !force)) return false;
      const current = ++sequence;
      fetching = true;
      setRefreshing(true);
      try {
        if (typeof service?.listRequests !== 'function') {
          throw new Error('The buyer request service is unavailable. Requests have not been loaded.');
        }
        const result = await service.listRequests();
        if (!Array.isArray(result)) throw new Error('The request service returned an invalid response. Please try again.');
        if (!alive || current !== sequence) return false;
        setRequests(result);
        setError('');
        return true;
      } catch (cause) {
        if (alive && current === sequence) {
          setError(errorText(cause, 'Unable to load buyer requests. Please try again.'));
        }
        return false;
      } finally {
        if (alive && current === sequence) {
          fetching = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    refreshRef.current = load;
    void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && !busyRef.current) void load();
    };
    const interval = window.setInterval(refreshWhenVisible, 10_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      alive = false;
      sequence += 1;
      mountedRef.current = false;
      lifecycleRef.current += 1;
      refreshRef.current = null;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [service]);

  const counts = useMemo(() => requests.reduce((result, request) => {
    result[request.status] = (result[request.status] || 0) + 1;
    return result;
  }, { PENDING: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0 }), [requests]);
  const tabs = counts.EXPIRED || activeTab === 'EXPIRED'
    ? [...BASE_TABS, { status: 'EXPIRED', label: 'Expired', heading: 'Expired requests' }]
    : BASE_TABS;
  const currentTab = tabs.find((tab) => tab.status === activeTab) || BASE_TABS[0];
  const listings = useMemo(() => {
    const unique = new Map();
    for (const request of requests) {
      if (request.listing_id != null) unique.set(String(request.listing_id), request.listing_title || String(request.listing_id));
    }
    return [...unique].map(([id, title]) => ({ id, title }));
  }, [requests]);
  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => request.status === activeTab
      && (listingFilter === 'all' || String(request.listing_id) === listingFilter)
      && (!query || [request.buyer_name, request.id, request.listing_title]
        .some((value) => String(value || '').toLowerCase().includes(query))));
  }, [requests, activeTab, listingFilter, search]);
  const selected = filteredRequests.find((request) => String(request.id) === selectedId) || filteredRequests[0] || null;
  const reserved = requests.filter((request) => request.status === 'ACCEPTED');
  const confirmRequest = confirmation
    ? requests.find((request) => String(request.id) === confirmation.id) : null;
  const actionsUnavailable = loading || Boolean(error) || busy;

  function changeTab(status) {
    setActiveTab(status);
    setSelectedId(null);
  }

  function tabKeyDown(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    changeTab(tabs[next].status);
    tabRefs.current[tabs[next].status]?.focus();
  }

  function openConfirmation(action) {
    if (actionsUnavailable || !canAct(selected, action)) return;
    setConfirmation({ id: String(selected.id), action, version: selected.version });
  }

  async function confirmAction() {
    if (busyRef.current || !confirmation) return;
    const request = requests.find((item) => String(item.id) === confirmation.id);
    if (error || !canAct(request, confirmation.action) || request.version !== confirmation.version) {
      setConfirmation(null);
      setMessage('This request has changed or the action is no longer available. Please review its latest details before continuing.');
      return;
    }
    const action = confirmation.action;
    const method = action === 'accept' ? service?.acceptRequest : service?.declineRequest;
    if (typeof method !== 'function') {
      setConfirmation(null);
      setMessage('This action is unavailable because the request service is not connected.');
      return;
    }
    const lifecycle = lifecycleRef.current;
    const stillCurrent = () => mountedRef.current && lifecycleRef.current === lifecycle;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      await method.call(service, request);
      if (!stillCurrent()) return;
      const refreshed = await refreshRef.current?.({ force: true });
      if (!stillCurrent()) return;
      setConfirmation(null);
      setMessage(refreshed
        ? action === 'accept'
          ? 'Request accepted. The parcel is reserved and other acceptances are locked. Ownership has not changed.'
          : 'Request declined. The latest requests have been loaded.'
        : 'The action was submitted, but the latest state could not be loaded. Retry before taking any further action.');
    } catch (cause) {
      if (!stillCurrent()) return;
      const actionError = errorText(cause, 'The request could not be updated. Please review its latest state and try again.');
      await refreshRef.current?.({ force: true });
      if (!stillCurrent()) return;
      setConfirmation(null);
      setMessage(actionError);
    } finally {
      if (stillCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function openTransaction(request) {
    if (request.transaction_id != null && String(request.transaction_id)) {
      onNavigate(`/transactions/${encodeURIComponent(String(request.transaction_id))}`);
    }
  }

  return (
    <section className="buyer-page" aria-labelledby={`${prefix}-heading`}>
      <nav className="buyer-breadcrumb" aria-label="Breadcrumb">
        <span>Seller</span><span aria-hidden="true">/</span><span aria-current="page">Buyer requests</span>
      </nav>

      <header className="buyer-header">
        <div className="buyer-heading">
          <h1 id={`${prefix}-heading`}>Buyer <span>Requests</span></h1>
          <p>Review buyer eligibility and choose who to proceed with.</p>
        </div>
        <div className="buyer-summary" aria-label="Buyer request summary">
          {[
            { label: 'Total requests', count: requests.length, icon: 'users', tone: 'total' },
            { label: 'Pending', count: counts.PENDING, icon: 'clock', tone: 'pending' },
            { label: 'Accepted', count: counts.ACCEPTED, icon: 'check', tone: 'accepted' },
            { label: 'Declined', count: counts.DECLINED, icon: 'x', tone: 'declined' },
          ].map((card) => (
            <Panel key={card.tone} className={`buyer-stat buyer-stat--${card.tone}`}>
              <span className="buyer-stat-icon"><Icon name={card.icon} size={26} aria-hidden="true" /></span>
              <div><strong>{loading ? '—' : card.count}</strong><span>{card.label}</span></div>
            </Panel>
          ))}
        </div>
      </header>

      <div className="buyer-toolbar">
        <div className="buyer-tabs" role="tablist" aria-label="Request status">
          {tabs.map((tab, index) => (
            <button key={tab.status} ref={(element) => { tabRefs.current[tab.status] = element; }}
              type="button" role="tab" id={`${prefix}-tab-${tab.status}`}
              aria-selected={activeTab === tab.status} aria-controls={`${prefix}-panel-${tab.status}`}
              tabIndex={activeTab === tab.status ? 0 : -1}
              onClick={() => changeTab(tab.status)} onKeyDown={(event) => tabKeyDown(event, index)}>
              {tab.label} ({counts[tab.status] || 0})
            </button>
          ))}
        </div>
        <div className="buyer-filters">
          <label className="buyer-listing-filter" htmlFor={`${prefix}-listing`}>
            <span className="buyer-sr-only">Filter by listing</span>
            <select id={`${prefix}-listing`} value={listingFilter} onChange={(event) => {
              setListingFilter(event.target.value);
              setSelectedId(null);
            }}>
              <option value="all">Listing: All listings</option>
              {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}
            </select>
            <Icon name="chevron" size={18} aria-hidden="true" />
          </label>
          <label className="buyer-search" htmlFor={`${prefix}-search`}>
            <Icon name="search" size={21} aria-hidden="true" />
            <span className="buyer-sr-only">Search buyers, listings, or request IDs</span>
            <input id={`${prefix}-search`} type="search" placeholder="Search buyers..."
              value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(null); }} />
          </label>
        </div>
      </div>

      <div className={`buyer-live-message ${message ? 'has-message' : ''}`} role="status" aria-live="polite" aria-atomic="true">
        {busy ? 'Updating request. Please wait…' : message}
      </div>
      {error && (
        <div className="buyer-error" role="alert">
          <Icon name="info" size={22} aria-hidden="true" />
          <div><strong>Unable to refresh requests</strong><p>{error}</p>
            {requests.length > 0 && <p>Previously loaded information is shown. Actions are paused until a successful refresh.</p>}
          </div>
          <Button disabled={refreshing || busy} onClick={() => void refreshRef.current?.({ force: true })}>
            {refreshing ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}

      <div className="buyer-content">
        <div className="buyer-list-column">
          {tabs.map((tab) => (
            <div key={tab.status} role="tabpanel" id={`${prefix}-panel-${tab.status}`}
              aria-labelledby={`${prefix}-tab-${tab.status}`} hidden={tab.status !== activeTab} tabIndex={0}>
              {tab.status === activeTab && (
                <Panel className="buyer-request-panel" aria-busy={loading}>
                  <div className="buyer-panel-heading">
                    <h2>{currentTab.heading}</h2>
                    {refreshing && !loading && <span className="buyer-refresh-label">Refreshing…</span>}
                  </div>
                  {loading ? (
                    <div className="buyer-empty" role="status"><span className="buyer-loading-dot" />Loading buyer requests…</div>
                  ) : filteredRequests.length ? (
                    <ul className="buyer-request-list" aria-label={currentTab.heading}>
                      {filteredRequests.map((request) => {
                        const isSelected = String(request.id) === String(selected?.id);
                        return (
                          <li key={request.id}>
                            <button type="button" className={`buyer-request-row ${isSelected ? 'is-selected' : ''}`}
                              aria-pressed={isSelected} aria-label={`View request ${request.id} from ${request.buyer_name || 'buyer'} for ${request.listing_title || 'parcel'}`}
                              onClick={() => setSelectedId(String(request.id))}>
                              <span className="ls-avatar buyer-avatar" aria-hidden="true">{initialsFor(request)}</span>
                              <span className="buyer-row-person">
                                <strong>{request.buyer_name || 'Buyer name unavailable'}</strong>
                                <IdentityBadge request={request} />
                              </span>
                              <span className="buyer-row-listing">
                                <strong>{request.listing_title || 'Listing unavailable'}</strong>
                                <span>Request {request.id}<span className="buyer-meta-dot" aria-hidden="true">•</span>{requestDate(request.created_at)}</span>
                              </span>
                              <span className="buyer-row-view">
                                View request <Icon name="arrow" size={17} aria-hidden="true" />
                                {request.status === 'PENDING' && !canAct(request, 'accept') && <small>Acceptance unavailable</small>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="buyer-empty">
                      <Icon name={search || listingFilter !== 'all' ? 'search' : 'users'} size={34} aria-hidden="true" />
                      <h3>{error ? 'Requests could not be loaded' : search || listingFilter !== 'all' ? 'No matching requests' : `No ${currentTab.label.toLowerCase()} requests`}</h3>
                      <p>{error ? 'Use Retry above to reconnect to the request service.' : search || listingFilter !== 'all' ? 'Try another buyer name or listing.' : 'New buyer invitations will appear here when they arrive.'}</p>
                      {(search || listingFilter !== 'all') && <Button onClick={() => { setSearch(''); setListingFilter('all'); }}>Clear filters</Button>}
                    </div>
                  )}
                  <p className="buyer-list-footnote"><Icon name="info" size={21} aria-hidden="true" />
                    {activeTab === 'PENDING' ? 'Identity eligibility is required before acceptance.' : 'Request status is refreshed from the service automatically.'}
                  </p>
                </Panel>
              )}
            </div>
          ))}
          <Panel className="buyer-ownership-notice">
            <Icon name="shield" size={48} aria-hidden="true" />
            <div><strong>Accepting a request starts a transaction.</strong>
              <p>Ownership changes only after authorised registration.</p></div>
          </Panel>
        </div>

        <aside className="buyer-detail-column" aria-label="Request details and reserved parcels">
          <Panel className="buyer-detail" aria-labelledby={`${prefix}-detail-heading`}>
            <h2 id={`${prefix}-detail-heading`}>Selected request</h2>
            {selected && !loading ? (
              <>
                <div className="buyer-detail-person">
                  <span className="ls-avatar buyer-avatar" aria-hidden="true">{initialsFor(selected)}</span>
                  <strong>{selected.buyer_name || 'Buyer name unavailable'}</strong>
                  <IdentityBadge request={selected} />
                </div>
                <div className="buyer-detail-parcel">
                  <ParcelImage request={selected} />
                  <div className="buyer-parcel-copy">
                    <h3>{selected.listing_title || 'Listing unavailable'}</h3>
                    <p className="buyer-parcel-meta">Survey {selected.survey || 'unavailable'}<span aria-hidden="true">•</span>{selected.area_display || 'Area unavailable'}</p>
                    <div className="buyer-note"><span>Buyer note</span><p>{selected.note ? `“${selected.note}”` : 'No note provided.'}</p></div>
                  </div>
                </div>
                {selected.status === 'PENDING' ? (
                  <>
                    <div className="buyer-actions">
                      <Button variant="primary" disabled={actionsUnavailable || !canAct(selected, 'accept')}
                        aria-describedby={`${prefix}-accept-help`} onClick={() => openConfirmation('accept')}>Accept request</Button>
                      <Button disabled={actionsUnavailable || !canAct(selected, 'decline')}
                        onClick={() => openConfirmation('decline')}>Decline</Button>
                    </div>
                    {blockedText(selected) && <p className="buyer-blocked"><Icon name="lock" size={17} aria-hidden="true" />{blockedText(selected)}</p>}
                    <p className="buyer-accept-help" id={`${prefix}-accept-help`}>
                      <Icon name="info" size={23} aria-hidden="true" />
                      <span>Acceptance reserves this parcel after confirmation.<br />Other requests for this parcel will then be locked. Ownership does not change.</span>
                    </p>
                  </>
                ) : (
                  <div className="buyer-final-state">
                    <Badge tone={selected.status === 'ACCEPTED' ? 'success' : selected.status === 'DECLINED' ? 'danger' : 'neutral'}>
                      <Icon name={selected.status === 'ACCEPTED' ? 'check' : selected.status === 'EXPIRED' ? 'clock' : 'x'} size={16} aria-hidden="true" />
                      {selected.status === 'ACCEPTED' ? 'Accepted · parcel reserved' : selected.status === 'DECLINED' ? 'Request declined' : 'Request expired'}
                    </Badge>
                    <p>{selected.status === 'ACCEPTED' ? 'A reservation is not ownership. Authorised registration is still required.' : 'This request is no longer pending. No acceptance or decline action is available.'}</p>
                    {selected.status === 'ACCEPTED' && selected.transaction_id && (
                      <Button onClick={() => openTransaction(selected)}>Open transaction workspace <Icon name="arrow" size={17} aria-hidden="true" /></Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="buyer-detail-empty"><Icon name="file" size={32} aria-hidden="true" /><p>{loading ? 'Details will appear when requests are loaded.' : 'Select a request to review buyer eligibility and parcel details.'}</p></div>
            )}
          </Panel>

          <Panel className="buyer-reserved" aria-labelledby={`${prefix}-reserved-heading`}>
            <div className="buyer-reserved-heading"><h2 id={`${prefix}-reserved-heading`}>Reserved parcel{reserved.length > 1 ? 's' : ''}</h2>
              {reserved.length > 0 && <span className="buyer-reserved-badge"><Badge tone="warning"><Icon name="lock" size={19} aria-hidden="true" />Reserved</Badge></span>}
            </div>
            {loading ? <p className="ls-muted">Loading reservations…</p> : reserved.length ? reserved.map((request) => (
              <div key={request.id} className="buyer-reserved-parcel">
                <ParcelImage request={request} />
                <div className="buyer-reserved-copy">
                  <h3>{request.listing_title || 'Reserved parcel'}<span aria-hidden="true">·</span><span>{request.listing_id}</span></h3>
                  <p>Accepted buyer: {request.buyer_name || 'Buyer'}</p>
                  <p className="ls-muted">Other acceptances locked.</p>
                  {request.transaction_id ? (
                    <Button onClick={() => openTransaction(request)} disabled={busy || Boolean(error)}>Open transaction workspace<Icon name="arrow" size={17} aria-hidden="true" /></Button>
                  ) : <p className="buyer-transaction-pending">Transaction reference is not yet available.</p>}
                </div>
              </div>
            )) : <p className="buyer-no-reservations">No reserved parcels yet. Accepted requests will appear here.</p>}
          </Panel>
        </aside>
      </div>

      <Modal open={Boolean(confirmation)} title={confirmation?.action === 'accept' ? 'Accept buyer request?' : 'Decline buyer request?'}
        onClose={() => { if (!busyRef.current) setConfirmation(null); }}>
        <div className="buyer-confirm">
          <p>{confirmation?.action === 'accept'
            ? `Proceed with ${confirmRequest?.buyer_name || 'this buyer'} for ${confirmRequest?.listing_title || 'this parcel'}?`
            : `Decline the request from ${confirmRequest?.buyer_name || 'this buyer'} for ${confirmRequest?.listing_title || 'this parcel'}?`}</p>
          <div className="buyer-confirm-explanation"><Icon name={confirmation?.action === 'accept' ? 'lock' : 'info'} size={25} aria-hidden="true" />
            <div>{confirmation?.action === 'accept'
              ? <><strong>This reserves the parcel, not ownership.</strong><p>Accepting starts a transaction. Other requests for this parcel are then locked from acceptance. Ownership changes only after authorised registration.</p></>
              : <><strong>This request will no longer be pending.</strong><p>Declining does not reserve the parcel or transfer ownership. Other eligible requests are unaffected.</p></>}
            </div>
          </div>
          <div className="buyer-confirm-actions">
            <Button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy || Boolean(error) || !canAct(confirmRequest, confirmation?.action)} onClick={() => void confirmAction()}>
              {busy ? 'Updating…' : confirmation?.action === 'accept' ? 'Confirm acceptance' : 'Confirm decline'}
            </Button>
          </div>
          <p className="buyer-confirm-status" role="status" aria-live="polite">{busy ? 'Please wait while the request is updated.' : ''}</p>
        </div>
      </Modal>
    </section>
  );
}