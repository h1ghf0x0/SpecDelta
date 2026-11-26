import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import type { CsiSection, DiffSectionResult } from '../types/spec';

interface ExportRow {
  'CSI Division': string;
  'Section #': string;
  'Section Title': string;
  Status: string;
  'Old Pages': string;
  'New Pages': string;
  'Old Text': string;
  'New Text': string;
  'Risk Keyword Flag': string;
}

function buildRows(results: DiffSectionResult[]): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const sec of results) {
    if (sec.status === 'unchanged' && !sec.renumberedFrom) continue;

    if (sec.status === 'added') {
      rows.push({
        'CSI Division': `${sec.division} - ${sec.divisionTitle}`,
        'Section #': sec.sectionCode,
        'Section Title': sec.title,
        Status: 'Added',
        'Old Pages': '—',
        'New Pages': sec.newPageRange,
        'Old Text': '',
        'New Text': sec.fullNewText.slice(0, 32000),
        'Risk Keyword Flag': sec.riskFlags.join('; ') || 'None',
      });
      continue;
    }

    if (sec.status === 'deleted') {
      rows.push({
        'CSI Division': `${sec.division} - ${sec.divisionTitle}`,
        'Section #': sec.sectionCode,
        'Section Title': sec.title,
        Status: 'Deleted',
        'Old Pages': sec.oldPageRange,
        'New Pages': '—',
        'Old Text': sec.fullOldText.slice(0, 32000),
        'New Text': '',
        'Risk Keyword Flag': sec.riskFlags.join('; ') || 'None',
      });
      continue;
    }

    const sectionLabel = sec.renumberedFrom
      ? `${sec.sectionCode} (was ${sec.renumberedFrom})`
      : sec.sectionCode;
    const statusLabel = sec.renumberedFrom
      ? sec.status === 'unchanged'
        ? 'Renumbered'
        : 'Renumbered & Modified'
      : 'Modified';

    if (sec.changedParagraphs.length === 0) {
      rows.push({
        'CSI Division': `${sec.division} - ${sec.divisionTitle}`,
        'Section #': sectionLabel,
        'Section Title': sec.title,
        Status: statusLabel,
        'Old Pages': sec.oldPageRange,
        'New Pages': sec.newPageRange,
        'Old Text': sec.fullOldText.slice(0, 32000),
        'New Text': sec.fullNewText.slice(0, 32000),
        'Risk Keyword Flag': sec.riskFlags.join('; ') || 'None',
      });
    } else {
      for (const para of sec.changedParagraphs) {
        rows.push({
          'CSI Division': `${sec.division} - ${sec.divisionTitle}`,
          'Section #': sectionLabel,
          'Section Title': sec.title,
          Status: statusLabel,
          'Old Pages': sec.oldPageRange,
          'New Pages': sec.newPageRange,
          'Old Text': para.oldText.slice(0, 32000),
          'New Text': para.newText.slice(0, 32000),
          'Risk Keyword Flag': para.riskFlags.join('; ') || 'None',
        });
      }
    }
  }

  return rows;
}

export function exportChangeLogToExcel(results: DiffSectionResult[], fileBaseName = 'SpecDelta_Change_Log'): void {
  const rows = buildRows(results);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 30 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 52 },
    { wch: 52 },
    { wch: 36 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Spec Change Log');
  XLSX.writeFile(workbook, `${fileBaseName}.xlsx`);
}

export function exportChangeLogToCsv(results: DiffSectionResult[], fileBaseName = 'SpecDelta_Change_Log'): void {
  const rows = buildRows(results);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, `${fileBaseName}.csv`);
}

export async function slicePdfBySections(
  sourceBuffer: ArrayBuffer,
  selectedSections: CsiSection[],
  outputFileName: string
): Promise<{ pageCount: number; bytes: Uint8Array }> {
  const sourceDoc = await PDFDocument.load(sourceBuffer);
  const targetDoc = await PDFDocument.create();
  const totalPages = sourceDoc.getPageCount();

  const pageIndexSet = new Set<number>();
  for (const sec of selectedSections) {
    const startIdx = Math.max(0, sec.startPage - 1);
    const endIdx = Math.min(totalPages - 1, sec.endPage - 1);
    for (let i = startIdx; i <= endIdx; i++) {
      pageIndexSet.add(i);
    }
  }

  const sortedIndices = Array.from(pageIndexSet).sort((a, b) => a - b);
  const copiedPages = await targetDoc.copyPages(sourceDoc, sortedIndices);
  for (const page of copiedPages) {
    targetDoc.addPage(page);
  }

  const outBytes = await targetDoc.save();
  const blob = new Blob([outBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  triggerBlobDownload(blob, outputFileName);
  return { pageCount: sortedIndices.length, bytes: outBytes };
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
