import React, { useState } from 'react';
import SellerLayout from './SellerLayout.jsx';
import { Icon } from './icons.jsx';
import './ListLandForm.css';

const STEPS = [
  { key: 1, label: 'Location & Survey' },
  { key: 2, label: 'Area & Pricing' },
  { key: 3, label: 'Photos & Documents' },
  { key: 4, label: 'Review & Submit' },
];

const LAND_TYPES = [
  { key: 'agricultural', label: 'Agricultural', icon: 'land-home' },
  { key: 'residential', label: 'Residential', icon: 'home' },
  { key: 'commercial', label: 'Commercial', icon: 'listings' },
  { key: 'other', label: 'Other', icon: 'draft' },
];

const STEP_TIPS = {
  1: [
    'Use exact survey number as per official documents',
    'Verify the location on the map',
    'Select the correct land type',
    'Provide a clear nearby landmark',
  ],
  2: [
    "Enter area in the unit shown on your documents",
    'Price should reflect current market value',
    'Double-check totals before continuing',
  ],
  3: [
    'Upload clear, well-lit photographs',
    'Include survey sketch and ownership documents',
    'Scanned documents should be legible',
  ],
  4: [
    'Review every section before submitting',
    'Submission starts the verification process',
    'Your land is not publicly listed until approved',
  ],
};

const INITIAL_FORM = {
  state: 'Telangana',
  district: 'Hyderabad',
  mandal: 'Narsingi',
  locality: 'Narsingi',
  surveyNumber: '123/2',
  subDivision: '',
  landType: 'agricultural',
  address: 'Near Narsingi ORR, Hyderabad, Telangana',
  area: '',
  areaUnit: 'Acres',
  askingPrice: '',
  priceUnit: 'per acre',
  description: '',
};

/**
 * Page 5 — Create / Edit Land Listing.
 * Four-step wizard matching the seller dashboard visual language.
 * Submission only calls `onSubmit` with collected form data; this component
 * does not talk to any backend and does not claim the listing is published —
 * actual verification/publication happens after backend review.
 */
