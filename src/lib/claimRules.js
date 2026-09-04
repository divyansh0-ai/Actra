/**
 * The travel & expense claim: Actra's declarative WebMCP surface.
 *
 * This is the part a plain MCP server cannot replace. The conditional field
 * graph and the cross-field policy rules live here, in the page. An agent
 * fills the form, submits it, and gets these errors back through
 * `event.respondWith(...)` — structured, field-addressed, and fixable — so it
 * can correct itself and resubmit without a human in the loop.
 */

export const TRIP_TYPES = ['domestic', 'international'];
export const PURPOSES = ['conference', 'client_visit', 'training', 'other'];

/** Spend caps by trip type, in INR. */
export const CAPS = { domestic: 60000, international: 250000 };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSPORT = /^[A-Z][0-9]{7}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^[0-9]{9,18}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = (v) => (ISO_DATE.test(v || '') ? new Date(`${v}T00:00:00Z`) : null);

const addMonths = (date, months) => {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

const fmt = (d) => d.toISOString().slice(0, 10);
const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** True when a field should be visible given the current answers. */
export function isVisible(field, v) {
  switch (field) {
    case 'passport_number':
    case 'passport_expiry':
      return v.trip_type === 'international';
    case 'purpose_note':
      return v.purpose === 'other';
    case 'advance_reason':
      return v.advance_required === true || v.advance_required === 'on';
    default:
      return true;
  }
}

/**
 * Validate a full submission.
 * @returns {{valid: boolean, errors: Array<{field,code,message}>}}
 */
export function validateClaim(v) {
  const errors = [];
  const fail = (field, code, message) => errors.push({ field, code, message });
  const required = (field, label) => {
    if (!String(v[field] ?? '').trim()) {
      fail(field, 'required', `${label} is required.`);
      return false;
    }
    return true;
  };

  /* -------------------------------------------------- who and where */

  required('employee_name', 'Employee name');

  if (required('employee_email', 'Work email') && !EMAIL.test(v.employee_email.trim())) {
    fail('employee_email', 'format', 'Work email must be a valid email address, e.g. name@company.com.');
  }

  if (!TRIP_TYPES.includes(v.trip_type)) {
    fail('trip_type', 'required', `Trip type must be one of: ${TRIP_TYPES.join(', ')}.`);
  }

  required('destination', 'Destination');

  if (!PURPOSES.includes(v.purpose)) {
    fail('purpose', 'required', `Purpose must be one of: ${PURPOSES.join(', ')}.`);
  }
  if (v.purpose === 'other' && !String(v.purpose_note ?? '').trim()) {
    fail('purpose_note', 'conditional_required', 'Purpose note is required when purpose is "other".');
  }

  /* ------------------------------------------------------------ dates */

  const depart = parseDate(v.depart_date);
  const ret = parseDate(v.return_date);

  if (!depart) {
    fail('depart_date', 'required', 'Departure date is required, in YYYY-MM-DD format.');
  }
  if (!ret) {
    fail('return_date', 'required', 'Return date is required, in YYYY-MM-DD format.');
  }
  if (depart && ret && ret <= depart) {
    fail('return_date', 'date_order', 'Return date must be after the departure date.');
  }

  /* ------------------------------------------- international section */

  if (v.trip_type === 'international') {
    const pass = String(v.passport_number ?? '').trim().toUpperCase();
    if (!pass) {
      fail('passport_number', 'conditional_required', 'Passport number is required for international travel.');
    } else if (!PASSPORT.test(pass)) {
      fail(
        'passport_number',
        'format',
        'Passport number must be one uppercase letter followed by 7 digits, e.g. Z1234567.',
      );
    }

    const expiry = parseDate(v.passport_expiry);
    if (!expiry) {
      fail('passport_expiry', 'conditional_required', 'Passport expiry is required for international travel (YYYY-MM-DD).');
    } else if (ret) {
      const minimum = addMonths(ret, 6);
      if (expiry < minimum) {
        fail(
          'passport_expiry',
          'policy_passport_validity',
          `Passport must stay valid for 6 months after the return date. With a return of ` +
            `${fmt(ret)}, expiry must be on or after ${fmt(minimum)} — you entered ${fmt(expiry)}.`,
        );
      }
    }
  }

  /* ----------------------------------------------- money and banking */

  const amount = Number(v.amount_inr);
  if (!String(v.amount_inr ?? '').trim()) {
    fail('amount_inr', 'required', 'Claim amount is required.');
  } else if (!Number.isFinite(amount) || amount <= 0) {
    fail('amount_inr', 'format', 'Claim amount must be a positive number, in INR, digits only.');
  } else if (TRIP_TYPES.includes(v.trip_type) && amount > CAPS[v.trip_type]) {
    fail(
      'amount_inr',
      'policy_cap_exceeded',
      `${v.trip_type} travel is capped at ${money(CAPS[v.trip_type])}. You claimed ${money(amount)}. ` +
        'Reduce the amount or split the excess into a separate approval request.',
    );
  }

  const ifsc = String(v.ifsc ?? '').trim().toUpperCase();
  if (!ifsc) {
    fail('ifsc', 'required', 'IFSC code is required.');
  } else if (!IFSC.test(ifsc)) {
    fail(
      'ifsc',
      'format',
      'IFSC must be 4 letters, then a 0, then 6 alphanumeric characters, e.g. HDFC0001234.',
    );
  }

  const account = String(v.account_number ?? '').replace(/\s/g, '');
  if (!account) {
    fail('account_number', 'required', 'Account number is required.');
  } else if (!ACCOUNT.test(account)) {
    fail('account_number', 'format', 'Account number must be 9 to 18 digits.');
  }

  const wantsAdvance = v.advance_required === true || v.advance_required === 'on';
  if (wantsAdvance && !String(v.advance_reason ?? '').trim()) {
    fail('advance_reason', 'conditional_required', 'A justification is required when requesting an advance.');
  }

  return { valid: errors.length === 0, errors };
}

/** Field metadata drives both the rendered form and its tool schema. */
export const CLAIM_FIELDS = [
  { name: 'employee_name', label: 'Employee name', type: 'text', placeholder: 'Divyansh Choubey',
    hint: 'Full legal name of the traveller.' },
  { name: 'employee_email', label: 'Work email', type: 'text', placeholder: 'name@company.com',
    hint: 'Company email address. Must be a valid email.' },
  { name: 'trip_type', label: 'Trip type', type: 'select', options: TRIP_TYPES,
    hint: 'domestic or international. Choosing international reveals the passport section.' },
  { name: 'destination', label: 'Destination', type: 'text', placeholder: 'Berlin, Germany',
    hint: 'City and country of travel.' },
  { name: 'purpose', label: 'Purpose', type: 'select', options: PURPOSES,
    hint: 'Reason for travel. Choosing "other" requires a purpose note.' },
  { name: 'purpose_note', label: 'Purpose note', type: 'text', placeholder: 'Explain the trip',
    hint: 'Required only when purpose is "other".' },
  { name: 'depart_date', label: 'Departure date', type: 'date',
    hint: 'Date of departure, YYYY-MM-DD.' },
  { name: 'return_date', label: 'Return date', type: 'date',
    hint: 'Date of return, YYYY-MM-DD. Must be after the departure date.' },
  { name: 'passport_number', label: 'Passport number', type: 'text', placeholder: 'Z1234567',
    hint: 'International trips only. One uppercase letter followed by 7 digits.' },
  { name: 'passport_expiry', label: 'Passport expiry', type: 'date',
    hint: 'International trips only. Must be at least 6 months after the return date.' },
  { name: 'amount_inr', label: 'Claim amount (INR)', type: 'number', placeholder: '48000',
    hint: 'Total claim in INR. Capped at ₹60,000 domestic and ₹250,000 international.' },
  { name: 'ifsc', label: 'Bank IFSC', type: 'text', placeholder: 'HDFC0001234',
    hint: '4 letters, then 0, then 6 alphanumeric characters.' },
  { name: 'account_number', label: 'Account number', type: 'text', placeholder: '123456789012',
    hint: 'Between 9 and 18 digits.' },
  { name: 'advance_required', label: 'Request advance', type: 'checkbox',
    hint: 'Tick to request money up front. Requires a justification.' },
  { name: 'advance_reason', label: 'Advance justification', type: 'text', placeholder: 'Why the advance is needed',
    hint: 'Required only when an advance is requested.' },
];
