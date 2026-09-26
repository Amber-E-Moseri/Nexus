import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  RESIDENCY_STATUS,
  RESIDENCY_STATUS_LABELS,
  DOCUMENT_READINESS,
  DOCUMENT_READINESS_LABELS,
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_LABELS,
  deriveDocumentType,
} from '../../features/registration/icplcDocReadiness';

// ── Brand tokens ────────────────────────────────────────────────────────────
const C = {
  ink:     '#1A1220',
  purple:  '#4C2A92',
  cream:   '#FAFAF8',
  paper:   '#FFFFFF',
  line:    '#E7E2EE',
  mute:    '#8A7F99',
  green:   '#1F8A4C',
  greenBg: '#E8F5EC',
  amber:   '#B8710A',
  amberBg: '#FBF0DE',
  red:     '#C4383A',
  redBg:   '#FBE9E9',
};

// Document readiness options shown to participants (excludes NOT_APPLICABLE)
const PARTICIPANT_READINESS_OPTIONS = [
  { value: DOCUMENT_READINESS.READY,               label: 'Ready' },
  { value: DOCUMENT_READINESS.RENEWAL_IN_PROGRESS, label: 'Renewal in progress' },
  { value: DOCUMENT_READINESS.RENEWAL_NEEDED,      label: 'Renewal needed' },
  { value: DOCUMENT_READINESS.ISSUE,               label: 'I have an issue with my document' },
  { value: DOCUMENT_READINESS.UNKNOWN,             label: "I'm not sure" },
];

// Canadian status options shown to participants
const PARTICIPANT_STATUS_OPTIONS = [
  { value: RESIDENCY_STATUS.CANADIAN_CITIZEN,       label: 'Canadian Citizen' },
  { value: RESIDENCY_STATUS.PERMANENT_RESIDENT,     label: 'Permanent Resident' },
  { value: RESIDENCY_STATUS.INTERNATIONAL_STUDENT,  label: 'International Student' },
  { value: RESIDENCY_STATUS.POST_GRADUATION_WORKER, label: 'Post-Graduation Work Permit (PGWP) holder' },
  { value: RESIDENCY_STATUS.WORK_PERMIT,            label: 'Work Permit holder' },
  { value: RESIDENCY_STATUS.VISITOR_OTHER,          label: 'Visitor or Other' },
];

// Human-readable label for the document type the participant needs to provide
function docPrompt(docType) {
  switch (docType) {
    case DOCUMENT_TYPE.STUDY_PERMIT: return 'Study Permit';
    case DOCUMENT_TYPE.PGWP:         return 'Post-Graduation Work Permit (PGWP)';
    case DOCUMENT_TYPE.WORK_PERMIT:  return 'Work Permit';
    case DOCUMENT_TYPE.PR_CARD:      return 'PR Card';
    default:                         return null;
  }
}

