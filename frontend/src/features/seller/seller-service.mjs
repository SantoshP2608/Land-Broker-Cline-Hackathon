// API contract 0.1 uses /auth/session (there is no /auth/me).
// Demo data is synthetic and private to each service instance. No API fallback.
export const sellerMode = import.meta.env?.VITE_SELLER_MODE || 'demo';

const DOCUMENT_TYPES = new Set([
  'PREVIOUS_DEED', 'LAND_RECORD', 'ENCUMBRANCE_CERTIFICATE',
  'SUPPORTING_EVIDENCE', 'LAND_PHOTO',
]);
const IMAGES = {
  residential: '/assets/seller/residential-plot.webp',
  coastal: '/assets/seller/coastal-plot.webp',
  farm: '/assets/seller/farm-plot.webp',
};
const copy = (value) => structuredClone(value);
const encoded = (value) => encodeURIComponent(String(value));
const now = () => new Date().toISOString();

function failure(code, message, details = {}) {
  return Object.assign(new Error(message), {
    name: 'SellerServiceError', code, status: 0, retryable: false,
    field_errors: {}, blocked_reason: message, ...details,
  });
}

function checkVersion(actual, expected) {
  if (!Number.isInteger(expected) || expected < 1) {
    throw failure('VALIDATION_ERROR', 'A positive integer version is required.');
  }
  if (actual !== expected) {
    throw failure('VERSION_CONFLICT', 'The resource changed. Refresh before acting.', { status: 409 });
  }
}

function requireAction(resource, action) {
  if (!resource?.allowed_actions?.includes(action)) {
    throw failure('INVALID_TRANSITION', resource?.blocked_reason || 'This action is not currently allowed.', { status: 409 });
  }
}

function requireIdentity(status) {
  if (status !== 'CONFIRMED') {
    throw failure('IDENTITY_NOT_CONFIRMED', 'A confirmed identity is required. Unknown identity is not confirmation.', { status: 409 });
  }
}

function editFields(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw failure('VALIDATION_ERROR', 'Provide editable listing fields.');
  }
  const result = {};
  if (Object.hasOwn(values, 'title')) {
    if (typeof values.title !== 'string' || values.title.length < 3 || values.title.length > 160) {
      throw failure('VALIDATION_ERROR', 'Title must contain 3–160 characters.');
    }
    result.title = values.title;
  }
  if (Object.hasOwn(values, 'asking_price_inr')) {
    const price = values.asking_price_inr;
    if (typeof price !== 'string' || !/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(price) || !/[1-9]/.test(price)) {
      throw failure('VALIDATION_ERROR', 'Price must be a positive decimal string with at most two fractional digits.');
    }
    result.asking_price_inr = price;
  }
  if (!Object.keys(result).length || Object.keys(values).some((key) => !['title', 'asking_price_inr'].includes(key))) {
    throw failure('VALIDATION_ERROR', 'Only title and asking_price_inr are editable.');
  }
  return result;
}

function validateFiles(files) {
  if (!Array.isArray(files) || !files.length) {
    throw failure('VALIDATION_ERROR', 'Choose at least one correction document.');
  }
  for (const descriptor of files) {
    const file = descriptor?.file;
    if (!DOCUMENT_TYPES.has(descriptor?.document_type)) {
      throw failure('VALIDATION_ERROR', 'Unsupported listing document type; identity and generated deeds cannot be uploaded here.');
    }
    if (!(file instanceof Blob) || !file.size || file.size > 20_971_520 ||
        !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) ||
        (descriptor.document_type === 'LAND_PHOTO' && file.type === 'application/pdf')) {
      throw failure('FILE_REJECTED', 'Choose a nonempty PDF, JPEG or PNG of at most 20 MiB; land photos must be images.');
    }
  }
}

function findingView(finding) {
  return {
    id: finding.id,
    title: finding.rule_code?.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase()) || 'Document finding',
    detail: finding.summary || '',
    status: finding.status,
    evidence: [finding.left_evidence, finding.right_evidence].filter(Boolean).map(copy),
  };
}

