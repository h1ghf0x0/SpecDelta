import { PDFDocument } from 'pdf-lib';
import { buildCsvString, buildXlsxBytes } from './ooxmlBuilder';
import type { CsiSection, DiffSectionResult } from '../types/spec';

const EXPORT_HEADERS = [
  'CSI Division',
  'Section #',
  'Section Title',
  'Status',
  'Reviewed',
  'Old Pages',
  'New Pages',
  'Old Text',
  'New Text',
  'Risk Keyword Flag',
];

const EXPORT_COL_WIDTHS = [28, 16, 30, 16, 11, 12, 12, 52, 52, 36];

function safeCellText(text: string): string {
  const limit = 31950;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}... [truncated to 32k Excel cell limit]`;
}

function buildRows(
  results: DiffSectionResult[],
  reviewedCodes?: Set<string>
): string[][] {
  const rows: string[][] = [];

  for (const sec of results) {
    if (sec.status === 'unchanged' && !sec.renumberedFrom) continue;
    const reviewedLabel = reviewedCodes?.has(sec.sectionCode) ? 'Reviewed' : 'Pending';
    const divLabel = `${sec.division} - ${sec.divisionTitle}`;

    if (sec.status === 'added') {
      rows.push([
        divLabel,
        sec.sectionCode,
        sec.title,
        'Added',
        reviewedLabel,
        '—',
        sec.newPageRange,
        '',
        safeCellText(sec.fullNewText),
        sec.riskFlags.join('; ') || 'None',
      ]);
      continue;
    }

    if (sec.status === 'deleted') {
      rows.push([
        divLabel,
        sec.sectionCode,
        sec.title,
        'Deleted',
        reviewedLabel,
        sec.oldPageRange,
        '—',
        safeCellText(sec.fullOldText),
        '',
        sec.riskFlags.join('; ') || 'None',
      ]);
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
      rows.push([
        divLabel,
        sectionLabel,
        sec.title,
        statusLabel,
        reviewedLabel,
        sec.oldPageRange,
        sec.newPageRange,
        safeCellText(sec.fullOldText),
        safeCellText(sec.fullNewText),
        sec.riskFlags.join('; ') || 'None',
      ]);
    } else {
      for (const para of sec.changedParagraphs) {
        rows.push([
          divLabel,
          sectionLabel,
          sec.title,
          statusLabel,
          reviewedLabel,
          sec.oldPageRange,
          sec.newPageRange,
          safeCellText(para.oldText),
          safeCellText(para.newText),
          para.riskFlags.join('; ') || 'None',
        ]);
      }
    }
  }

  return rows;
}

export function exportChangeLogToExcel(
  results: DiffSectionResult[],
  fileBaseName = 'SpecDelta_Change_Log',
  reviewedCodes?: Set<string>
): void {
  const rows = buildRows(results, reviewedCodes);
  const bytes = buildXlsxBytes(EXPORT_HEADERS, rows, EXPORT_COL_WIDTHS, 'Spec Change Log');
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `${fileBaseName}.xlsx`);
}

export function exportChangeLogToCsv(
  results: DiffSectionResult[],
  fileBaseName = 'SpecDelta_Change_Log',
  reviewedCodes?: Set<string>
): void {
  const rows = buildRows(results, reviewedCodes);
  const csv = buildCsvString(EXPORT_HEADERS, rows);
  // Prepend UTF-8 BOM so Microsoft Excel preserves em-dashes and smart quotes
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
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
