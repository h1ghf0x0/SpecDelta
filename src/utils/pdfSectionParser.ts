import { getDivisionTitle, normalizeCsiCode } from './csiDictionary';
import type { CsiSection } from '../types/spec';
import type { RawPageLine } from './noiseFilter';

export interface SpanItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export interface OutlineSectionHint {
  page: number;
  rawCode: string;
  normalizedCode: string;
  title: string;
}

export function matchCsiHeader(
  line: string
): { rawCode: string; normalizedCode: string; title: string } | null {
  const trimmed = line.trim();
  // Skip Table of Contents dot-leaders or trailing section page stamps
  if (/\.\.{3,}/.test(trimmed) || /\.{2,}\s*\d+\s*$/.test(trimmed)) return null;
  if (/^\d{2}\s+\d{2}\s+\d{2}\s*[-–]\s*\d{1,3}$/.test(trimmed)) return null;

  const explicitMatch = trimmed.match(
    /^SECTION\s+(\d{2}\s+\d{2}\s+\d{2}(?:\.\d{2})?|\d{2}\s+\d{4}(?:\.\d{2})?|\d{5,6}(?:\.\d{2})?)\s*(?:[-–—:]\s*|\s+)?(.*)$/i
  );
  if (explicitMatch) {
    const rawCode = explicitMatch[1].trim();
    const normalizedCode = normalizeCsiCode(rawCode);
    const divNum = parseInt(normalizedCode.slice(0, 2), 10);
    if (!Number.isNaN(divNum) && divNum >= 0 && divNum <= 49) {
      const title = (explicitMatch[2] || '').replace(/^[-–—:\s]+/, '').trim();
      return {
        rawCode: `SECTION ${rawCode}`,
        normalizedCode,
        title: title || 'Untitled Section',
      };
    }
  }

  const implicitMatch = trimmed.match(
    /^(\d{2}\s+\d{2}\s+\d{2}(?:\.\d{2})?|\d{2}\s+\d{4}(?:\.\d{2})?|\d{5}(?:\.\d{2})?)\s*(?:[-–—:]\s*|\s+)([A-Z][A-Za-z0-9\s,&/()-]{2,})$/
  );
  if (implicitMatch) {
    const rawCode = implicitMatch[1].trim();
    const normalizedCode = normalizeCsiCode(rawCode);
    const divNum = parseInt(normalizedCode.slice(0, 2), 10);
    if (!Number.isNaN(divNum) && divNum >= 0 && divNum <= 49) {
      return {
        rawCode,
        normalizedCode,
        title: implicitMatch[2].trim(),
      };
    }
  }

  return null;
}

export function assemblePageLinesFromSpans(
  rawItems: ReadonlyArray<unknown>,
  pageNum: number,
  pageHeight: number
): { lines: RawPageLine[]; pageChars: number } {
  const spans: SpanItem[] = [];
  for (const rawItem of rawItems) {
    if (
      rawItem &&
      typeof rawItem === 'object' &&
      'str' in rawItem &&
      typeof (rawItem as { str: unknown }).str === 'string' &&
      'transform' in rawItem &&
      Array.isArray((rawItem as { transform: unknown }).transform)
    ) {
      const item = rawItem as { str: string; transform: number[]; width?: number };
      if (!item.str.trim()) continue;
      const tx = item.transform;
      const fontSize = Math.max(4, Math.hypot(tx[0], tx[1]) || 10);
      const itemWidth =
        typeof item.width === 'number' && item.width > 0
          ? item.width
          : item.str.length * fontSize * 0.5;
      spans.push({
        str: item.str,
        x: tx[4],
        y: tx[5],
        width: itemWidth,
        fontSize,
      });
    }
  }

  // Group text spans into horizontal lines by Y-coordinate proximity (±3pt)
  spans.sort((a, b) => b.y - a.y || a.x - b.x);
  const lineGroups: Array<{ y: number; items: SpanItem[] }> = [];

  for (const span of spans) {
    const existing = lineGroups.find((g) => Math.abs(g.y - span.y) <= 3.0);
    if (existing) {
      existing.items.push(span);
    } else {
      lineGroups.push({ y: span.y, items: [span] });
    }
  }

  const lines: RawPageLine[] = [];
  let pageChars = 0;

  for (const group of lineGroups) {
    group.items.sort((a, b) => a.x - b.x);
    let lineText = '';
    let prevXEnd: number | null = null;
    let prevFontSize = 10;
    let prevHadTrailingSpace = false;

    for (const item of group.items) {
      const hasLeadingSpace = /^\s/.test(item.str);
      const hasTrailingSpace = /\s$/.test(item.str);
      const trimmed = item.str.trim();
      if (!trimmed) continue;

      if (prevXEnd !== null) {
        const gap = item.x - prevXEnd;
        const spaceThreshold = Math.max(2.0, Math.min(prevFontSize, item.fontSize) * 0.25);
        if (
          (prevHadTrailingSpace || hasLeadingSpace || gap > spaceThreshold) &&
          !lineText.endsWith(' ')
        ) {
          lineText += ' ';
        }
      }

      lineText += trimmed;
      prevXEnd = item.x + item.width;
      prevFontSize = item.fontSize;
      prevHadTrailingSpace = hasTrailingSpace;
    }

    lineText = lineText.replace(/\s+/g, ' ').trim();
    if (!lineText) continue;

    pageChars += lineText.length;
    const yPct = Math.max(0, Math.min(1, 1 - group.y / (pageHeight || 792)));
    lines.push({
      page: pageNum,
      yPct,
      text: lineText,
    });
  }

  return { lines, pageChars };
}

