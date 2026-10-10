// Pages 12/13 are independent synthetic stage fixtures, not live transactions.
// No fetch, browser persistence, real payments or government commands occur here.
const copy = value => structuredClone(value);
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const versionMatches = (state, version) => {
  if (!Number.isInteger(version) || state.version !== version) fail('VERSION_CONFLICT', 'This preview changed. Refresh and review before trying again.');
};
const amount = value => {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value)) fail('VALIDATION_ERROR', 'Enter INR as a decimal string with at most two fractional digits.');
  const [integer, decimal = ''] = value.split('.');
  return BigInt(integer) * 100n + BigInt(decimal.padEnd(2, '0'));
};
const decimal = paise => `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;

export function validateEvidenceFiles(files) {
  if (!Array.isArray(files) || !files.length) return 'Choose at least one synthetic evidence file.';
  if (files.length > 10) return 'Choose no more than 10 files in one batch.';
  for (const file of files) {
    if (!(file instanceof Blob) || !file.size || file.size > 10 * 1024 * 1024) return 'Choose non-empty PDF, JPG or PNG files up to 10 MB each.';
    const extensions = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i };
    if (!extensions[file.type]?.test(file.name || '') || /[\\/\x00-\x1f]/.test(file.name)) return 'Use only PDF, JPG or PNG with matching filename and type.';
  }
  return '';
}

const agreementSeed = () => ({
  id: 'TRX-2025-1043', version: 1, status: 'AGREEMENT_PREPARATION',
  draft: { id: 'DRAFT-1', version: 1 },
  terms: { price_per_acre: '4500000.00', total: '11250000.00', advance: '1000000.00', remaining: '10250000.00', payment_mode: 'Bank Transfer (via escrow)' },
  confirmations: { buyer: { confirmed: true, draft_version: 1, date: '17 Oct 2025' }, seller: { confirmed: true, draft_version: 1, date: '17 Oct 2025' } },
  identity_confirmed: true, registration_status: 'NOT_SUBMITTED',
});
const cancellationSeed = () => ({
  id: 'TRX-2025-1043', version: 1, status: 'UNDER_REVIEW', withdrawal_requested: false,
  reason: 'Discrepancy found in latest encumbrance certificate. Requesting cancellation until verification is clarified.', requested_at: '15 Oct 2025',
  response: { name: 'Suresh Reddy', role: 'Seller', date: '16 Oct 2025', text: 'We have already provided the latest encumbrance certificate. The document is valid. Requesting to continue with the transaction.' },
  evidence: [{ id: 'E1', name: 'Encumbrance discrepancy.pdf', type: 'application/pdf', size: 123000 }, { id: 'E2', name: 'Survey reference.png', type: 'image/png', size: 204000 }, { id: 'E3', name: 'Cancellation statement.pdf', type: 'application/pdf', size: 82000 }],
  response_evidence: [{ id: 'R1', name: 'Seller response.pdf', type: 'application/pdf', size: 120000 }, { id: 'R2', name: 'Updated certificate.pdf', type: 'application/pdf', size: 192000 }], messages: [],
});

function pdfBlob(lines) {
  // Minimal valid single-page PDF; ASCII keeps byte offsets exact.
  const escape = text => String(text).replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 12 Tf 50 780 Td 18 TL ${lines.map((line, i) => `${i ? 'T* ' : ''}(${escape(line)}) Tj`).join('\n')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(result.length); result += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = result.length;
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([result], { type: 'application/pdf' });
}

export function createTransactionService({ mode = 'demo' } = {}) {
  if (mode !== 'demo') fail('MODE_UNAVAILABLE', 'Pages 12 and 13 currently support explicit local demo mode only. No backend fallback is available.');
  const agreement = agreementSeed();
  const cancellation = cancellationSeed();
  const editableAgreement = version => {
    versionMatches(agreement, version);
    if (agreement.status !== 'AGREEMENT_PREPARATION') fail('INVALID_TRANSITION', 'Registration has already been submitted in this preview. Terms cannot be changed.');
  };
  return {
    mode: 'demo',
    async getAgreement() { return copy(agreement); },
    async getCancellation() { return copy(cancellation); },
    async updateTerms(values, version) {
      editableAgreement(version);
      if (!values || Object.keys(values).some(key => !['price_per_acre', 'advance', 'payment_mode'].includes(key))) fail('VALIDATION_ERROR', 'Only the editable terms can be changed.');
      const price = amount(values.price_per_acre);
      const advance = amount(values.advance);
      const total = price * 5n / 2n;
      if (price <= 0n || advance > total) fail('VALIDATION_ERROR', 'Price must be positive and the advance cannot exceed the total for 2.5 acres.');
      if (!['Bank Transfer (via escrow)', 'Bank Transfer', 'Other agreed method'].includes(values.payment_mode)) fail('VALIDATION_ERROR', 'Choose a supported payment method.');
      agreement.terms = { price_per_acre: decimal(price), total: decimal(total), advance: decimal(advance), remaining: decimal(total - advance), payment_mode: values.payment_mode };
      agreement.draft.version += 1;
      agreement.draft.id = `DRAFT-${agreement.draft.version}`;
      for (const party of ['buyer', 'seller']) agreement.confirmations[party] = { confirmed: false, draft_version: null, date: null };
      agreement.version += 1;
      return copy(agreement);
    },
    async confirmDeed(version, draftVersion) {
      editableAgreement(version);
      if (!agreement.identity_confirmed) fail('IDENTITY_REQUIRED', 'Confirmed identity is required.');
      if (draftVersion !== agreement.draft.version) fail('DRAFT_CHANGED', 'Review the current deed version before confirming.');
      if (agreement.confirmations.buyer.confirmed) fail('ALREADY_CONFIRMED', 'Your current deed confirmation is already recorded.');
      agreement.confirmations.buyer = { confirmed: true, draft_version: draftVersion, date: 'Just now · demo' };
      agreement.version += 1;
      return copy(agreement);
    },
    async submitRegistration(version, draftVersion) {
      editableAgreement(version);
      if (!agreement.identity_confirmed) fail('IDENTITY_REQUIRED', 'Confirmed identity is required.');
      if (draftVersion !== agreement.draft.version) fail('DRAFT_CHANGED', 'The draft has changed. Review it again.');
      if (!['buyer', 'seller'].every(party => agreement.confirmations[party].confirmed && agreement.confirmations[party].draft_version === draftVersion)) fail('CONFIRMATIONS_REQUIRED', 'Both parties must confirm the same current deed. You cannot confirm for the seller.');
      agreement.status = 'REGISTRATION_PENDING';
      agreement.registration_status = 'SUBMITTED';
      agreement.version += 1;
      return copy(agreement);
    },
    async withdrawCancellation(version) {
      versionMatches(cancellation, version);
      if (cancellation.withdrawal_requested) fail('INVALID_TRANSITION', 'A withdrawal request is already awaiting review.');
      cancellation.withdrawal_requested = true;
      cancellation.status = 'WITHDRAWAL_REQUESTED';
      cancellation.version += 1;
      return copy(cancellation);
    },
    async sendMessage(text, version) {
      versionMatches(cancellation, version);
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) fail('VALIDATION_ERROR', 'Enter a message of 1–2000 characters.');
      cancellation.messages.push({ id: `M${cancellation.messages.length + 1}`, text: text.trim(), sender: 'Ravi Kumar (Buyer)', date: 'Just now · local demo' });
      cancellation.version += 1;
      return copy(cancellation);
    },
    async uploadEvidence(files, version) {
      versionMatches(cancellation, version);
      const error = validateEvidenceFiles(files);
      if (error) fail('FILE_REJECTED', error);
      cancellation.evidence.push(...files.map((file, i) => ({ id: `LOCAL-${cancellation.version}-${i}`, name: file.name, size: file.size, type: file.type })));
      cancellation.version += 1;
      // Contents are never persisted, sent to a server or represented as reviewed.
      return copy(cancellation);
    },
    async getEvidence(id) {
      const item = [...cancellation.evidence, ...cancellation.response_evidence].find(file => file.id === id);
      if (!item) fail('NOT_FOUND', 'This synthetic evidence reference is unavailable.');
      return { name: item.name, text: 'Synthetic evidence preview only. No real document contents are stored or displayed. This reference is not an authenticity finding or an authority decision.' };
    },
    async downloadDraft() {
      return pdfBlob(['LANDSHIELD - SYNTHETIC DEMONSTRATION ONLY', 'DRAFT SALE DEED - NOT A LEGAL OR REGISTERED DOCUMENT', `Transaction ${agreement.id} - Draft version ${agreement.draft.version}`, 'Buyer: Ravi Kumar (synthetic)   Seller: Suresh Reddy (synthetic)', 'Agricultural Land - Narsingi, Hyderabad, Telangana (design fixture)', 'Survey: 123/2    Total area: 2.5 acres', `Price per acre: INR ${agreement.terms.price_per_acre}`, `Total: INR ${agreement.terms.total}`, `Advance: INR ${agreement.terms.advance} (synthetic record; no payment)`, `Remaining: INR ${agreement.terms.remaining}`, `Payment method: ${agreement.terms.payment_mode}`, 'Both parties must confirm the same current deed before submission.', 'No government integration, ownership transfer or escrow is performed.', 'This download is a one-page summary of the live preview terms.']);
    },
  };
}