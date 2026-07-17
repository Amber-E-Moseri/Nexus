import jsPDF from 'jspdf';

/**
 * Generate meeting minutes PDF
 * Returns Blob for upload to Drive
 */
export async function generateMinutesPDF(minutesData, meeting, agendaRows = []) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Color scheme (Nexus purple)
  const colors = {
    header: [76, 42, 146],
    headerText: [255, 255, 255],
    text: [45, 42, 34],
    muted: [158, 148, 136],
    border: [237, 232, 220],
    lightBg: [244, 241, 234],
  };

  // Header: meeting name + date/time
  const meetingDate = new Date(meeting.date);
  const dateTimeLine = `${meetingDate.toLocaleDateString()} · ${meetingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const titleLines = doc.splitTextToSize(meeting.title || 'Meeting Minutes', pageWidth - 30);
  const headerHeight = 14 + titleLines.length * 7 + 8;

  doc.setFillColor(...colors.header);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  doc.setTextColor(...colors.headerText);
  doc.setFontSize(15);
  doc.setFont('Helvetica', 'bold');
  doc.text(titleLines, 15, 15);

  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');
  doc.text(dateTimeLine, 15, 14 + titleLines.length * 7);

  // Meeting metadata
  doc.setTextColor(...colors.text);
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');

  let y = headerHeight + 10;
  const metadata = [
    `Meeting Type: ${meeting.meeting_type || 'General'}`,
    `Location: ${meeting.location || 'Virtual'}`,
    `Moderator: ${meeting.moderator_name || 'Not specified'}`,
  ];

  metadata.forEach((text) => {
    doc.text(text, 15, y);
    y += 6;
  });

  // Summary Section
  y += 8;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...colors.text);
  doc.text('Meeting Summary', 15, y);

  y += 7;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  const summaryText = minutesData.summary || 'No summary provided';
  const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 30);
  doc.text(summaryLines, 15, y);
  y += summaryLines.length * 5 + 5;

  // Decisions Made Section
  if (minutesData.decisions && Array.isArray(minutesData.decisions) && minutesData.decisions.length > 0) {
    y += 8;
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colors.text);
    doc.text('Decisions Made', 15, y);

    y += 7;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);

    minutesData.decisions.forEach((decision) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      const lines = doc.splitTextToSize(`• ${decision}`, pageWidth - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 2;
    });
  }

  // Action Items Section
  if (minutesData.actionItems && Array.isArray(minutesData.actionItems) && minutesData.actionItems.length > 0) {
    y += 8;
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colors.text);
    doc.text('Action Items', 15, y);

    y += 7;

    // Simple hand-drawn table (jspdf-autotable is not a dependency)
    const cols = [
      { header: 'Action', x: 15, width: 100 },
      { header: 'Owner', x: 115, width: 40 },
      { header: 'Due Date', x: 155, width: 40 },
    ];
    const drawTableHeader = () => {
      doc.setFillColor(...colors.header);
      doc.rect(15, y - 4.5, pageWidth - 30, 7, 'F');
      doc.setTextColor(...colors.headerText);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      cols.forEach((c) => doc.text(c.header, c.x + 2, y));
      y += 7;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...colors.text);
    };
    drawTableHeader();

    minutesData.actionItems.forEach((item, idx) => {
      const cells = [
        item.action || '',
        item.owner || 'Unassigned',
        item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No date',
      ];
      const wrapped = cells.map((text, i) => doc.splitTextToSize(String(text), cols[i].width - 4));
      const rowLines = Math.max(...wrapped.map((w) => w.length));
      const rowHeight = rowLines * 4.5 + 3;

      if (y + rowHeight > pageHeight - 15) {
        doc.addPage();
        y = 20;
        drawTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(...colors.lightBg);
        doc.rect(15, y - 4, pageWidth - 30, rowHeight, 'F');
      }
      wrapped.forEach((lines, i) => doc.text(lines, cols[i].x + 2, y));
      y += rowHeight;
    });
    y += 5;
  }

  // Next Steps Section (if available)
  if (minutesData.nextSteps && minutesData.nextSteps.length > 0) {
    y += 8;
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colors.text);
    doc.text('Next Steps', 15, y);

    y += 7;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);

    minutesData.nextSteps.forEach((step) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      const lines = doc.splitTextToSize(`• ${step}`, pageWidth - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 2;
    });
  }

  // Key Points Section (if available)
  if (minutesData.keyPoints && minutesData.keyPoints.length > 0) {
    y += 10;

    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colors.text);
    doc.text('Key Points', 15, y);

    y += 7;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);

    minutesData.keyPoints.forEach((point) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      const lines = doc.splitTextToSize(`• ${point}`, pageWidth - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 2;
    });
  }

  // Detailed Notes Section (cleaned-up transcript, markdown-lite)
  if (minutesData.detailedNotes && minutesData.detailedNotes.trim()) {
    y += 10;
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...colors.text);
    doc.text('Detailed Notes', 15, y);
    y += 8;

    const notesLines = minutesData.detailedNotes.split('\n');
    notesLines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) { y += 3; return; }

      const isHeading = /^#{1,6}\s*/.test(line);
      const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '');

      doc.setFont('Helvetica', isHeading ? 'bold' : 'normal');
      doc.setFontSize(isHeading ? 11 : 10);
      doc.setTextColor(...colors.text);

      if (isHeading && y > 20) y += 3;
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      const wrapped = doc.splitTextToSize(cleaned, pageWidth - 30);
      doc.text(wrapped, 15, y);
      y += wrapped.length * 5 + (isHeading ? 3 : 2);
    });
  }

  // Footer on each page
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, {
      align: 'center',
    });

    // Date generated
    doc.setFontSize(7);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 15, pageHeight - 8);
  }

  // Return as Blob
  return doc.output('blob');
}

/**
 * Generate filename for PDF based on meeting context
 */
export function generateMinutesPDFFilename(meeting) {
  const date = new Date(meeting.date);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const meetingType = (meeting.meeting_type || 'meeting')
    .toLowerCase()
    .replace(/\s+/g, '_');

  return `BLW_Minutes_${dateStr}_${meetingType}_final.pdf`;
}
