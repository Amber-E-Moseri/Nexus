import React, { useState, useMemo } from 'react';
import { ChevronDown, TriangleAlert, CheckCircle2, Clock, AlertCircle, FileCheck2, HelpCircle } from 'lucide-react';
import {
  deriveDocumentType,
  docNeedsAttention,
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_GROUP_LABELS,
  DOCUMENT_READINESS,
  DOCUMENT_READINESS_LABELS,
  RESIDENCY_STATUS_LABELS,
} from './icplcDocReadiness';

// ── Brand tokens (mirror RegistrationEcosystem) ─────────────────────────────
const C = {
  ink:      '#1A1220',
  purple:   '#4C2A92',
  paper:    '#FFFFFF',
  line:     '#E7E2EE',
  mute:     '#8A7F99',
  cream:    '#FAFAF8',
  green:    '#1F8A4C',
  greenBg:  '#E8F5EC',
  amber:    '#B8710A',
  amberBg:  '#FBF0DE',
  red:      '#C4383A',
  redBg:    '#FBE9E9',
  blue:     '#2A5FA5',
  blueBg:   '#E9F0FA',
};

// Readiness → visual style
const READINESS_STYLE = {
  [DOCUMENT_READINESS.READY]:               { color: C.green,  bg: C.greenBg,  label: 'Ready',               icon: CheckCircle2 },
  [DOCUMENT_READINESS.RENEWAL_IN_PROGRESS]: { color: C.blue,   bg: C.blueBg,   label: 'Renewal in progress', icon: Clock },
  [DOCUMENT_READINESS.RENEWAL_NEEDED]:      { color: C.amber,  bg: C.amberBg,  label: 'Renewal needed',      icon: AlertCircle },
  [DOCUMENT_READINESS.ISSUE]:               { color: C.red,    bg: C.redBg,    label: 'Document issue',       icon: TriangleAlert },
  [DOCUMENT_READINESS.NOT_APPLICABLE]:      { color: C.mute,   bg: '#F5F4F7',  label: 'Not applicable',       icon: CheckCircle2 },
  [DOCUMENT_READINESS.UNKNOWN]:             { color: '#6B7280', bg: '#F3F4F6', label: 'Unknown',              icon: HelpCircle },
};
const UNKNOWN_STYLE = READINESS_STYLE[DOCUMENT_READINESS.UNKNOWN];

// Document type groups shown on the page (in order)
const DOC_GROUPS = [
  DOCUMENT_TYPE.STUDY_PERMIT,
  DOCUMENT_TYPE.PGWP,
  DOCUMENT_TYPE.PR_CARD,
  DOCUMENT_TYPE.WORK_PERMIT,
];