function progressStatus(status) {
  return ['APPROVED', 'PUBLISHED', 'CLOSED'].includes(status) ? 'COMPLETED'
    : ['UNDER_REVIEW', 'CHANGES_REQUIRED'].includes(status) ? 'CURRENT' : 'PENDING';
}

function listingView(raw, findings = []) {
  const location = raw.location || {};
  const review = raw.review_summary || {};
  return {
    id: raw.id, title: raw.title,
    location: typeof location === 'string' ? location : [location.village_code, location.subdistrict_code, location.district_code, location.state_code].filter(Boolean).join(', '),
    survey: [location.survey_number, location.subdivision_number].filter(Boolean).join('/'),
    area_display: `${raw.area_sqm} sq m`,
    asking_price_inr: raw.asking_price_inr,
    status: raw.status, version: raw.version,
    allowed_actions: [...(raw.allowed_actions || [])],
    blocked_reason: raw.blocked_reason ?? null,
    // The current DTO exposes neither timestamps nor an audit timeline.
    updated_at: raw.updated_at ?? null,
    findings: findings.map(findingView),
    review_progress: [{ label: 'Current review', date: review.reviewed_at ?? null, status: progressStatus(raw.status) }],
    publication_status: raw.status === 'PUBLISHED' ? 'PUBLISHED' : raw.status === 'CLOSED' ? 'CLOSED' : 'NOT_PUBLISHED',
  };
}

function imageFor(listing) {
  const title = `${listing?.title || ''} ${listing?.land_type || ''}`.toLowerCase();
  return /farm|agricultur/.test(title) ? IMAGES.farm : /coastal|beach|bheemili/.test(title) ? IMAGES.coastal : IMAGES.residential;
}

function requestView(invitation, listing, knownTransactionId) {
  const location = listing?.location || {};
  // InvitationDTO does NOT disclose buyer PII, identity, message, or transaction_id.
  // Optional enrichment is used only when explicitly returned by the server.
  const name = invitation.buyer_name || invitation.buyer?.display_name || `Buyer ${String(invitation.buyer_id || '').slice(0, 8)}`;
  const identity = invitation.identity_status || invitation.buyer?.identity_status || 'UNKNOWN';
  return {
    id: invitation.id, buyer_name: name,
    initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    identity_status: identity, listing_id: invitation.listing_id,
    listing_title: listing?.title || 'Listing unavailable',
    survey: [location.survey_number, location.subdivision_number].filter(Boolean).join('/'),
    area_display: listing ? `${listing.area_sqm} sq m` : 'Unavailable',
    note: invitation.message ?? '', created_at: invitation.created_at,
    status: invitation.status, version: invitation.version,
    allowed_actions: [...(invitation.allowed_actions || [])],
    blocked_reason: invitation.blocked_reason ?? (invitation.status === 'PENDING' && identity !== 'CONFIRMED'
      ? 'Buyer identity is not confirmed by the API.' : listing?.blocked_reason ?? null),
    transaction_id: invitation.transaction_id ?? knownTransactionId ??
      (invitation.status === 'ACCEPTED' ? listing?.parcel?.active_transaction_id ?? null : null),
    image: imageFor(listing),
  };
}

