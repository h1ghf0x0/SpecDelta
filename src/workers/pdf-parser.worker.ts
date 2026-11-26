import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import { getDivisionTitle, normalizeCsiCode } from '../utils/csiDictionary';
import {
  DEFAULT_NOISE_CONFIG,
  type CsiSection,
  type NoiseFilterConfig,
  type SingleSpecParseOutput,
  type StrippedPattern,
  type WorkerProgress,
} from '../types/spec';

// Bind pdfjs worker handler locally inside this Web Worker so zero external worker requests occur
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;

interface RawPageLine {
  page: number;
  yPct: number;
  text: string;
}

interface OutlineSectionHint {
  page: number;
  rawCode: string;
  normalizedCode: string;
  title: string;
}

interface ParsePdfRequest {
  type: 'parse-pdf';
  requestId: string;
  buffer: ArrayBuffer;
  fileName: string;
  noiseConfig?: NoiseFilterConfig;
}

function postProgress(
  requestId: string,
  stage: WorkerProgress['stage'],
  percent: number,
  detail: string
) {
  self.postMessage({
    type: 'progress',
    requestId,
    payload: { stage, percent, detail } satisfies WorkerProgress,
  });
}

function normalizeForNoisePattern(line: string): string {
  return line
    .trim()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isStandalonePageNumber(line: string): boolean {
  const t = line.trim();
  return (
    /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(t) ||
    /^\d{2}\s*\d{2}\s*\d{2}\s*[-–—]\s*\d{1,4}$/.test(t)
  );
}

function matchCsiHeader(
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

async function extractOutlineHints(
  pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>
): Promise<Map<number, OutlineSectionHint[]>> {
  const hintMap = new Map<number, OutlineSectionHint[]>();
  try {
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) return hintMap;

    const walk = async (items: typeof outline) => {
      for (const item of items) {
        if (item.title) {
          const parsedHeader = matchCsiHeader(item.title);
          if (parsedHeader) {
            try {
              let destArray: unknown = item.dest;
              if (typeof destArray === 'string') {
                destArray = await pdf.getDestination(destArray);
              }
              if (Array.isArray(destArray) && destArray.length > 0 && destArray[0]) {
                const pageIndex = await pdf.getPageIndex(
                  destArray[0] as Parameters<typeof pdf.getPageIndex>[0]
                );
                const page = pageIndex + 1;
                const list = hintMap.get(page) ?? [];
                list.push({
                  page,
                  rawCode: parsedHeader.rawCode,
                  normalizedCode: parsedHeader.normalizedCode,
                  title: parsedHeader.title,
                });
                hintMap.set(page, list);
              }
            } catch {
              // Ignore malformed bookmark destinations gracefully
            }
          }
        }
        if (item.items && item.items.length > 0) {
          await walk(item.items);
        }
      }
    };

    await walk(outline);
  } catch {
    // Outline metadata is optional; ignore if absent
  }
  return hintMap;
}

async function extractLinesWithCoordinates(
  buffer: ArrayBuffer,
  fileName: string,
  requestId: string
): Promise<{
  pageCount: number;
  lines: RawPageLine[];
  totalChars: number;
  scannedPages: number[];
  outlineHintsByPage: Map<number, OutlineSectionHint[]>;
}> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  try {
    const pageCount = pdf.numPages;
    const allLines: RawPageLine[] = [];
    const scannedPages: number[] = [];
    let totalChars = 0;

    // Extract PDF outline/bookmark TOC hints for section fallback & title enrichment
    const outlineHintsByPage = await extractOutlineHints(pdf);

    // Throttle progress messages cleanly on massive 600-800 page specs
    const progressStep = pageCount > 100 ? 10 : pageCount > 30 ? 4 : 1;

    for (let p = 1; p <= pageCount; p++) {
      if (p === 1 || p % progressStep === 0 || p === pageCount) {
        const pct = Math.round(6 + (p / Math.max(1, pageCount)) * 68);
        postProgress(
          requestId,
          'extracting',
          pct,
          `Extracting coordinates (${fileName}: page ${p} of ${pageCount})`
        );
      }

      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageHeight = viewport.height || 792;
      const textContent = await page.getTextContent();

      interface SpanItem {
        str: string;
        x: number;
        y: number;
      }

      const spans: SpanItem[] = [];
      for (const rawItem of textContent.items) {
        if ('str' in rawItem && typeof rawItem.str === 'string') {
          const str = rawItem.str;
          if (!str.trim()) continue;
          const tx = rawItem.transform;
          spans.push({
            str,
            x: tx[4],
            y: tx[5],
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

      let pageChars = 0;
      for (const group of lineGroups) {
        group.items.sort((a, b) => a.x - b.x);
        let lineText = '';
        let prevXEnd: number | null = null;
        for (const item of group.items) {
          const trimmed = item.str.trim();
          if (!trimmed) continue;
          if (prevXEnd !== null && item.x - prevXEnd > 14 && !lineText.endsWith(' ')) {
            lineText += ' ';
          } else if (lineText && !lineText.endsWith(' ') && !trimmed.startsWith(' ')) {
            lineText += ' ';
          }
          lineText += trimmed;
          prevXEnd = item.x + trimmed.length * 4.5;
        }

        lineText = lineText.replace(/\s+/g, ' ').trim();
        if (!lineText) continue;

        totalChars += lineText.length;
        pageChars += lineText.length;
        const yPct = Math.max(0, Math.min(1, 1 - group.y / pageHeight));
        allLines.push({
          page: p,
          yPct,
          text: lineText,
        });
      }

      if (pageChars < 30) {
        scannedPages.push(p);
      }

      page.cleanup();
    }

    return { pageCount, lines: allLines, totalChars, scannedPages, outlineHintsByPage };
  } finally {
    await loadingTask.destroy();
  }
}

function stripHeadersAndFooters(
  lines: RawPageLine[],
  pageCount: number,
  noiseConfig: NoiseFilterConfig
): { cleanLines: RawPageLine[]; strippedPatterns: StrippedPattern[] } {
  const topThreshold = noiseConfig.edgeMarginPct;
  const bottomThreshold = 1 - noiseConfig.edgeMarginPct;
  const minRecurrence = noiseConfig.minRecurrencePct;

  const patternMap = new Map<
    string,
    { pages: Set<number>; sample: string; zone: 'header' | 'footer' }
  >();

  for (const line of lines) {
    const zone =
      line.yPct <= topThreshold ? 'header' : line.yPct >= bottomThreshold ? 'footer' : null;
    if (!zone) continue;

    const norm = normalizeForNoisePattern(line.text);
    if (!norm) continue;

    const entry = patternMap.get(norm);
    if (entry) {
      entry.pages.add(line.page);
    } else {
      patternMap.set(norm, {
        pages: new Set([line.page]),
        sample: line.text,
        zone,
      });
    }
  }

  const noiseSet = new Set<string>();
  const strippedPatterns: StrippedPattern[] = [];

  for (const [pattern, info] of patternMap.entries()) {
    const freqPct = Math.round((info.pages.size / Math.max(1, pageCount)) * 100);
    const thresholdMet = pageCount >= 3 ? info.pages.size / pageCount > minRecurrence : false;
    if (thresholdMet || isStandalonePageNumber(info.sample)) {
      noiseSet.add(pattern);
      strippedPatterns.push({
        pattern,
        sample: info.sample,
        frequencyPct: freqPct,
        pageHits: info.pages.size,
        totalPages: pageCount,
        zone: info.zone,
      });
    }
  }

  const cleanLines = lines.filter((line) => {
    const inEdgeZone = line.yPct <= topThreshold || line.yPct >= bottomThreshold;
    if (inEdgeZone) {
      const norm = normalizeForNoisePattern(line.text);
      if (noiseSet.has(norm) || isStandalonePageNumber(line.text)) {
        return false;
      }
    }
    return true;
  });

  strippedPatterns.sort((a, b) => b.frequencyPct - a.frequencyPct);
  return { cleanLines, strippedPatterns };
}

function buildParagraphsFromLines(lines: string[]): string[] {
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

function chunkIntoCsiSections(
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

self.onmessage = async (event: MessageEvent<ParsePdfRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'parse-pdf') return;

  const startTime = performance.now();
  const { requestId, buffer, fileName } = msg;
  const noiseConfig: NoiseFilterConfig = {
    edgeMarginPct: msg.noiseConfig?.edgeMarginPct ?? DEFAULT_NOISE_CONFIG.edgeMarginPct,
    minRecurrencePct: msg.noiseConfig?.minRecurrencePct ?? DEFAULT_NOISE_CONFIG.minRecurrencePct,
  };

  try {
    postProgress(requestId, 'loading', 3, `Opening ${fileName}...`);

    const { pageCount, lines, totalChars, scannedPages, outlineHintsByPage } =
      await extractLinesWithCoordinates(buffer, fileName, requestId);

    postProgress(
      requestId,
      'stripping',
      82,
      `Stripping top/bottom ${Math.round(noiseConfig.edgeMarginPct * 100)}% noise (>${Math.round(noiseConfig.minRecurrencePct * 100)}% recurrence)...`
    );
    const { cleanLines, strippedPatterns } = stripHeadersAndFooters(
      lines,
      pageCount,
      noiseConfig
    );

    postProgress(requestId, 'chunking', 92, 'Normalizing & chunking CSI MasterFormat sections...');
    const { sections, outlineHintsUsed } = chunkIntoCsiSections(
      cleanLines,
      pageCount,
      outlineHintsByPage
    );
    const isMostlyScanned =
      pageCount > 0 &&
      (totalChars / pageCount < 40 || scannedPages.length / pageCount >= 0.5);
    const scannedWarning = isMostlyScanned || scannedPages.length > 0;

    postProgress(requestId, 'complete', 100, 'Parsed cleanly.');

    const result: SingleSpecParseOutput = {
      fileName,
      pageCount,
      sections,
      strippedPatterns,
      parseTimeMs: Math.round(performance.now() - startTime),
      scannedWarning,
      scannedPages,
      isMostlyScanned,
      outlineHintsUsed,
      appliedNoiseConfig: noiseConfig,
    };

    self.postMessage({
      type: 'complete',
      requestId,
      payload: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PDF parser worker failed.';
    self.postMessage({
      type: 'error',
      requestId,
      payload: message,
    });
  }
};