// Readiness rows shown within each group (in order)
const READINESS_ROWS = [
  DOCUMENT_READINESS.READY,
  DOCUMENT_READINESS.RENEWAL_NEEDED,
  DOCUMENT_READINESS.RENEWAL_IN_PROGRESS,
  DOCUMENT_READINESS.ISSUE,
  DOCUMENT_READINESS.UNKNOWN,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normaliseReadiness(r) {
  if (!r.canadaResidencyStatus) return null; // no status
  const docType = deriveDocumentType(r.canadaResidencyStatus);
  if (docType === DOCUMENT_TYPE.NONE) return null;      // citizen
  if (docType === DOCUMENT_TYPE.REVIEW) return null;    // review bucket, handled separately
  return r.canadaStatusDocumentReadiness || DOCUMENT_READINESS.UNKNOWN;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PersonChip({ person, color, bg }) {
  return (
    <span style={{
      fontSize: 12, background: bg, color, padding: '2px 8px',
      borderRadius: 12, fontWeight: 500, display: 'inline-block',
    }}>
      {person.fullName || `${person.firstName} ${person.lastName}`.trim()}
      {person.subgroup && <span style={{ opacity: 0.65 }}> ({person.subgroup})</span>}
    </span>
  );
}

function ExpandableGroup({ title, count, people, color, bg, icon: Icon, expanded, onToggle }) {
  if (!count) return null;
  return (
    <div style={{ border: `1px solid ${color}33`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: bg, border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {Icon && <Icon size={14} style={{ color }} />}
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color }}>{title}</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color }}>{count}</span>
        <ChevronDown size={14} style={{ color, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {expanded && (
        <div style={{ padding: '8px 14px 12px', background: C.paper, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {people.map(p => <PersonChip key={p.email} person={p} color={color} bg={bg} />)}
        </div>
      )}
    </div>
  );
}

function DocGroupSection({ docType, people, expandedKey, onToggle }) {
  const groupLabel = DOCUMENT_TYPE_GROUP_LABELS[docType];
  const typeLabel  = DOCUMENT_TYPE_LABELS[docType];

  const byReadiness = useMemo(() => {
    const out = {};
    READINESS_ROWS.forEach(k => { out[k] = []; });
    people.forEach(r => {
      const rd = r.canadaStatusDocumentReadiness || DOCUMENT_READINESS.UNKNOWN;
      if (out[rd]) out[rd].push(r); else out[DOCUMENT_READINESS.UNKNOWN].push(r);
    });
    return out;
  }, [people]);

  if (!people.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <FileCheck2 size={14} style={{ color: C.purple }} />
        <span style={{ fontFamily: 'Space Grotesk', fontSize: 14, fontWeight: 700 }}>{groupLabel}</span>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
          background: '#EDE9FE', color: C.purple, borderRadius: 20, padding: '1px 8px',
        }}>{people.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {READINESS_ROWS.map(rd => {
          const ppl = byReadiness[rd] || [];
          if (!ppl.length) return null;
          const style = READINESS_STYLE[rd] || UNKNOWN_STYLE;
          const Icon = style.icon;
          const key = `${docType}__${rd}`;
          return (
            <ExpandableGroup
              key={key}
              title={`${typeLabel} — ${style.label}`}
              count={ppl.length}
              people={ppl}
              color={style.color}
              bg={style.bg}
              icon={Icon}
              expanded={expandedKey === key}
              onToggle={() => onToggle(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DocumentationTab({ merged }) {
  const [expandedKey, setExpandedKey] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const toggle = (key) => setExpandedKey(v => v === key ? null : key);

  // Split participants into buckets
  const { byDocType, reviewBucket, citizenBucket, noStatusBucket } = useMemo(() => {
    const byDocType = {};
    DOC_GROUPS.forEach(dt => { byDocType[dt] = []; });
    const reviewBucket  = [];
    const citizenBucket = [];
    const noStatusBucket = [];

    (merged || []).filter(r => !r.absent).forEach(r => {
      const status  = r.canadaResidencyStatus;
      const docType = deriveDocumentType(status);

      if (!status) {
        noStatusBucket.push(r);
      } else if (docType === DOCUMENT_TYPE.NONE) {
        citizenBucket.push(r);
      } else if (docType === DOCUMENT_TYPE.REVIEW) {
        reviewBucket.push(r);
      } else if (byDocType[docType]) {
        byDocType[docType].push(r);
      }
    });

    return { byDocType, reviewBucket, citizenBucket, noStatusBucket };
  }, [merged]);

  // Needs-attention items
  const attentionItems = useMemo(() => {
    const groups = {};
    (merged || []).filter(r => !r.absent).forEach(r => {
      const reason = docNeedsAttention(r);
      if (!reason) return;
      if (!groups[reason]) groups[reason] = [];
      groups[reason].push(r);
    });
    return Object.entries(groups).map(([reason, people]) => ({ reason, people }));
  }, [merged]);

  // Filter pills
  const filterOptions = useMemo(() => {
    const opts = [{ key: 'all', label: `All (${(merged || []).filter(r => !r.absent).length})` }];
    DOC_GROUPS.forEach(dt => {
      const n = byDocType[dt]?.length || 0;
      if (n) opts.push({ key: dt, label: `${DOCUMENT_TYPE_GROUP_LABELS[dt]} (${n})` });
    });
    if (reviewBucket.length)   opts.push({ key: 'review',   label: `Needs Review (${reviewBucket.length})` });
    if (citizenBucket.length)  opts.push({ key: 'citizens', label: `Citizens (${citizenBucket.length})` });
    if (noStatusBucket.length) opts.push({ key: 'unknown_status', label: `Status unknown (${noStatusBucket.length})` });
    return opts;
  }, [byDocType, reviewBucket, citizenBucket, noStatusBucket, merged]);

  const total = (merged || []).filter(r => !r.absent).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>

      {/* Needs attention */}
      {attentionItems.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <TriangleAlert size={14} style={{ color: C.amber }} />
            <span style={{ fontFamily: 'Space Grotesk', fontSize: 14, fontWeight: 700 }}>Action items</span>
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
              background: C.amberBg, color: C.amber, borderRadius: 20, padding: '1px 8px',
            }}>{attentionItems.reduce((s, g) => s + g.people.length, 0)} issues</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attentionItems.map(({ reason, people }) => {
              // Pick colour by severity
              const isIssue   = reason.includes('issue');
              const isRenewal = reason.includes('renewal needed');
              const color = isIssue ? C.red : isRenewal ? C.amber : '#6B7280';
              const bg    = isIssue ? C.redBg : isRenewal ? C.amberBg : '#F3F4F6';
              const Icon  = isIssue ? TriangleAlert : AlertCircle;
              const key   = `attention__${reason}`;
              return (
                <ExpandableGroup
                  key={key}
                  title={reason}
                  count={people.length}
                  people={people}
                  color={color}
                  bg={bg}
                  icon={Icon}
                  expanded={expandedKey === key}
                  onToggle={() => toggle(key)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Filter pills */}
      {filterOptions.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          {filterOptions.map(o => (
            <button
              key={o.key}
              onClick={() => setStatusFilter(o.key)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: '1px solid',
                borderColor: statusFilter === o.key ? C.purple : C.line,
                background: statusFilter === o.key ? '#EDE9FE' : C.paper,
                color: statusFilter === o.key ? C.purple : C.mute,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* Document type sections */}
      {(statusFilter === 'all' || DOC_GROUPS.includes(statusFilter)) && (
        DOC_GROUPS
          .filter(dt => statusFilter === 'all' || statusFilter === dt)
          .map(dt => (
            <DocGroupSection
              key={dt}
              docType={dt}
              people={byDocType[dt] || []}
              expandedKey={expandedKey}
              onToggle={toggle}
            />
          ))
      )}

      {/* Needs Review bucket */}
      {(statusFilter === 'all' || statusFilter === 'review') && reviewBucket.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <HelpCircle size={14} style={{ color: C.amber }} />
            <span style={{ fontFamily: 'Space Grotesk', fontSize: 14, fontWeight: 700 }}>Needs Review</span>
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
              background: C.amberBg, color: C.amber, borderRadius: 20, padding: '1px 8px',
            }}>{reviewBucket.length}</span>
          </div>
          <div style={{ fontSize: 12, color: C.mute, marginBottom: 10 }}>
            Visitor / Other status or Canadian status not yet collected — manual review required before travel.
          </div>
          <ExpandableGroup
            title="Visitor / Other or status unknown"
            count={reviewBucket.length}
            people={reviewBucket}
            color={C.amber}
            bg={C.amberBg}
            icon={HelpCircle}
            expanded={expandedKey === 'review__all'}
            onToggle={() => toggle('review__all')}
          />
        </div>
      )}

      {/* Status unknown bucket */}
      {(statusFilter === 'all' || statusFilter === 'unknown_status') && noStatusBucket.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <HelpCircle size={14} style={{ color: '#6B7280' }} />
            <span style={{ fontFamily: 'Space Grotesk', fontSize: 14, fontWeight: 700 }}>Canadian Status Not Collected</span>
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
              background: '#F3F4F6', color: '#6B7280', borderRadius: 20, padding: '1px 8px',
            }}>{noStatusBucket.length}</span>
          </div>
          <ExpandableGroup
            title="Status information not yet entered"
            count={noStatusBucket.length}
            people={noStatusBucket}
            color="#6B7280"
            bg="#F3F4F6"
            icon={HelpCircle}
            expanded={expandedKey === 'no_status__all'}
            onToggle={() => toggle('no_status__all')}
          />
        </div>
      )}

      {/* Citizens: no document requirement */}
      {(statusFilter === 'all' || statusFilter === 'citizens') && citizenBucket.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <CheckCircle2 size={14} style={{ color: C.green }} />
            <span style={{ fontFamily: 'Space Grotesk', fontSize: 14, fontWeight: 700 }}>Canadian Citizens</span>
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
              background: C.greenBg, color: C.green, borderRadius: 20, padding: '1px 8px',
            }}>{citizenBucket.length}</span>
          </div>
          <div style={{ fontSize: 12, color: C.mute, marginBottom: 10 }}>
            No Canadian status document requirement for this ICPLC workflow.
          </div>
          <ExpandableGroup
            title="Canadian citizens — no status document required"
            count={citizenBucket.length}
            people={citizenBucket}
            color={C.green}
            bg={C.greenBg}
            icon={CheckCircle2}
            expanded={expandedKey === 'citizens__all'}
            onToggle={() => toggle('citizens__all')}
          />
        </div>
      )}

      {/* Empty state */}
      {total === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.mute }}>
          <FileCheck2 size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>No participants to display.</div>
        </div>
      )}

      {/* Foot note */}
      <div style={{
        marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.line}`,
        fontSize: 11.5, color: C.mute, lineHeight: 1.6,
      }}>
        Canadian status document readiness is an operational tracking tool, not a legal determination.
        Nexus does not assess immigration eligibility, document validity, or admissibility.
        Update each participant's status and document readiness via Edit Registration.
      </div>
    </div>
  );
}
