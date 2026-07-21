import jsPDF from 'jspdf';

const C = {
  purple:    [76, 42, 146],
  purpleDk:  [30, 14, 62],
  purpleLt:  [243, 237, 253],
  white:     [255, 255, 255],
  text:      [28, 28, 28],
  muted:     [122, 111, 94],
  border:    [229, 221, 208],
  lightBg:   [250, 250, 248],
  green:     [45, 134, 83],
  greenLt:   [236, 249, 241],
  amber:     [180, 120, 20],
  amberLt:   [255, 248, 230],
  red:       [201, 72, 48],
  redLt:     [254, 240, 237],
};

const MARGIN = 15;
const PAGE_BOTTOM = 22;

function ensureSpace(doc, y, needed) {
  const h = doc.internal.pageSize.getHeight();
  if (y + needed > h - PAGE_BOTTOM) {
    doc.addPage();
    return 20;
  }
  return y;
}

function drawSectionHeader(doc, y, title, pageWidth) {
  y = ensureSpace(doc, y, 18);
  doc.setFillColor(...C.purple);
  doc.rect(MARGIN, y - 1, pageWidth - MARGIN * 2, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.white);
  doc.text(title.toUpperCase(), MARGIN + 4, y + 4.5);
  return y + 12;
}

function drawDivider(doc, y, pageWidth) {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  return y + 4;
}

function wrapText(doc, text, maxWidth, fontSize) {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, maxWidth);
}