function demoSeed() {
  const date = '2026-10-10T08:30:00Z';
  const base = {
    id: 'LS-2041', title: 'Madhurawada Residential Plot', location: 'Madhurawada, Visakhapatnam',
    survey: '128/2', area_display: '240 sq yd', asking_price_inr: '4800000.00',
    status: 'CHANGES_REQUIRED', version: 3,
    allowed_actions: ['EDIT_LISTING', 'UPLOAD_DOCUMENT', 'SUBMIT_REVIEW'],
    blocked_reason: 'Resolve the area discrepancy and missing encumbrance certificate before review.',
    updated_at: date, publication_status: 'NOT_PUBLISHED',
    findings: [
      { id: 'F-SURVEY', title: 'Survey number matches', detail: 'Sale deed and land record: 128/2', status: 'MATCHES_SOURCE', evidence: [
        { document_id: 'DEMO-DEED', document_version: 1, page_number: 1, field_name: 'survey_number', value: '128/2', source_date: '2026-10-10', confidence: '0.99', filename: 'Synthetic previous deed.pdf' },
      ] },
      { id: 'F-AREA', title: 'Area discrepancy', detail: 'Sale deed: 240 sq yd · Land record: 235 sq yd', status: 'DISCREPANCY', evidence: [
        { document_id: 'DEMO-DEED', document_version: 1, page_number: 2, field_name: 'area', value: '240 sq yd', source_date: '2026-10-10', confidence: '0.98', filename: 'Synthetic previous deed.pdf' },
        { document_id: 'DEMO-RECORD', document_version: 1, page_number: 1, field_name: 'area', value: '235 sq yd', source_date: '2026-10-10', confidence: '0.96', filename: 'Synthetic land record.pdf' },
      ] },
      { id: 'F-EC', title: 'Missing encumbrance certificate', detail: 'Required for reviewer assessment', status: 'EVIDENCE_MISSING', evidence: [] },
    ],
    review_progress: [
      { label: 'Listing received', date: '2026-10-10T04:54:00Z', status: 'COMPLETED' },
      { label: 'Document checks', date: '2026-10-10T07:45:00Z', status: 'COMPLETED' },
      { label: 'Corrections required', date, status: 'CURRENT' },
      { label: 'Reviewer decision', date: null, status: 'PENDING' },
    ],
  };
  const listings = new Map([[base.id, base]]);
  for (const [id, title, location, survey, area, locked] of [
    ['LS-2038', 'Bheemili Coastal Plot', 'Bheemili, Visakhapatnam', '76/3', '300 sq yd', false],
    ['LS-2039', 'Anandapuram Farm Plot', 'Anandapuram, Visakhapatnam', '94/3', '2 acres', false],
    ['LS-2030', 'Madhurawada Residential Plot', 'Madhurawada, Visakhapatnam', '128/1', '240 sq yd', true],
  ]) {
    listings.set(id, { ...copy(base), id, title, location, survey, area_display: area, status: 'PUBLISHED', version: 2,
      publication_status: 'PUBLISHED', findings: [], review_progress: [{ label: 'Published', date, status: 'COMPLETED' }],
      allowed_actions: locked ? [] : ['ACCEPT_INVITATION', 'DECLINE_INVITATION'],
      blocked_reason: locked ? 'This parcel is reserved for an active transaction.' : null });
  }
  const requests = [
    ['BR-108', 'Kushwanth Alla', 'KA', 'CONFIRMED', 'LS-2038', 'PENDING', 'I would like to review the documents and proceed.', '2026-10-10T06:30:00Z'],
    ['BR-109', 'Ravi Mehta', 'RM', 'CONFIRMED', 'LS-2038', 'PENDING', 'I would like to visit the property this weekend.', '2026-10-10T05:30:00Z'],
    ['BR-110', 'Priya Nair', 'PN', 'PENDING', 'LS-2039', 'PENDING', 'Please share more details about the farm land.', '2026-10-10T05:00:00Z'],
    ['BR-104', 'Arjun Rao', 'AR', 'CONFIRMED', 'LS-2030', 'ACCEPTED', 'Looking forward to discussing the agreement.', '2026-10-10T04:30:00Z'],
    ['BR-102', 'Sneha Reddy', 'SR', 'CONFIRMED', 'LS-2039', 'DECLINED', 'Interested in this property for my family.', '2026-10-10T04:00:00Z'],
  ].map(([id, buyer_name, initials, identity_status, listing_id, status, note, created_at]) => {
    const listing = listings.get(listing_id);
    return { id, buyer_name, initials, identity_status, listing_id, listing_title: listing.title,
      survey: listing.survey, area_display: listing.area_display, note, created_at, status, version: 1,
      allowed_actions: status === 'PENDING' ? [...(identity_status === 'CONFIRMED' ? ['ACCEPT_INVITATION'] : []), 'DECLINE_INVITATION'] : [],
      blocked_reason: identity_status !== 'CONFIRMED' ? 'Buyer identity confirmation is pending.' : null,
      transaction_id: status === 'ACCEPTED' ? 'TX-2030' : null,
      image: imageFor(listing) };
  });
  return { listings, requests };
}

