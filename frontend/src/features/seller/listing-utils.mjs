export const CORRECTION_TYPES = {
  LAND_RECORD: 'Corrected land record',
  ENCUMBRANCE_CERTIFICATE: 'Encumbrance certificate',
  PREVIOUS_DEED: 'Sale deed',
  SUPPORTING_EVIDENCE: 'Supporting evidence',
};

export function validateCorrectionFiles(files) {
  if (!files.length) return 'Choose at least one correction file.';
  if (files.length > 10) return 'Choose at most 10 files at a time.';
  for (const file of files) {
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return `${file.name}: only PDF, JPG or PNG files are accepted.`;
    if (file.size <= 0) return `${file.name}: empty files are not accepted.`;
    if (file.size > 10 * 1024 * 1024) return `${file.name}: the limit is 10 MB per file.`;
  }
  return null;
}

export function validateListingEdit(title, price) {
  if (title.trim().length < 3 || title.trim().length > 160) return 'Listing title must have 3–160 characters.';
  if (!/^\d+(?:\.\d{1,2})?$/.test(price) || !/[1-9]/.test(price)) return 'Enter a positive INR amount with at most two decimal places.';
  return null;
}