export async function generateMinutesPDF(minutesData, meeting) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const contentWidth = pw - MARGIN * 2;
  const meetingDate = new Date(meeting.date);
  const dateStr = meetingDate.toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = meetingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ── PAGE 1: COVER HEADER ──────────────────────────────────────────────────

  // Full-width gradient header
  const headerH = 42;
  doc.setFillColor(...C.purpleDk);
  doc.rect(0, 0, pw, headerH, 'F');
  doc.setFillColor(...C.purple);
  doc.rect(0, 0, pw * 0.65, headerH, 'F');

  // Title
  doc.setTextColor(...C.white);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(meeting.title || 'Meeting Minutes', pw - 40);
  doc.text(titleLines, MARGIN + 2, 15);

  // Date + type badge
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 210, 240);
  doc.text(`${dateStr}  ·  ${timeStr}`, MARGIN + 2, 14 + titleLines.length * 7);
  const typeLabel = (meeting.meeting_type || 'General').replace(/_/g, ' ');
  doc.text(typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1), pw - MARGIN - 2, 14 + titleLines.length * 7, { align: 'right' });

  // Confidential badge
  doc.setFontSize(6.5);
  doc.setTextColor(200, 190, 220);
  doc.text('CONFIDENTIAL — BLW CAN NEXUS', MARGIN + 2, headerH - 4);

  let y = headerH + 8;

  // ── MEETING INFO BAR ──────────────────────────────────────────────────────

  const infoPairs = [
    ['Meeting Type', typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)],
    ['Date', dateStr],
    ['Time', timeStr],
  ];
  if (meeting.location) infoPairs.push(['Location', meeting.location]);
  if (meeting.moderator_name) infoPairs.push(['Moderator', meeting.moderator_name]);

  doc.setFillColor(...C.lightBg);
  doc.roundedRect(MARGIN, y, contentWidth, 16, 2, 2, 'F');
  doc.setFontSize(7.5);
  const colW = contentWidth / infoPairs.length;
  infoPairs.forEach(([label, value], i) => {
    const x = MARGIN + i * colW + 5;
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(label.toUpperCase(), x, y + 6);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.setFontSize(8);
    doc.text(String(value).substring(0, 28), x, y + 11.5);
    doc.setFontSize(7.5);
  });
  y += 22;

  // ── ATTENDEES ─────────────────────────────────────────────────────────────

  const attendees = minutesData.attendees || [];
  if (attendees.length > 0) {
    y = drawSectionHeader(doc, y, 'Attendance', pw);
    const present = attendees.filter(a => a.status === 'present');
    const absent = attendees.filter(a => a.status !== 'present');

    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');

    // Present
    if (present.length > 0) {
      doc.setTextColor(...C.green);
      doc.setFont('Helvetica', 'bold');
      doc.text(`Present (${present.length})`, MARGIN, y);
      y += 5;
      doc.setTextColor(...C.text);
      doc.setFont('Helvetica', 'normal');
      const names = present.map(a => a.name).sort();
      const cols = 3;
      const colWidth = contentWidth / cols;
      for (let i = 0; i < names.length; i += cols) {
        y = ensureSpace(doc, y, 5);
        for (let c = 0; c < cols && i + c < names.length; c++) {
          doc.setFillColor(...C.greenLt);
          doc.circle(MARGIN + c * colWidth + 2, y - 1, 1.2, 'F');
          doc.text(names[i + c], MARGIN + c * colWidth + 6, y);
        }
        y += 4.5;
      }
      y += 2;
    }

    // Absent
    if (absent.length > 0) {
      y = ensureSpace(doc, y, 8);
      doc.setTextColor(...C.red);
      doc.setFont('Helvetica', 'bold');
      doc.text(`Absent (${absent.length})`, MARGIN, y);
      y += 5;
      doc.setTextColor(...C.muted);
      doc.setFont('Helvetica', 'normal');
      const names = absent.map(a => a.name).sort();
      const line = names.join('  ·  ');
      const wrapped = doc.splitTextToSize(line, contentWidth);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 4 + 2;
    }
    y += 4;
  }

  // ── AGENDA ────────────────────────────────────────────────────────────────

  const agendaItems = minutesData.agenda || [];
  if (agendaItems.length > 0) {
    y = drawSectionHeader(doc, y, 'Agenda', pw);
    agendaItems.forEach((item, idx) => {
      y = ensureSpace(doc, y, 8);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.purple);
      doc.text(`${idx + 1}.`, MARGIN, y);
      doc.setTextColor(...C.text);
      const titleW = contentWidth - 30;
      const lines = doc.splitTextToSize(item.title, titleW);
      doc.text(lines, MARGIN + 8, y);
      if (item.mins) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.muted);
        doc.text(`${item.mins} min`, pw - MARGIN, y, { align: 'right' });
      }
      y += lines.length * 4.5 + 3;
    });
    y += 3;
  }

  // ── SUMMARY / AI NOTES ────────────────────────────────────────────────────

  const summaryText = minutesData.summary || '';
  if (summaryText.trim()) {
    y = drawSectionHeader(doc, y, 'Meeting Summary', pw);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.text);

    const paras = summaryText.split('\n');
    paras.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) { y += 2; return; }

      const isHeading = /^#{1,6}\s/.test(line);
      const isBullet = /^[•\-*]\s/.test(line);
      const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');

      if (isHeading) {
        y = ensureSpace(doc, y, 10);
        y += 2;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...C.purple);
        const wrapped = doc.splitTextToSize(cleaned, contentWidth);
        doc.text(wrapped, MARGIN, y);
        y += wrapped.length * 5 + 2;
        doc.setTextColor(...C.text);
        doc.setFontSize(9);
      } else if (isBullet) {
        y = ensureSpace(doc, y, 6);
        doc.setFont('Helvetica', 'normal');
        const bulletText = line.replace(/^[•\-*]\s*/, '');
        const wrapped = doc.splitTextToSize(bulletText, contentWidth - 8);
        doc.setFillColor(...C.purple);
        doc.circle(MARGIN + 2, y - 1, 0.8, 'F');
        doc.text(wrapped, MARGIN + 7, y);
        y += wrapped.length * 4.5 + 1.5;
      } else {
        y = ensureSpace(doc, y, 6);
        doc.setFont('Helvetica', 'normal');
        const wrapped = doc.splitTextToSize(cleaned, contentWidth);
        doc.text(wrapped, MARGIN, y);
        y += wrapped.length * 4.5 + 1.5;
      }
    });
    y += 4;
  }

  // ── DETAILED NOTES / MINUTES ──────────────────────────────────────────────

  const detailedNotes = minutesData.detailedNotes || '';
  if (detailedNotes.trim() && detailedNotes.trim() !== summaryText.trim()) {
    y = drawSectionHeader(doc, y, 'Detailed Minutes', pw);
    doc.setFontSize(9);

    const paras = detailedNotes.split('\n');
    paras.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) { y += 2; return; }

      const isHeading = /^#{1,6}\s/.test(line);
      const isBullet = /^[•\-*]\s/.test(line);
      const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');

      if (isHeading) {
        y = ensureSpace(doc, y, 10);
        y += 2;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...C.purple);
        const wrapped = doc.splitTextToSize(cleaned, contentWidth);
        doc.text(wrapped, MARGIN, y);
        y += wrapped.length * 5 + 2;
        doc.setTextColor(...C.text);
        doc.setFontSize(9);
      } else if (isBullet) {
        y = ensureSpace(doc, y, 6);
        doc.setFont('Helvetica', 'normal');
        const bulletText = line.replace(/^[•\-*]\s*/, '');
        const wrapped = doc.splitTextToSize(bulletText, contentWidth - 8);
        doc.setFillColor(...C.purple);
        doc.circle(MARGIN + 2, y - 1, 0.8, 'F');
        doc.text(wrapped, MARGIN + 7, y);
        y += wrapped.length * 4.5 + 1.5;
      } else {
        y = ensureSpace(doc, y, 6);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(...C.text);
        const wrapped = doc.splitTextToSize(cleaned, contentWidth);
        doc.text(wrapped, MARGIN, y);
        y += wrapped.length * 4.5 + 1.5;
      }
    });
    y += 4;
  }

  // ── DECISIONS ─────────────────────────────────────────────────────────────

  const decisions = minutesData.decisions || [];
  if (decisions.length > 0) {
    y = drawSectionHeader(doc, y, 'Decisions Made', pw);
    decisions.forEach((decision, idx) => {
      y = ensureSpace(doc, y, 8);
      doc.setFillColor(...C.purpleLt);
      const lines = wrapText(doc, decision, contentWidth - 14, 9);
      const boxH = lines.length * 4.5 + 6;
      doc.roundedRect(MARGIN, y - 3, contentWidth, boxH, 1.5, 1.5, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C.purple);
      doc.text(`${idx + 1}`, MARGIN + 4, y + 1);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.text);
      doc.text(lines, MARGIN + 10, y + 1);
      y += boxH + 3;
    });
    y += 3;
  }

  // ── ACTION ITEMS ──────────────────────────────────────────────────────────

  const actions = minutesData.actionItems || [];
  if (actions.length > 0) {
    y = drawSectionHeader(doc, y, `Action Items (${actions.length})`, pw);

    // Table header
    const drawTableHeader = () => {
      y = ensureSpace(doc, y, 12);
      doc.setFillColor(...C.purpleDk);
      doc.rect(MARGIN, y - 4, contentWidth, 8, 'F');
      doc.setTextColor(...C.white);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('ACTION', MARGIN + 4, y);
      doc.text('OWNER', MARGIN + contentWidth * 0.58, y);
      doc.text('DUE DATE', MARGIN + contentWidth * 0.78, y);
      y += 6;
    };
    drawTableHeader();

    actions.forEach((item, idx) => {
      const actionLines = wrapText(doc, item.action || '', contentWidth * 0.54, 8.5);
      const rowH = Math.max(actionLines.length * 4.2, 6) + 4;

      if (y + rowH > doc.internal.pageSize.getHeight() - PAGE_BOTTOM) {
        doc.addPage();
        y = 20;
        drawTableHeader();
      }

      if (idx % 2 === 0) {
        doc.setFillColor(...C.lightBg);
        doc.rect(MARGIN, y - 3, contentWidth, rowH, 'F');
      }

      // Left border accent
      doc.setFillColor(...C.purple);
      doc.rect(MARGIN, y - 3, 1.5, rowH, 'F');

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.text);
      doc.text(actionLines, MARGIN + 4, y + 1);

      doc.setFontSize(8);
      doc.setTextColor(...C.muted);
      doc.text(item.owner || 'Unassigned', MARGIN + contentWidth * 0.58, y + 1);

      const dueText = item.dueDate
        ? new Date(item.dueDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
        : '—';
      doc.text(dueText, MARGIN + contentWidth * 0.78, y + 1);

      y += rowH;
    });
    y += 6;
  }

  // ── OPEN ITEMS / DISCUSSION POINTS ────────────────────────────────────────

  const openItemsList = minutesData.openItems || [];
  if (openItemsList.length > 0) {
    y = drawSectionHeader(doc, y, 'Open Items & Discussion Points', pw);

    const typeColors = {
      exploration: { bg: C.purpleLt, dot: C.purple, label: 'Explore' },
      decision_needed: { bg: C.amberLt, dot: C.amber, label: 'Decision Needed' },
      blocker: { bg: C.redLt, dot: C.red, label: 'Blocker' },
      follow_up: { bg: C.greenLt, dot: C.green, label: 'Follow Up' },
    };

    openItemsList.forEach((item) => {
      const tc = typeColors[item.type] || typeColors.exploration;
      const lines = wrapText(doc, item.text, contentWidth - 30, 8.5);
      const boxH = lines.length * 4.5 + 7;

      y = ensureSpace(doc, y, boxH + 2);

      // Card background
      doc.setFillColor(...tc.bg);
      doc.roundedRect(MARGIN, y - 3, contentWidth, boxH, 1.5, 1.5, 'F');

      // Type dot
      doc.setFillColor(...tc.dot);
      doc.circle(MARGIN + 5, y + 1, 1.5, 'F');

      // Type label
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...tc.dot);
      doc.text(tc.label.toUpperCase(), MARGIN + 10, y + 1.5);

      // Status badge
      const isResolved = item.status === 'resolved' || item.status === 'closed';
      if (isResolved) {
        doc.setFillColor(...C.green);
        doc.roundedRect(pw - MARGIN - 18, y - 2, 16, 5, 1, 1, 'F');
        doc.setTextColor(...C.white);
        doc.setFontSize(5.5);
        doc.text('RESOLVED', pw - MARGIN - 16.5, y + 1.5);
      }

      // Item text
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.text);
      doc.text(lines, MARGIN + 10, y + 6);

      y += boxH + 3;
    });
    y += 3;
  }

  // ── DETECTED ENTITIES (flexible extraction) ────────────────────────────────

  const detectedEntities = minutesData.detectedEntities || {};
  const entityTypes = Object.keys(detectedEntities).filter(
    (k) => detectedEntities[k]?.detected && detectedEntities[k]?.items?.length > 0
  );

  if (entityTypes.length > 0) {
    y = drawSectionHeader(doc, y, 'Detected Content', pw);

    const entityLabels = {
      testimonies: 'Testimonies', pledges: 'Pledges', teaching_sessions: 'Teaching Sessions',
      announcements: 'Announcements', attendance_metrics: 'Attendance Metrics',
      recognition_segments: 'Recognition', campaigns: 'Campaigns',
      strategic_initiatives: 'Strategic Initiatives', budget_discussions: 'Budget Discussions',
      q_and_a: 'Q&A', other: 'Other',
    };

    entityTypes.forEach((type) => {
      const entity = detectedEntities[type];
      const label = entityLabels[type] || type.replace(/_/g, ' ');

      y = ensureSpace(doc, y, 12);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.purple);
      doc.text(`${label} (${entity.count})`, MARGIN, y);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.muted);
      doc.text(`${Math.round(entity.confidence * 100)}% confidence`, MARGIN + contentWidth * 0.7, y, { align: 'right' });
      y += 5;

      if (type === 'pledges') {
        const cols = ['Person', 'Type', 'Amount', 'Region', 'Target Date'];
        const colW = contentWidth / cols.length;
        y = ensureSpace(doc, y, 8);
        doc.setFillColor(...C.purpleLt);
        doc.rect(MARGIN, y - 3, contentWidth, 6, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...C.purple);
        cols.forEach((col, ci) => doc.text(col, MARGIN + ci * colW + 2, y));
        y += 5;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.text);
        entity.items.forEach((p, pi) => {
          y = ensureSpace(doc, y, 5);
          if (pi % 2 === 0) { doc.setFillColor(...C.lightBg); doc.rect(MARGIN, y - 3, contentWidth, 5, 'F'); }
          const vals = [p.person || '', p.commitment_type || '', p.amount || '—', p.region || '—', p.target_date || '—'];
          vals.forEach((v, vi) => doc.text(String(v).substring(0, 22), MARGIN + vi * colW + 2, y));
          y += 4.5;
        });
        y += 3;
      } else if (type === 'testimonies') {
        entity.items.forEach((t) => {
          const desc = `${t.person || 'Unknown'}${t.campus ? ` (${t.campus})` : ''} — ${t.theme || ''}`;
          const lines = wrapText(doc, desc, contentWidth - 10, 8.5);
          const boxH = lines.length * 4.5 + 6;
          y = ensureSpace(doc, y, boxH);
          doc.setFillColor(...C.purpleLt);
          doc.roundedRect(MARGIN, y - 3, contentWidth, boxH, 1.5, 1.5, 'F');
          doc.setFillColor(...C.purple);
          doc.rect(MARGIN, y - 3, 1.5, boxH, 'F');
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...C.text);
          doc.text(lines, MARGIN + 5, y + 1);
          if (t.key_decision) {
            doc.setFontSize(7.5);
            doc.setTextColor(...C.muted);
            const kdLines = wrapText(doc, `Key decision: ${t.key_decision}`, contentWidth - 12, 7.5);
            doc.text(kdLines, MARGIN + 5, y + lines.length * 4.5 + 1);
          }
          y += boxH + 2;
        });
        y += 2;
      } else if (type === 'teaching_sessions') {
        entity.items.forEach((t) => {
          const title = t.title || 'Untitled';
          const meta = [t.facilitator, t.estimated_duration].filter(Boolean).join(' · ');
          const topics = (t.core_topics || []).join(', ');
          const scripture = (t.scripture || []).join(', ');
          const lines = wrapText(doc, title, contentWidth - 10, 9);
          let boxH = lines.length * 4.5 + 4;
          if (meta) boxH += 4.5;
          if (topics) boxH += 4.5;
          if (scripture) boxH += 4.5;
          y = ensureSpace(doc, y, boxH + 2);
          doc.setFillColor(...C.lightBg);
          doc.roundedRect(MARGIN, y - 3, contentWidth, boxH, 1.5, 1.5, 'F');
          doc.setFillColor(37, 99, 235);
          doc.rect(MARGIN, y - 3, 1.5, boxH, 'F');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(...C.text);
          doc.text(lines, MARGIN + 5, y + 1);
          let subY = y + lines.length * 4.5 + 1;
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...C.muted);
          if (meta) { doc.text(meta, MARGIN + 5, subY); subY += 4.5; }
          if (topics) { doc.text(`Topics: ${topics}`, MARGIN + 5, subY); subY += 4.5; }
          if (scripture) { doc.setTextColor(...C.purple); doc.text(`Scripture: ${scripture}`, MARGIN + 5, subY); }
          y += boxH + 3;
        });
        y += 2;
      } else if (type === 'campaigns') {
        entity.items.forEach((c) => {
          const desc = `${c.campaign_name || 'Campaign'}${c.goal ? ` — Goal: ${c.goal}` : ''}${c.target ? ` — Target: ${c.target}` : ''}`;
          const lines = wrapText(doc, desc, contentWidth - 10, 8.5);
          const boxH = lines.length * 4.5 + 6;
          y = ensureSpace(doc, y, boxH);
          doc.setFillColor(...C.redLt);
          doc.roundedRect(MARGIN, y - 3, contentWidth, boxH, 1.5, 1.5, 'F');
          doc.setFillColor(...C.red);
          doc.rect(MARGIN, y - 3, 1.5, boxH, 'F');
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...C.text);
          doc.text(lines, MARGIN + 5, y + 1);
          y += boxH + 2;
        });
        y += 2;
      } else if (type === 'recognition_segments') {
        entity.items.forEach((r) => {
          const recipients = (r.recipients || []).join(', ');
          const desc = `${r.award_type || 'Recognition'}${r.period ? ` (${r.period})` : ''}: ${recipients || 'N/A'}`;
          const lines = wrapText(doc, desc, contentWidth - 10, 8.5);
          const boxH = lines.length * 4.5 + 6;
          y = ensureSpace(doc, y, boxH);
          doc.setFillColor(...C.amberLt);
          doc.roundedRect(MARGIN, y - 3, contentWidth, boxH, 1.5, 1.5, 'F');
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...C.text);
          doc.text(lines, MARGIN + 5, y + 1);
          y += boxH + 2;
        });
        y += 2;
      } else if (type === 'attendance_metrics') {
        entity.items.forEach((m) => {
          y = ensureSpace(doc, y, 5);
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...C.text);
          doc.text(`${m.metric}: `, MARGIN + 4, y);
          const labelW = doc.getTextWidth(`${m.metric}: `);
          doc.setFont('Helvetica', 'normal');
          doc.setTextColor(...C.purple);
          doc.text(String(m.value), MARGIN + 4 + labelW, y);
          if (m.comparison) {
            doc.setFontSize(7);
            doc.setTextColor(...C.muted);
            doc.text(m.comparison, MARGIN + 4 + labelW + doc.getTextWidth(String(m.value)) + 4, y);
          }
          y += 4.5;
        });
        y += 3;
      } else {
        entity.items.forEach((item) => {
          const text = item.content || item.question || item.initiative || item.topic || item.label || item.description || JSON.stringify(item);
          const lines = wrapText(doc, String(text), contentWidth - 8, 8.5);
          y = ensureSpace(doc, y, lines.length * 4.5 + 2);
          doc.setFillColor(...C.purple);
          doc.circle(MARGIN + 2, y - 1, 0.8, 'F');
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...C.text);
          doc.text(lines, MARGIN + 7, y);
          y += lines.length * 4.5 + 2;
        });
        y += 3;
      }
    });
    y += 3;
  }

  // ── NEXT STEPS ────────────────────────────────────────────────────────────

  const nextSteps = minutesData.nextSteps || [];
  if (nextSteps.length > 0) {
    y = drawSectionHeader(doc, y, 'Next Steps', pw);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.text);

    nextSteps.forEach((step, idx) => {
      y = ensureSpace(doc, y, 7);
      doc.setFillColor(...C.green);
      doc.circle(MARGIN + 2, y - 1, 1, 'F');
      doc.setFont('Helvetica', 'normal');
      const lines = doc.splitTextToSize(step, contentWidth - 10);
      doc.text(lines, MARGIN + 7, y);
      y += lines.length * 4.5 + 2;
    });
    y += 4;
  }

  // ── TRANSCRIPT (collapsed) ────────────────────────────────────────────────

  const transcript = minutesData.transcript || '';
  if (transcript.trim() && transcript.trim() !== summaryText.trim() && transcript.trim() !== detailedNotes.trim()) {
    doc.addPage();
    y = 20;
    y = drawSectionHeader(doc, y, 'Full Transcript', pw);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);

    const tLines = transcript.split('\n');
    tLines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) { y += 2; return; }
      y = ensureSpace(doc, y, 5);
      const wrapped = doc.splitTextToSize(line, contentWidth);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 3.8 + 1;
    });
  }

  // ── FOOTER ON EVERY PAGE ──────────────────────────────────────────────────

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.getHeight();

    // Bottom bar
    doc.setFillColor(...C.purpleDk);
    doc.rect(0, ph - 12, pw, 12, 'F');

    doc.setFontSize(6.5);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(180, 170, 200);
    doc.text('BLW CAN NEXUS', MARGIN, ph - 5);
    doc.text(meeting.title || '', pw / 2, ph - 5, { align: 'center' });
    doc.text(`Page ${i} of ${totalPages}`, pw - MARGIN, ph - 5, { align: 'right' });
  }

  return doc.output('blob');
}

export function generateMinutesPDFFilename(meeting) {
  const date = new Date(meeting.date);
  const dateStr = date.toISOString().split('T')[0];
  const meetingType = (meeting.meeting_type || 'meeting').toLowerCase().replace(/\s+/g, '_');
  return `BLW_Minutes_${dateStr}_${meetingType}.pdf`;
}