export default function ListLandForm({
  userName = 'Ravi Kumar',
  onNavigate,
  onSwitchToBuying,
  onGoHome,
  onSubmit,
  onCancel,
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function goNext() { setStep((s) => Math.min(4, s + 1)); }
  function goBack() { setStep((s) => Math.max(1, s - 1)); }

  function handleSubmit() {
    setSubmitted(true);
    onSubmit?.(form);
  }

  return (
    <SellerLayout active="listings" userName={userName} onNavigate={onNavigate} onSwitchToBuying={onSwitchToBuying} onGoHome={onGoHome}>
      <section className="list-land-hero">
        <h1>List Your <span className="list-land-hero__accent">Land</span></h1>
        <p>Provide accurate details and documents for verification. Once approved, your land will be visible to genuine buyers.</p>
      </section>

      <ol className="step-tracker" aria-label="Listing steps">
        {STEPS.map((s) => (
          <li key={s.key} className={`step-tracker__item${step === s.key ? ' step-tracker__item--active' : ''}${step > s.key ? ' step-tracker__item--done' : ''}`}>
            <span className="step-tracker__circle">{step > s.key ? <Icon kind="check" /> : s.key}</span>
            <span className="step-tracker__label">{s.label}</span>
          </li>
        ))}
      </ol>

      {submitted ? (
        <SubmittedNotice onBackToDashboard={() => onNavigate?.('dashboard')} />
      ) : (
        <div className="list-land-grid">
          <div className="list-land-form-panel">
            {step === 1 && <StepLocation form={form} update={update} onNext={goNext} onCancel={onCancel} />}
            {step === 2 && <StepPricing form={form} update={update} onNext={goNext} onBack={goBack} />}
            {step === 3 && <StepDocuments onNext={goNext} onBack={goBack} />}
            {step === 4 && <StepReview form={form} onSubmit={handleSubmit} onBack={goBack} />}
          </div>

          <div className="list-land-side">
            <div className="map-card">
              <div className="map-card__header">
                <h3>Map Location</h3>
                <button type="button" className="map-card__search"><Icon kind="pin" /> Search on Map</button>
              </div>
              <div className="map-card__preview" aria-hidden="true"><Icon kind="pin" /></div>
              <div className="map-card__footer">
                <span><Icon kind="pin" /> {form.locality}, {form.district}, {form.state}</span>
                <button type="button" className="map-card__change">Change Location</button>
              </div>
            </div>

            <div className="tips-card">
              <h3><Icon kind="lightbulb" /> Tips for this step</h3>
              <ul>
                {STEP_TIPS[step].map((tip) => (
                  <li key={tip}><Icon kind="check" /> {tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </SellerLayout>
  );
}

function StepLocation({ form, update, onNext, onCancel }) {
  return (
    <div className="form-card">
      <h2><Icon kind="pin" /> Location &amp; Survey Details</h2>
      <p className="form-card__sub">Start with the basic location and official survey information.</p>

      <div className="form-grid">
        <Field label="State" required>
          <select value={form.state} onChange={(e) => update('state', e.target.value)}>
            <option>Telangana</option>
            <option>Andhra Pradesh</option>
            <option>Karnataka</option>
          </select>
        </Field>
        <Field label="Survey Number" required>
          <input value={form.surveyNumber} onChange={(e) => update('surveyNumber', e.target.value)} />
        </Field>
        <Field label="District" required>
          <select value={form.district} onChange={(e) => update('district', e.target.value)}>
            <option>Hyderabad</option>
            <option>Rangareddy</option>
            <option>Medchal</option>
          </select>
        </Field>
        <Field label="Sub-Division Number (Optional)">
          <input value={form.subDivision} placeholder="-" onChange={(e) => update('subDivision', e.target.value)} />
        </Field>
        <Field label="Village / Mandal" required>
          <select value={form.mandal} onChange={(e) => update('mandal', e.target.value)}>
            <option>Narsingi</option>
            <option>Shamshabad</option>
            <option>Gachibowli</option>
          </select>
        </Field>
        <Field label="Land Type" required>
          <div className="land-type-grid">
            {LAND_TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                className={`land-type-chip${form.landType === type.key ? ' land-type-chip--active' : ''}`}
                onClick={() => update('landType', type.key)}
              >
                <Icon kind={type.icon} /> {type.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Locality / Area">
          <input value={form.locality} onChange={(e) => update('locality', e.target.value)} />
        </Field>
        <Field label="Full Address / Nearby Landmark" full>
          <textarea maxLength={200} rows={3} value={form.address} onChange={(e) => update('address', e.target.value)} />
          <span className="field__counter">{form.address.length}/200</span>
        </Field>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}><Icon kind="back" /> Back</button>
        <button type="button" className="btn btn--primary" onClick={onNext}>Save &amp; Continue <Icon kind="arrow-right" /></button>
      </div>
    </div>
  );
}

function StepPricing({ form, update, onNext, onBack }) {
  return (
    <div className="form-card">
      <h2><Icon kind="listings" /> Area &amp; Pricing</h2>
      <p className="form-card__sub">Tell buyers how large the land is and what you're asking for it.</p>

      <div className="form-grid">
        <Field label="Total Area" required>
          <input type="number" min="0" placeholder="e.g. 2.5" value={form.area} onChange={(e) => update('area', e.target.value)} />
        </Field>
        <Field label="Area Unit" required>
          <select value={form.areaUnit} onChange={(e) => update('areaUnit', e.target.value)}>
            <option>Acres</option>
            <option>Sq. Yards</option>
            <option>Sq. Ft.</option>
            <option>Guntha</option>
          </select>
        </Field>
        <Field label="Asking Price (₹)" required>
          <input type="number" min="0" placeholder="e.g. 4500000" value={form.askingPrice} onChange={(e) => update('askingPrice', e.target.value)} />
        </Field>
        <Field label="Price Unit" required>
          <select value={form.priceUnit} onChange={(e) => update('priceUnit', e.target.value)}>
            <option>per acre</option>
            <option>total</option>
            <option>per sq. yard</option>
          </select>
        </Field>
        <Field label="Additional Notes" full>
          <textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Irrigation source, road access, boundary features…" />
        </Field>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}><Icon kind="back" /> Back</button>
        <button type="button" className="btn btn--primary" onClick={onNext}>Save &amp; Continue <Icon kind="arrow-right" /></button>
      </div>
    </div>
  );
}

function StepDocuments({ onNext, onBack }) {
  return (
    <div className="form-card">
      <h2><Icon kind="draft" /> Photos &amp; Documents</h2>
      <p className="form-card__sub">Upload clear photographs and the documents required for verification.</p>

      <div className="upload-grid">
        <UploadSlot label="Land Photographs" hint="JPG or PNG, up to 10 photos" />
        <UploadSlot label="Survey Sketch / Map" hint="PDF or image" />
        <UploadSlot label="Ownership Document" hint="Title deed or patta, PDF" />
        <UploadSlot label="Tax Receipt (Optional)" hint="Latest land tax receipt" />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}><Icon kind="back" /> Back</button>
        <button type="button" className="btn btn--primary" onClick={onNext}>Save &amp; Continue <Icon kind="arrow-right" /></button>
      </div>
    </div>
  );
}

function UploadSlot({ label, hint }) {
  return (
    <div className="upload-slot">
      <span className="upload-slot__icon"><Icon kind="draft" /></span>
      <span className="upload-slot__label">{label}</span>
      <span className="upload-slot__hint">{hint}</span>
      <button type="button" className="upload-slot__button">Choose file</button>
    </div>
  );
}

function StepReview({ form, onSubmit, onBack }) {
  return (
    <div className="form-card">
      <h2><Icon kind="check" /> Review &amp; Submit</h2>
      <p className="form-card__sub">Check every detail. Submitting sends your land for verification — it will not be publicly visible until approved.</p>

      <div className="review-list">
        <ReviewRow label="Location" value={`${form.locality}, ${form.mandal}, ${form.district}, ${form.state}`} />
        <ReviewRow label="Survey Number" value={form.surveyNumber} />
        <ReviewRow label="Land Type" value={LAND_TYPES.find((t) => t.key === form.landType)?.label ?? '—'} />
        <ReviewRow label="Area" value={form.area ? `${form.area} ${form.areaUnit}` : 'Not provided'} />
        <ReviewRow label="Asking Price" value={form.askingPrice ? `₹ ${form.askingPrice} (${form.priceUnit})` : 'Not provided'} />
      </div>

      <p className="review-note">
        By submitting, you confirm the details above are accurate. This action is labelled <strong>“Submit for verification”</strong> —
        it starts backend document review and does not immediately publish your land to buyers.
      </p>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}><Icon kind="back" /> Back</button>
        <button type="button" className="btn btn--primary" onClick={onSubmit}>Submit for Verification <Icon kind="arrow-right" /></button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="review-row">
      <span className="review-row__label">{label}</span>
      <span className="review-row__value">{value}</span>
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <label className={`field${full ? ' field--full' : ''}`}>
      <span className="field__label">{label} {required && <span className="field__required">*</span>}</span>
      {children}
    </label>
  );
}

function SubmittedNotice({ onBackToDashboard }) {
  return (
    <div className="submitted-card">
      <span className="submitted-card__icon"><Icon kind="check" /></span>
      <h2>Submitted for verification</h2>
      <p>
        Your listing has been sent for document and AI verification. It will not be visible to buyers until the
        required checks and approval are complete. You can track progress from your dashboard.
      </p>
      <button type="button" className="btn btn--primary" onClick={onBackToDashboard}>Back to Dashboard <Icon kind="arrow-right" /></button>
    </div>
  );
}
