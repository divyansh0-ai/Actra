import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert, CheckCircle2, Send, Eraser, Lock } from 'lucide-react';

import { store } from '../lib/instance.js';
import { CLAIM_FIELDS, CAPS, isVisible, validateClaim } from '../lib/claimRules.js';
import { reply } from '../lib/reply.js';

/**
 * The declarative WebMCP surface.
 *
 * The <form> itself is the tool — no registerTool call. The browser derives the
 * schema from `toolname` / `tooldescription` / `toolparamdescription`, fills the
 * real inputs, and submits. We answer through `event.respondWith(...)` with
 * field-addressed errors, which is what lets an agent fix its own mistakes and
 * resubmit.
 *
 * Inputs are deliberately UNCONTROLLED. An agent sets `input.value` directly,
 * and React's value tracker swallows the resulting synthetic change event — a
 * controlled form would silently ignore everything the agent typed. Reading
 * FormData at submit time is immune to that.
 */
export default function ClaimForm() {
  const formRef = useRef(null);
  const [values, setValues] = useState({ trip_type: 'domestic', purpose: 'conference' });
  const [errors, setErrors] = useState([]);
  const [accepted, setAccepted] = useState(null);

  const readForm = () => {
    const data = new FormData(formRef.current);
    const out = {};
    for (const [k, v] of data.entries()) out[k] = v;
    out.advance_required = formRef.current.elements.advance_required?.checked ?? false;
    return out;
  };

  /* Native listeners, not React's onChange/onSubmit. Two reasons, both fatal otherwise:
     1. An agent writes input.value directly; React's value tracker swallows the
        resulting change event, so synthetic onChange never fires.
     2. React's onSubmit receives a SyntheticEvent. WebMCP puts `agentInvoked` and
        `respondWith` on the NATIVE event, so a synthetic handler cannot see them —
        the tool call would silently time out and resolve null. */
  useEffect(() => {
    const form = formRef.current;
    const sync = () => setValues(readForm());
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    form.addEventListener('submit', handleSubmit);
    sync();
    return () => {
      form.removeEventListener('input', sync);
      form.removeEventListener('change', sync);
      form.removeEventListener('submit', handleSubmit);
    };
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const agentInvoked = Boolean(e.agentInvoked);
    const v = readForm();
    setValues(v);

    const { valid, errors: found } = validateClaim(v);
    setErrors(found);

    if (valid) {
      const claimId = `TC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const receipt = {
        claimId,
        employee: v.employee_name,
        destination: v.destination,
        trip_type: v.trip_type,
        window: `${v.depart_date} → ${v.return_date}`,
        amount_inr: Number(v.amount_inr),
      };
      setAccepted(receipt);
      store.logEvent(
        agentInvoked ? 'agent' : 'you',
        'submit_travel_claim',
        `Claim ${claimId} accepted — ${v.destination}, ₹${Number(v.amount_inr).toLocaleString('en-IN')}`,
      );
      if (agentInvoked) {
        e.respondWith(reply({ status: 'accepted', accepted: true, claim: receipt }));
      }
      return;
    }

    setAccepted(null);
    store.logEvent(
      agentInvoked ? 'agent' : 'you',
      'submit_travel_claim',
      `Rejected — ${found.length} validation error${found.length === 1 ? '' : 's'}: ${found
        .map((x) => x.field)
        .join(', ')}`,
    );

    if (agentInvoked) {
      // The money shot: structured, field-addressed rejections the agent can act on.
      e.respondWith(
        reply({
          status: 'rejected',
          accepted: false,
          errorCount: found.length,
          errors: found,
          hint:
            'Each error names the field and why it failed. Correct those values and call ' +
            'submit_travel_claim again — everything else you sent will be reused.',
        }),
      );
    }
  }

  const errorFor = (name) => errors.find((x) => x.field === name);

  return (
    <>
      <div className="claim-head">
        <div>
          <h2>Travel &amp; expense claim</h2>
          <p>
            Fifteen fields, conditional sections, and real policy rules — the kind of form people
            rage-quit. The agent fills it, gets rejected, and fixes itself.
          </p>
        </div>
        <span className="privacy">
          <Lock size={13} /> Stays in this tab
        </span>
      </div>

      <div className="policy">
        <strong>Policy enforced in-page:</strong> return after departure · passport valid 6 months
        past return · IFSC format · caps ₹{CAPS.domestic.toLocaleString('en-IN')} domestic / ₹
        {CAPS.international.toLocaleString('en-IN')} international
      </div>

      {accepted && (
        <div className="banner ok">
          <CheckCircle2 size={16} />
          <div>
            <strong>Claim {accepted.claimId} accepted.</strong>
            <span>
              {accepted.destination} · {accepted.window} · ₹{accepted.amount_inr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="banner bad">
          <ShieldAlert size={16} />
          <div>
            <strong>
              Rejected — {errors.length} problem{errors.length === 1 ? '' : 's'} to fix
            </strong>
            <ul>
              {errors.map((x) => (
                <li key={x.field + x.code}>
                  <code>{x.field}</code> {x.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form
        ref={formRef}
        className="claim"
        toolname="submit_travel_claim"
        tooldescription={
          'Submit a travel and expense reimbursement claim. Validates against company policy and ' +
          'returns structured, field-addressed errors when it is rejected, so you can correct the ' +
          'values and submit again. Conditional fields: passport_number and passport_expiry are ' +
          'required only when trip_type is "international"; purpose_note only when purpose is ' +
          '"other"; advance_reason only when advance_required is true.'
        }
        toolautosubmit=""
      >
        <div className="grid">
          {CLAIM_FIELDS.map((f) => {
            const shown = isVisible(f.name, values);
            const err = errorFor(f.name);
            return (
              <label
                key={f.name}
                className={`field ${f.type === 'checkbox' ? 'check-field' : ''} ${err ? 'invalid' : ''}`}
                hidden={!shown}
              >
                <span className="field-label">
                  {f.label}
                  {shown && !['purpose_note', 'advance_reason'].includes(f.name) && (
                    <i className="req">required</i>
                  )}
                </span>

                {f.type === 'select' ? (
                  <select name={f.name} defaultValue={f.options[0]} toolparamdescription={f.hint}>
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === 'checkbox' ? (
                  <input type="checkbox" name={f.name} toolparamdescription={f.hint} />
                ) : (
                  <input
                    type={f.type}
                    name={f.name}
                    placeholder={f.placeholder}
                    toolparamdescription={f.hint}
                  />
                )}

                {err ? <small className="err">{err.message}</small> : <small>{f.hint}</small>}
              </label>
            );
          })}
        </div>

        <div className="claim-actions">
          <button className="btn" type="submit"><Send size={15} /> Submit claim</button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              formRef.current.reset();
              setErrors([]);
              setAccepted(null);
              setValues(readForm());
            }}
          >
            <Eraser size={15} /> Clear
          </button>
        </div>
      </form>
    </>
  );
}