function createDemoService() {
  const { listings, requests } = demoSeed();
  // Only descriptors/metadata are retained, never localStorage, public URLs or File bytes.
  const documents = new Map();
  const listingFor = (id) => {
    if (!listings.has(id)) throw failure('NOT_FOUND', 'Synthetic listing not found.', { status: 404 });
    return listings.get(id);
  };
  const advance = (listing) => { listing.version += 1; listing.updated_at = now(); };
  const requestFor = (request, action) => {
    const stored = requests.find((row) => row.id === request?.id);
    if (!stored) throw failure('NOT_FOUND', 'Synthetic request not found.', { status: 404 });
    checkVersion(stored.version, request.version);
    if (action === 'ACCEPT_INVITATION') requireIdentity(stored.identity_status);
    requireAction(stored, action);
    return stored;
  };
  return {
    async getListing(id) { return copy(listingFor(id)); },
    async listRequests() { return copy(requests); },
    async getEvidence(id, finding) {
      const match = listingFor(id).findings.find((row) => row.id === (typeof finding === 'string' ? finding : finding?.id));
      if (!match) throw failure('NOT_FOUND', 'Finding not found.', { status: 404 });
      return match.evidence.map((evidence) => ({ ...copy(evidence), quote: `${evidence.field_name}: ${evidence.value}` }));
    },
    async updateListing(id, values, version) {
      const fields = editFields(values);
      const listing = listingFor(id);
      checkVersion(listing.version, version);
      requireAction(listing, 'EDIT_LISTING');
      Object.assign(listing, fields, { status: 'DRAFT', publication_status: 'NOT_PUBLISHED' });
      if (fields.asking_price_inr) {
        const [whole, fraction = ''] = fields.asking_price_inr.split('.');
        listing.asking_price_inr = `${whole}.${fraction.padEnd(2, '0')}`;
      }
      advance(listing);
      return copy(listing);
    },
    async uploadCorrections(id, files, version) {
      validateFiles(files);
      const listing = listingFor(id);
      checkVersion(listing.version, version);
      requireAction(listing, 'UPLOAD_DOCUMENT');
      const uploaded = documents.get(id) || [];
      for (const { file, document_type } of files) {
        uploaded.push({ document_type, filename: file.name || 'correction', uploaded_at: now() });
        advance(listing);
      }
      documents.set(id, uploaded);
      if (listing.status !== 'DRAFT') listing.status = 'CHANGES_REQUIRED';
      listing.blocked_reason = 'Corrections saved in this synthetic session only; officer review is still required.';
      return copy(listing);
    },
    async submitCorrections(id, version) {
      const listing = listingFor(id);
      checkVersion(listing.version, version);
      requireAction(listing, 'SUBMIT_REVIEW');
      listing.status = 'UNDER_REVIEW';
      listing.allowed_actions = [];
      listing.blocked_reason = 'Waiting for an assigned officer. Uploading or submitting never approves a listing.';
      advance(listing);
      for (const step of listing.review_progress) {
        if (step.status === 'CURRENT') step.status = 'COMPLETED';
      }
      listing.review_progress.push({ label: 'Corrections submitted', date: listing.updated_at, status: 'CURRENT' });
      return copy(listing);
    },
    async publishListing(id, version) {
      const listing = listingFor(id);
      checkVersion(listing.version, version);
      if (listing.status !== 'APPROVED') throw failure('REVIEW_NOT_CURRENT', 'A current officer approval is required before publication.', { status: 409 });
      requireAction(listing, 'PUBLISH_LISTING');
      listing.status = 'PUBLISHED'; listing.publication_status = 'PUBLISHED';
      advance(listing);
      return copy(listing);
    },
    async acceptRequest(request) {
      const stored = requestFor(request, 'ACCEPT_INVITATION');
      const listing = listingFor(stored.listing_id);
      requireAction(listing, 'ACCEPT_INVITATION');
      stored.status = 'ACCEPTED'; stored.version += 1; stored.allowed_actions = [];
      stored.transaction_id = `TX-${stored.id}`;
      listing.allowed_actions = [];
      listing.blocked_reason = 'This parcel is reserved for an active transaction.';
      for (const other of requests) {
        // These two requests share one parcel. They are not silently declined.
        if (other.listing_id === stored.listing_id && other.status === 'PENDING') {
          other.allowed_actions = other.allowed_actions.filter((action) => action !== 'ACCEPT_INVITATION');
          other.blocked_reason = listing.blocked_reason;
        }
      }
      return copy(stored);
    },
    async declineRequest(request) {
      const stored = requestFor(request, 'DECLINE_INVITATION');
      stored.status = 'DECLINED'; stored.version += 1; stored.allowed_actions = []; stored.blocked_reason = null;
      return copy(stored);
    },
  };
}