export default function ICPLCDocUpdatePage() {
  const { token } = useParams();
  const [phase, setPhase]     = useState('loading'); // loading | form | submitting | success | error | invalid
  const [info, setInfo]       = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [residencyStatus, setResidencyStatus] = useState('');
  const [docReadiness,    setDocReadiness]    = useState('');

  useEffect(() => {
    if (!token) { setPhase('invalid'); return; }
    supabase.rpc('icplc_get_doc_form_info', { p_token: token })
      .then(({ data, error }) => {
        if (error || !data?.ok) {
          setPhase('invalid');
          return;
        }
        setInfo(data);
        setResidencyStatus(data.canada_residency_status || '');
        setDocReadiness(data.canada_status_document_readiness || '');
        setPhase('form');
      });
  }, [token]);

  const handleStatusChange = (v) => {
    setResidencyStatus(v);
    // Reset readiness when status changes — previous value may be for a different document type
    setDocReadiness('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!residencyStatus) return;
    setPhase('submitting');
    setErrorMsg('');
    try {
      const { data, error } = await supabase.rpc('icplc_update_documentation', {
        p_token: token,
        p_residency_status: residencyStatus,
        p_doc_readiness: docReadiness || null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Submission failed');
      setPhase('success');
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setPhase('form');
    }
  };

  const docType = deriveDocumentType(residencyStatus);
  const docLabel = docPrompt(docType);
  const needsDocQuestion = residencyStatus && docType !== DOCUMENT_TYPE.NONE && docType !== DOCUMENT_TYPE.REVIEW;

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <PageWrapper>
        <div style={{ color: C.mute, fontSize: 14, textAlign: 'center', padding: '60px 0' }}>Loading…</div>
      </PageWrapper>
    );
  }

  // ── Invalid / expired ──
  if (phase === 'invalid') {
    return (
      <PageWrapper>
        <div style={{ textAlign: 'center', maxWidth: 400, margin: '0 auto', padding: '60px 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Invalid or expired link</div>
          <div style={{ fontSize: 14, color: C.mute }}>
            This link is no longer valid. Contact your ICPLC coordinator for an updated link.
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ── Success ──
  if (phase === 'success') {
    return (
      <PageWrapper eventName={info?.event_name}>
        <div style={{ textAlign: 'center', maxWidth: 440, margin: '0 auto', padding: '60px 16px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Information received</div>
          <div style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
            Thank you{info?.first_name ? `, ${info.first_name}` : ''}. Your document readiness information has been recorded.
            The ICPLC team will follow up if anything needs attention.
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ── Form ──
  return (
    <PageWrapper eventName={info?.event_name}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px' }}>
        {info?.first_name && (
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
            Hi {info.first_name}
          </div>
        )}
        <div style={{ fontSize: 14, color: C.mute, marginBottom: 28, lineHeight: 1.6 }}>
          Please confirm your Canadian status and document readiness for {info?.event_name || 'ICPLC'}.
          This helps the team track operational travel readiness.
        </div>

        {errorMsg && (
          <div style={{ background: C.redBg, color: C.red, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Canadian Status */}
          <FieldBlock label="What is your current Canadian status?">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PARTICIPANT_STATUS_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${residencyStatus === opt.value ? C.purple : C.line}`,
                    background: residencyStatus === opt.value ? '#EDE9FE' : C.paper,
                  }}
                >
                  <input
                    type="radio"
                    name="residency_status"
                    value={opt.value}
                    checked={residencyStatus === opt.value}
                    onChange={() => handleStatusChange(opt.value)}
                    style={{ accentColor: C.purple }}
                  />
                  <span style={{ fontSize: 14, color: residencyStatus === opt.value ? C.purple : C.ink, fontWeight: residencyStatus === opt.value ? 600 : 400 }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </FieldBlock>

          {/* Canadian Citizen note */}
          {residencyStatus === RESIDENCY_STATUS.CANADIAN_CITIZEN && (
            <div style={{ background: C.greenBg, color: C.green, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 4, marginBottom: 20 }}>
              No Canadian status document is required for this workflow. You can submit now.
            </div>
          )}

          {/* Visitor/Other note */}
          {residencyStatus === RESIDENCY_STATUS.VISITOR_OTHER && (
            <div style={{ background: C.amberBg, color: C.amber, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginTop: 4, marginBottom: 20 }}>
              The ICPLC team will be in touch to confirm your travel documentation needs.
            </div>
          )}

          {/* Document readiness — conditional on status */}
          {needsDocQuestion && (
            <FieldBlock label={`How is your ${docLabel} readiness?`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PARTICIPANT_READINESS_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${docReadiness === opt.value ? C.purple : C.line}`,
                      background: docReadiness === opt.value ? '#EDE9FE' : C.paper,
                    }}
                  >
                    <input
                      type="radio"
                      name="doc_readiness"
                      value={opt.value}
                      checked={docReadiness === opt.value}
                      onChange={() => setDocReadiness(opt.value)}
                      style={{ accentColor: C.purple }}
                    />
                    <span style={{ fontSize: 14, color: docReadiness === opt.value ? C.purple : C.ink, fontWeight: docReadiness === opt.value ? 600 : 400 }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </FieldBlock>
          )}

          <button
            type="submit"
            disabled={!residencyStatus || phase === 'submitting'}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 8, border: 'none',
              background: C.purple, color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: !residencyStatus || phase === 'submitting' ? 'not-allowed' : 'pointer',
              opacity: !residencyStatus || phase === 'submitting' ? 0.5 : 1,
              marginTop: 8, fontFamily: 'Inter, sans-serif',
            }}
          >
            {phase === 'submitting' ? 'Submitting…' : 'Submit'}
          </button>
        </form>

        <div style={{ marginTop: 28, fontSize: 11.5, color: C.mute, lineHeight: 1.6, textAlign: 'center' }}>
          This form tracks operational readiness to help the ICPLC team plan travel logistics.
          It is not a legal immigration assessment and does not determine your eligibility to travel.
        </div>
      </div>
    </PageWrapper>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function PageWrapper({ children, eventName }) {
  return (
    <div style={{ minHeight: '100vh', background: C.cream, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: C.purple, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 16, color: '#fff' }}>
          {eventName || 'ICPLC'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Document Readiness Form</div>
      </div>
      {children}
    </div>
  );
}

function FieldBlock({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}
