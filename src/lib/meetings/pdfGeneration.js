import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

  // Header
  doc.setFillColor(...colors.header);
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setTextColor(...colors.headerText);
  doc.setFontSize(16);
  doc.setFont('Helvetica', 'bold');
  doc.text('BLW CANADA MEETING MINUTES', 15, 15);

  // Meeting metadata
  doc.setTextColor(...colors.text);
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');

  let y = 35;
  const metadata = [
    `Meeting Type: ${meeting.meeting_type || 'General'}`,
    `Date: ${new Date(meeting.date).toLocaleDateString()}`,
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

    const actionTableData = minutesData.actionItems.map((item) => [
      item.action || '',
      item.owner || 'Unassigned',
      item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No date',
    ]);

    doc.autoTable({
      head: [['Action', 'Owner', 'Due Date']],
      body: actionTableData,
      startY: y,
      margin: 15,
      theme: 'grid',
      headStyles: {
        fillColor: colors.header,
        textColor: colors.headerText,
        fontSize: 10,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 9,
        textColor: colors.text,
      },
      alternateRowStyles: {
        fillColor: colors.lightBg,
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40 },
        2: { cellWidth: 40 },
      },
    });
  }

  // Key Points Section (if available)
  if (minutesData.keyPoints && minutesData.keyPoints.length > 0) {
    y = doc.lastAutoTable.finalY + 10 || y + 10;

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