export function buildParagraphsFromLines(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buffer = '';

  const isParagraphStart = (line: string): boolean => {
    return (
      /^PART\s+\d+\b/i.test(line) ||
      /^\d+\.\d+(?:\.\d+)?\s+/.test(line) ||
      /^[A-Z]\.\s+/.test(line) ||
      /^\d+\)\s+/.test(line) ||
      /^[•\-*]\s+/.test(line)
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isParagraphStart(line) && buffer) {
      paragraphs.push(buffer.trim());
      buffer = line;
    } else if (!buffer) {
      buffer = line;
    } else {
      if (buffer.endsWith('-') && /^[a-z]/.test(line)) {
        buffer = buffer.slice(0, -1) + line;
      } else {
        buffer += ' ' + line;
      }
    }
  }

  if (buffer.trim()) {
    paragraphs.push(buffer.trim());
  }

  return paragraphs.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function chunkIntoCsiSections(
  lines: RawPageLine[],
  pageCount: number,
  outlineHintsByPage: Map<number, OutlineSectionHint[]>
): { sections: CsiSection[]; outlineHintsUsed: number } {
  const sections: CsiSection[] = [];
  let outlineHintsUsed = 0;
  const pagesWithInlineHeaders = new Set<number>();

  for (const line of lines) {
    if (matchCsiHeader(line.text)) {
      pagesWithInlineHeaders.add(line.page);
    }
  }

  let current: {
    rawCode: string;
    normalizedCode: string;
    title: string;
    startPage: number;
    endPage: number;
    bodyLines: string[];
  } | null = null;

  const flushCurrent = () => {
    if (!current) return;
    const paragraphs = buildParagraphsFromLines(current.bodyLines);
    const division = current.normalizedCode.slice(0, 2);
    sections.push({
      id: `${current.normalizedCode}__${sections.length}`,
      rawCode: current.rawCode,
      normalizedCode: current.normalizedCode,
      division,
      divisionTitle: getDivisionTitle(division),
      title: current.title,
      startPage: current.startPage,
      endPage: current.endPage,
      text: paragraphs.join('\n\n'),
      paragraphs,
    });
  };

  let lastSeenPage = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fallback: if entering a new page that has an outline CSI bookmark and NO inline CSI header, start that section
    if (line.page !== lastSeenPage) {
      lastSeenPage = line.page;
      if (!pagesWithInlineHeaders.has(line.page)) {
        const pageHints = outlineHintsByPage.get(line.page);
        if (pageHints && pageHints.length > 0) {
          const hint = pageHints[0];
          if (!current || current.normalizedCode !== hint.normalizedCode) {
            flushCurrent();
            outlineHintsUsed++;
            current = {
              rawCode: hint.rawCode,
              normalizedCode: hint.normalizedCode,
              title: hint.title,
              startPage: line.page,
              endPage: line.page,
              bodyLines: [],
            };
          }
        }
      }
    }

    const headerMatch = matchCsiHeader(line.text);

    if (headerMatch) {
      let resolvedTitle = headerMatch.title;
      if (
        (resolvedTitle === 'Untitled Section' || resolvedTitle.length < 3) &&
        i + 1 < lines.length &&
        lines[i + 1].page === line.page
      ) {
        const nextCandidate = lines[i + 1].text.trim();
        if (
          nextCandidate.length > 2 &&
          nextCandidate.length < 85 &&
          !/^PART\s+1\b/i.test(nextCandidate)
        ) {
          resolvedTitle = nextCandidate;
          i++;
        }
      }

      // Enrich missing title from PDF outline bookmark on this page if available
      if (resolvedTitle === 'Untitled Section' || resolvedTitle.length < 3) {
        const hintMatch = outlineHintsByPage
          .get(line.page)
          ?.find((h) => h.normalizedCode === headerMatch.normalizedCode);
        if (hintMatch && hintMatch.title !== 'Untitled Section') {
          resolvedTitle = hintMatch.title;
          outlineHintsUsed++;
        }
      }

      flushCurrent();

      current = {
        rawCode: headerMatch.rawCode,
        normalizedCode: headerMatch.normalizedCode,
        title: resolvedTitle,
        startPage: line.page,
        endPage: line.page,
        bodyLines: [],
      };
    } else if (current) {
      if (line.text.trim().toUpperCase() !== current.title.toUpperCase()) {
        current.bodyLines.push(line.text);
      }
      current.endPage = line.page;
    } else {
      current = {
        rawCode: '00 01 00',
        normalizedCode: '00 01 00',
        title: 'PROJECT MANUAL FRONT MATTER',
        startPage: line.page,
        endPage: line.page,
        bodyLines: [line.text],
      };
    }
  }

  flushCurrent();

  const mergedMap = new Map<string, CsiSection>();
  for (const sec of sections) {
    const existing = mergedMap.get(sec.normalizedCode);
    if (existing) {
      existing.endPage = Math.max(existing.endPage, sec.endPage);
      existing.paragraphs = [...existing.paragraphs, ...sec.paragraphs];
      existing.text = existing.paragraphs.join('\n\n');
    } else {
      mergedMap.set(sec.normalizedCode, sec);
    }
  }

  const finalSections = Array.from(mergedMap.values());
  if (finalSections.length === 0 && pageCount > 0) {
    finalSections.push({
      id: '00 00 00__0',
      rawCode: '00 00 00',
      normalizedCode: '00 00 00',
      division: '00',
      divisionTitle: getDivisionTitle('00'),
      title: 'Uncategorized Specification Document',
      startPage: 1,
      endPage: pageCount,
      text: '',
      paragraphs: [],
    });
  }

  return { sections: finalSections, outlineHintsUsed };
}
