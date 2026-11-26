import DiffMatchPatch from 'diff-match-patch';
import {
  detectRiskFlags,
  findRiskMatchInToken,
  getDivisionTitle,
} from './csiDictionary';
import type {
  ChangedParagraph,
  CsiSection,
  DiffRunOutput,
  DiffSectionResult,
  SingleSpecParseOutput,
  WordDiffToken,
} from '../types/spec';

function computeWordDiff(oldText: string, newText: string): {
  tokens: WordDiffToken[];
  addedWords: number;
  deletedWords: number;
} {
  const dmp = new DiffMatchPatch();
  const wordArray: string[] = [];
  const wordToChar = new Map<string, string>();
  let nextCharCode = 0x100;

  const tokenizeToChars = (text: string): string => {
    const parts = text.match(/(\S+|\s+)/g) ?? [];
    let encoded = '';
    for (const part of parts) {
      let ch = wordToChar.get(part);
      if (!ch) {
        ch = String.fromCharCode(nextCharCode++);
        wordToChar.set(part, ch);
        wordArray.push(part);
      }
      encoded += ch;
    }
    return encoded;
  };

  const chars1 = tokenizeToChars(oldText);
  const chars2 = tokenizeToChars(newText);
  const rawDiffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_cleanupSemantic(rawDiffs);

  const tokens: WordDiffToken[] = [];
  let addedWords = 0;
  let deletedWords = 0;

  for (const [op, encoded] of rawDiffs) {
    let chunkText = '';
    for (let i = 0; i < encoded.length; i++) {
      const idx = encoded.charCodeAt(i) - 0x100;
      chunkText += wordArray[idx] ?? '';
    }
    if (!chunkText) continue;

    const wordCount = (chunkText.match(/\S+/g) ?? []).length;
    if (op === 1) addedWords += wordCount;
    if (op === -1) deletedWords += wordCount;

    tokens.push({
      op: op as -1 | 0 | 1,
      text: chunkText,
      riskMatch: op !== 0 ? findRiskMatchInToken(chunkText) : undefined,
    });
  }

  return { tokens, addedWords, deletedWords };
}

function diffSectionParagraphs(oldParas: string[], newParas: string[]): {
  changedParagraphs: ChangedParagraph[];
  addedWords: number;
  deletedWords: number;
} {
  const dmp = new DiffMatchPatch();
  const lineArray: string[] = [];
  const lineToChar = new Map<string, string>();
  let codePoint = 0x100;

  const encodeParagraphs = (paras: string[]): string => {
    let encoded = '';
    for (const p of paras) {
      const norm = p.replace(/\s+/g, ' ').trim();
      let ch = lineToChar.get(norm);
      if (!ch) {
        ch = String.fromCharCode(codePoint++);
        lineToChar.set(norm, ch);
        lineArray.push(norm);
      }
      encoded += ch;
    }
    return encoded;
  };

  const c1 = encodeParagraphs(oldParas);
  const c2 = encodeParagraphs(newParas);
  const paraDiffs = dmp.diff_main(c1, c2, false);

  const changedParagraphs: ChangedParagraph[] = [];
  let totalAdded = 0;
  let totalDeleted = 0;

  let newCursor = 0;
  for (let i = 0; i < paraDiffs.length; i++) {
    const [op, data] = paraDiffs[i];
    const items: string[] = [];
    for (let k = 0; k < data.length; k++) {
      items.push(lineArray[data.charCodeAt(k) - 0x100] ?? '');
    }

    if (op === 0) {
      newCursor += items.length;
      continue;
    }

    if (op === -1 && i + 1 < paraDiffs.length && paraDiffs[i + 1][0] === 1) {
      const nextData = paraDiffs[i + 1][1];
      const nextItems: string[] = [];
      for (let k = 0; k < nextData.length; k++) {
        nextItems.push(lineArray[nextData.charCodeAt(k) - 0x100] ?? '');
      }

      const maxLen = Math.max(items.length, nextItems.length);
      for (let m = 0; m < maxLen; m++) {
        const oldT = items[m] ?? '';
        const newT = nextItems[m] ?? '';
        const { tokens, addedWords, deletedWords } = computeWordDiff(oldT, newT);
        totalAdded += addedWords;
        totalDeleted += deletedWords;
        const riskFlags = Array.from(
          new Set([...detectRiskFlags(oldT), ...detectRiskFlags(newT)])
        );
        changedParagraphs.push({
          paragraphIndex: newCursor + m,
          oldText: oldT,
          newText: newT,
          contextBefore: newParas[Math.max(0, newCursor + m - 1)] ?? '',
          contextAfter: newParas[newCursor + m + 1] ?? '',
          tokens,
          riskFlags,
        });
      }

      newCursor += nextItems.length;
      i++;
      continue;
    }

    if (op === -1) {
      for (let m = 0; m < items.length; m++) {
        const oldT = items[m];
        const { tokens, deletedWords } = computeWordDiff(oldT, '');
        totalDeleted += deletedWords;
        changedParagraphs.push({
          paragraphIndex: newCursor,
          oldText: oldT,
          newText: '',
          contextBefore: newParas[Math.max(0, newCursor - 1)] ?? '',
          contextAfter: newParas[newCursor] ?? '',
          tokens,
          riskFlags: detectRiskFlags(oldT),
        });
      }
    } else if (op === 1) {
      for (let m = 0; m < items.length; m++) {
        const newT = items[m];
        const { tokens, addedWords } = computeWordDiff('', newT);
        totalAdded += addedWords;
        changedParagraphs.push({
          paragraphIndex: newCursor + m,
          oldText: '',
          newText: newT,
          contextBefore: newParas[Math.max(0, newCursor + m - 1)] ?? '',
          contextAfter: newParas[newCursor + m + 1] ?? '',
          tokens,
          riskFlags: detectRiskFlags(newT),
        });
      }
      newCursor += items.length;
    }
  }

  return { changedParagraphs, addedWords: totalAdded, deletedWords: totalDeleted };
}