export function createSellerService({ mode = 'demo', baseUrl = '', fetchImpl = globalThis.fetch } = {}) {
  if (mode === 'demo') return createDemoService();
  if (mode !== 'api') throw failure('CONFIGURATION_ERROR', 'Seller mode must explicitly be demo or api.');
  if (typeof fetchImpl !== 'function') throw failure('CONFIGURATION_ERROR', 'API mode requires fetch.');
  const root = String(baseUrl).replace(/\/+$/, '');
  const prefix = root.endsWith('/api/v1') ? root : `${root}/api/v1`;
  const listings = new Map();
  const transactions = new Map();
  const keys = new Map();
  const active = new Map();
  const acceptAttempts = new Map();
  const uploadBatches = new Map();
  let sessionPromise;

  function privateDownloadUrl(value) {
    // Only the configured backend's session-bound delivery route is navigable.
    // No javascript/data URLs, external storage links, or embedded credentials.
    try {
      const origin = globalThis.location?.href || 'http://localhost/';
      const backend = new URL(prefix || '/api/v1', origin);
      const download = new URL(value, backend);
      if (typeof value !== 'string' || !value || !['http:', 'https:'].includes(download.protocol) ||
          download.origin !== backend.origin || download.username || download.password ||
          !download.pathname.startsWith(`${backend.pathname.replace(/\/+$/, '')}/downloads/`)) throw new Error('Unsafe download');
      return download.href;
    } catch {
      throw failure('INVALID_RESPONSE', 'The API returned an unsafe evidence download URL.');
    }
  }

  async function transport(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${prefix}${path}`, { credentials: 'include', cache: 'no-store', ...options });
    } catch (cause) {
      throw failure('TRANSPORT_ERROR', 'The API could not be reached. The mutation outcome may be unknown; retry identical input.', { retryable: true, outcome_unknown: options.method !== undefined, cause });
    }
    let envelope;
    try { envelope = await response.json(); } catch (cause) {
      throw failure('INVALID_RESPONSE', 'The API response could not be read; do not assume a mutation failed.', { status: response.status, retryable: true, outcome_unknown: options.method !== undefined, cause });
    }
    if (!response.ok || envelope.error) {
      const error = envelope.error || {};
      if ([401, 403].includes(response.status)) sessionPromise = undefined;
      throw failure(error.code || 'API_ERROR', error.message || 'The API request failed.', {
        status: response.status, retryable: error.retryable ?? response.status >= 500,
        field_errors: error.field_errors || {}, request_id: envelope.meta?.request_id,
        outcome_unknown: options.method !== undefined && response.status >= 500,
      });
    }
    if (!Object.hasOwn(envelope, 'data')) throw failure('INVALID_RESPONSE', 'The API success envelope is missing data.', { retryable: true, outcome_unknown: options.method !== undefined });
    return envelope.data;
  }

  async function session() {
    if (!sessionPromise) {
      sessionPromise = transport('/auth/session').then((data) => {
        if (!data.csrf_token || !data.user) throw failure('AUTH_REQUIRED', 'A real authenticated session and CSRF token are required.', { status: 401 });
        return data;
      }).catch((error) => { sessionPromise = undefined; throw error; });
    }
    return sessionPromise;
  }

  async function mutate(path, method, payload, body) {
    const fingerprint = `${method}:${path}:${JSON.stringify(payload)}`;
    if (active.has(fingerprint)) return active.get(fingerprint);
    if (!keys.has(fingerprint)) keys.set(fingerprint, globalThis.crypto.randomUUID());
    const promise = (async () => {
      const auth = await session();
      return transport(path, { method, headers: {
        'X-CSRF-Token': auth.csrf_token, 'Idempotency-Key': keys.get(fingerprint),
        ...(body ? {} : { 'Content-Type': 'application/json' }),
      }, body: body || JSON.stringify(payload) });
    })();
    active.set(fingerprint, promise);
    try { return await promise; } finally { active.delete(fingerprint); }
    // Keys remain stable for the lifetime of this instance, including after success.
  }

  async function pages(path) {
    const items = [];
    const seen = new Set();
    let cursor = null;
    do {
      const data = await transport(`${path}?limit=50${cursor ? `&cursor=${encoded(cursor)}` : ''}`);
      if (!Array.isArray(data.items)) throw failure('INVALID_RESPONSE', 'Expected a paginated API response.');
      items.push(...data.items);
      cursor = data.next_cursor;
      if (cursor && seen.has(cursor)) throw failure('INVALID_RESPONSE', 'The API repeated a pagination cursor.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }

  async function getListing(id) {
    const [raw, findings] = await Promise.all([
      transport(`/seller/listings/${encoded(id)}`), pages(`/seller/listings/${encoded(id)}/findings`),
    ]);
    listings.set(raw.id, raw);
    return listingView(raw, findings);
  }

  async function listingMutation(id, path, method, payload, identityRequired = false) {
    checkVersion(payload.expected_version, payload.expected_version);
    if (identityRequired) requireIdentity((await session()).user.identity_status);
    const data = await mutate(path, method, payload);
    const raw = data.listing || data;
    listings.set(id, raw);
    // A successful write remains successful if refreshing ancillary findings fails.
    const result = listingView(raw);
    try { result.findings = (await pages(`/seller/listings/${encoded(id)}/findings`)).map(findingView); }
    catch (error) { result.refresh_error = { code: error.code, message: error.message }; }
    return result;
  }

  return {
    getListing,
    async listRequests() {
      const owned = await pages('/seller/listings');
      for (const listing of owned) listings.set(listing.id, listing);
      const groups = await Promise.all(owned.map(async (listing) => {
        const invitations = await pages(`/seller/listings/${encoded(listing.id)}/invitations`);
        return invitations.map((invitation) => requestView(invitation, listing, transactions.get(invitation.id)));
      }));
      return groups.flat();
    },
    async getEvidence(id, finding) {
      const rows = await pages(`/seller/listings/${encoded(id)}/findings`);
      const match = rows.find((row) => row.id === (typeof finding === 'string' ? finding : finding?.id));
      if (!match) throw failure('NOT_FOUND', 'Finding not found.', { status: 404 });
      return Promise.all([match.left_evidence, match.right_evidence].filter(Boolean).map(async (evidence) => {
        const [document, download] = await Promise.all([
          transport(`/documents/${encoded(evidence.document_id)}`), transport(`/documents/${encoded(evidence.document_id)}/download`),
        ]);
        if (document.version !== evidence.document_version) throw failure('VERSION_CONFLICT', 'The evidence document changed; refresh the findings.', { status: 409 });
        return { ...copy(evidence), quote: `${evidence.field_name}: ${evidence.value}`, document_type: document.document_type,
          filename: document.filename, download_url: privateDownloadUrl(download.download_url), expires_at: download.expires_at };
      }));
    },
    async updateListing(id, values, version) {
      return listingMutation(id, `/seller/listings/${encoded(id)}`, 'PATCH', { expected_version: version, ...editFields(values) });
    },
    async uploadCorrections(id, files, version) {
      validateFiles(files);
      checkVersion(version, version);
      const signatures = await Promise.all(files.map(async ({ file, document_type }) => ({
        document_type, filename: file.name || 'correction', mime: file.type,
        sha256: Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      })));
      const fingerprint = JSON.stringify([id, version, signatures]);
      if (!uploadBatches.has(fingerprint)) uploadBatches.set(fingerprint, { version, documents: [], active: null });
      const batch = uploadBatches.get(fingerprint);
      if (batch.active) return batch.active;
      batch.active = (async () => {
        try {
          for (let index = batch.documents.length; index < files.length; index += 1) {
            const form = new FormData();
            const payload = { owner_kind: 'LISTING', owner_id: id, sharing_scope: 'OWNER_AND_OFFICERS', expected_version: batch.version, ...signatures[index] };
            for (const key of ['owner_kind', 'owner_id', 'sharing_scope', 'document_type', 'expected_version']) form.append(key, String(payload[key]));
            form.append('file', files[index].file, payload.filename);
            const data = await mutate('/documents', 'POST', payload, form);
            if (!data.document || data.owner?.id !== id || !Number.isInteger(data.owner.version)) {
              throw failure('INVALID_RESPONSE', 'Upload response is missing the document or owner version.', { outcome_unknown: true, retryable: true });
            }
            batch.documents.push(data.document);
            batch.version = data.owner.version;
          }
          const listing = await getListing(id);
          return { ...listing, uploaded_documents: copy(batch.documents) };
        } catch (error) {
          // Backend has no DELETE/rollback. Never claim all files were saved.
          error.uploaded_documents = copy(batch.documents);
          error.current_version = batch.version;
          error.failed_index = batch.documents.length;
          error.partial = batch.documents.length > 0;
          throw error;
        }
      })();
      try { return await batch.active; } finally { batch.active = null; }
    },
    async submitCorrections(id, version) {
      return listingMutation(id, `/seller/listings/${encoded(id)}/submit-review`, 'POST', { expected_version: version }, true);
    },
    async publishListing(id, version) {
      return listingMutation(id, `/seller/listings/${encoded(id)}/publish`, 'POST', { expected_version: version }, true);
    },
    async acceptRequest(request) {
      requireIdentity(request?.identity_status);
      requireAction(request, 'ACCEPT_INVITATION');
      checkVersion(request.version, request.version);
      requireIdentity((await session()).user.identity_status);
      const fingerprint = `${request.id}:${request.version}`;
      if (!acceptAttempts.has(fingerprint)) {
        const listing = listings.get(request.listing_id) || await transport(`/seller/listings/${encoded(request.listing_id)}`);
        checkVersion(listing.parcel?.version, listing.parcel?.version);
        acceptAttempts.set(fingerprint, { expected_version: listing.parcel.version, expected_invitation_version: request.version });
      }
      // expected_version is the PARCEL version, not the listing version.
      const data = await mutate(`/invitations/${encoded(request.id)}/accept`, 'POST', acceptAttempts.get(fingerprint));
      listings.set(data.listing.id, data.listing);
      transactions.set(data.invitation.id, data.transaction.id);
      return requestView(data.invitation, data.listing, data.transaction.id);
    },
    async declineRequest(request) {
      requireAction(request, 'DECLINE_INVITATION');
      checkVersion(request.version, request.version);
      const data = await mutate(`/invitations/${encoded(request.id)}/decline`, 'POST', { expected_version: request.version });
      return requestView(data, listings.get(data.listing_id), transactions.get(data.id));
    },
  };
}