function normalizeTitleForMatch(title: string): string {
  return title
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areTitlesEquivalent(
  oldSec: CsiSection,
  newSec: CsiSection
): boolean {
  const normA = normalizeTitleForMatch(oldSec.title);
  const normB = normalizeTitleForMatch(newSec.title);
  if (
    !normA ||
    !normB ||
    normA.length < 5 ||
    normA === 'UNTITLED SECTION' ||
    normA === 'PROJECT MANUAL FRONT MATTER' ||
    normA === 'UNCATEGORIZED SPECIFICATION DOCUMENT'
  ) {
    return false;
  }
  if (normA === normB) return true;

  // Allow slight subtitle edits within the same CSI Division via Jaccard word overlap >= 0.8
  if (oldSec.division === newSec.division) {
    const wordsA = new Set(normA.split(' ').filter((w) => w.length > 1));
    const wordsB = new Set(normB.split(' ').filter((w) => w.length > 1));
    if (wordsA.size >= 2 && wordsB.size >= 2) {
      let overlap = 0;
      for (const w of wordsA) {
        if (wordsB.has(w)) overlap++;
      }
      const union = wordsA.size + wordsB.size - overlap;
      if (union > 0 && overlap / union >= 0.8) return true;
    }
  }
  return false;
}

function buildPairedSectionResult(
  oldSec: CsiSection,
  newSec: CsiSection,
  renumberedFrom?: string
): DiffSectionResult {
  const division = newSec.division;
  const divisionTitle = getDivisionTitle(division);
  const spacingNormalized =
    !renumberedFrom &&
    oldSec.rawCode.replace(/^SECTION\s+/i, '').trim() !==
      newSec.rawCode.replace(/^SECTION\s+/i, '').trim();

  const { changedParagraphs, addedWords, deletedWords } = diffSectionParagraphs(
    oldSec.paragraphs,
    newSec.paragraphs
  );

  const status = changedParagraphs.length === 0 ? 'unchanged' : 'modified';
  const riskFlags = Array.from(new Set(changedParagraphs.flatMap((p) => p.riskFlags)));

  return {
    sectionCode: newSec.normalizedCode,
    oldRawCode: oldSec.rawCode,
    newRawCode: newSec.rawCode,
    division,
    divisionTitle,
    title: newSec.title !== 'Untitled Section' ? newSec.title : oldSec.title,
    status,
    oldPageRange:
      oldSec.startPage === oldSec.endPage
        ? `${oldSec.startPage}`
        : `${oldSec.startPage}–${oldSec.endPage}`,
    newPageRange:
      newSec.startPage === newSec.endPage
        ? `${newSec.startPage}`
        : `${newSec.startPage}–${newSec.endPage}`,
    changedParagraphs,
    fullOldText: oldSec.text,
    fullNewText: newSec.text,
    riskFlags,
    addedWords,
    deletedWords,
    spacingNormalized,
    renumberedFrom,
  };
}

export function compareParsedBooks(
  oldBook: SingleSpecParseOutput,
  newBook: SingleSpecParseOutput
): DiffRunOutput {
  const diffStart = performance.now();

  const oldMap = new Map<string, CsiSection>();
  for (const sec of oldBook.sections) oldMap.set(sec.normalizedCode, sec);

  const newMap = new Map<string, CsiSection>();
  for (const sec of newBook.sections) newMap.set(sec.normalizedCode, sec);

  const results: DiffSectionResult[] = [];
  const unmatchedOld: CsiSection[] = [];
  const unmatchedNew: CsiSection[] = [];

  // Pass 1: Exact normalized CSI code matches
  for (const [code, oldSec] of oldMap.entries()) {
    const newSec = newMap.get(code);
    if (newSec) {
      results.push(buildPairedSectionResult(oldSec, newSec));
    } else {
      unmatchedOld.push(oldSec);
    }
  }
  for (const [code, newSec] of newMap.entries()) {
    if (!oldMap.has(code)) {
      unmatchedNew.push(newSec);
    }
  }

  // Pass 2: Match renumbered or relocated sections by normalized title & division similarity
  const matchedOldCodes = new Set<string>();
  const matchedNewCodes = new Set<string>();
  let renumberedCount = 0;

  for (const oldSec of unmatchedOld) {
    const candidate = unmatchedNew.find(
      (n) => !matchedNewCodes.has(n.normalizedCode) && areTitlesEquivalent(oldSec, n)
    );
    if (candidate) {
      matchedOldCodes.add(oldSec.normalizedCode);
      matchedNewCodes.add(candidate.normalizedCode);
      renumberedCount++;
      results.push(buildPairedSectionResult(oldSec, candidate, oldSec.normalizedCode));
    }
  }

  // Pass 3: Remaining truly added or deleted sections
  for (const newSec of unmatchedNew) {
    if (matchedNewCodes.has(newSec.normalizedCode)) continue;
    const division = newSec.division;
    const divisionTitle = getDivisionTitle(division);
    const addedWords = (newSec.text.match(/\S+/g) ?? []).length;
    const riskFlags = detectRiskFlags(newSec.text);
    results.push({
      sectionCode: newSec.normalizedCode,
      oldRawCode: null,
      newRawCode: newSec.rawCode,
      division,
      divisionTitle,
      title: newSec.title,
      status: 'added',
      oldPageRange: '—',
      newPageRange: `${newSec.startPage}–${newSec.endPage}`,
      changedParagraphs: newSec.paragraphs.map((p, idx) => ({
        paragraphIndex: idx,
        oldText: '',
        newText: p,
        contextBefore: '',
        contextAfter: '',
        tokens: [{ op: 1, text: p, riskMatch: findRiskMatchInToken(p) }],
        riskFlags: detectRiskFlags(p),
      })),
      fullOldText: '',
      fullNewText: newSec.text,
      riskFlags,
      addedWords,
      deletedWords: 0,
      spacingNormalized: false,
    });
  }

  for (const oldSec of unmatchedOld) {
    if (matchedOldCodes.has(oldSec.normalizedCode)) continue;
    const division = oldSec.division;
    const divisionTitle = getDivisionTitle(division);
    const deletedWords = (oldSec.text.match(/\S+/g) ?? []).length;
    const riskFlags = detectRiskFlags(oldSec.text);
    results.push({
      sectionCode: oldSec.normalizedCode,
      oldRawCode: oldSec.rawCode,
      newRawCode: null,
      division,
      divisionTitle,
      title: oldSec.title,
      status: 'deleted',
      oldPageRange: `${oldSec.startPage}–${oldSec.endPage}`,
      newPageRange: '—',
      changedParagraphs: oldSec.paragraphs.map((p, idx) => ({
        paragraphIndex: idx,
        oldText: p,
        newText: '',
        contextBefore: '',
        contextAfter: '',
        tokens: [{ op: -1, text: p, riskMatch: findRiskMatchInToken(p) }],
        riskFlags: detectRiskFlags(p),
      })),
      fullOldText: oldSec.text,
      fullNewText: '',
      riskFlags,
      addedWords: 0,
      deletedWords,
      spacingNormalized: false,
    });
  }

  results.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

  const diffElapsedMs = Math.round(performance.now() - diffStart);
  const totalParseMs = Math.max(oldBook.parseTimeMs, newBook.parseTimeMs) + diffElapsedMs;

  return {
    results,
    diagnostics: {
      oldFileName: oldBook.fileName,
      newFileName: newBook.fileName,
      oldPageCount: oldBook.pageCount,
      newPageCount: newBook.pageCount,
      oldSectionCount: oldBook.sections.length,
      newSectionCount: newBook.sections.length,
      oldStrippedPatterns: oldBook.strippedPatterns,
      newStrippedPatterns: newBook.strippedPatterns,
      parseTimeMs: totalParseMs,
      scannedWarning: oldBook.scannedWarning || newBook.scannedWarning,
      outlineHintsUsed: (oldBook.outlineHintsUsed ?? 0) + (newBook.outlineHintsUsed ?? 0),
      appliedNoiseConfig: newBook.appliedNoiseConfig ?? oldBook.appliedNoiseConfig,
      renumberedCount,
    },
  };
}
