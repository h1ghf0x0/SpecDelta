import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  detectDeltaRiskFlags,
  detectRiskFlags,
  extractParagraphDeltaChips,
  normalizeCsiCode,
} from '../src/utils/csiDictionary';
import { isSectionPageStamp, stripHeadersAndFooters } from '../src/utils/noiseFilter';
import { buildCsvString, buildXlsxBytes } from '../src/utils/ooxmlBuilder';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
} from '../src/utils/pdfSectionParser';
import { generateSampleProjectManuals } from '../src/utils/sampleSpecGenerator';
import {
  compareParsedBooks,
  computeSpecContentHash,
  computeWordDiff,
} from '../src/utils/specDiffEngine';
import { DEFAULT_NOISE_CONFIG, type SingleSpecParseOutput } from '../src/types/spec';

test('normalizeCsiCode aligns 6-digit, compact, legacy 5-digit, and subsection formats', () => {
  assert.equal(normalizeCsiCode('SECTION 08 71 00'), '08 71 00');
  assert.equal(normalizeCsiCode('08 7100'), '08 71 00');
  assert.equal(normalizeCsiCode('087100'), '08 71 00');
  assert.equal(normalizeCsiCode('08710'), '08 71 00');
  assert.equal(normalizeCsiCode('13 31 00.13'), '13 31 00.13');
});

test('computeWordDiff assigns context-window riskMatch for split numeric tolerances', () => {
  const { tokens, addedWords, deletedWords } = computeWordDiff(
    'Concrete compressive strength shall be minimum 3,000 psi at 28 days.',
    'Concrete compressive strength shall be minimum 4,000 psi at 28 days.'
  );
  assert.equal(addedWords, 1);
  assert.equal(deletedWords, 1);

  const deletedNum = tokens.find((t) => t.op === -1 && t.text.includes('3,000'));
  const addedNum = tokens.find((t) => t.op === 1 && t.text.includes('4,000'));
  assert.equal(deletedNum?.riskMatch, 'Tolerance / Unit');
  assert.equal(addedNum?.riskMatch, 'Tolerance / Unit');
});

test('risk dictionary & delta chips catch threshold and modal directive shifts without false positives', () => {
  const oldPara = 'Contractor shall provide not less than 15 mil vapor retarder by Owner.';
  const newPara = 'Contractor may provide not exceeding 20 mil vapor retarder furnish and install.';
  const { tokens } = computeWordDiff(oldPara, newPara);
  const deltaFlags = detectDeltaRiskFlags(tokens, oldPara, newPara);
  assert.ok(deltaFlags.some((f) => f.includes('Threshold / Limit')));
  assert.ok(deltaFlags.some((f) => f === 'Directive: shall → may'));

  const chips = extractParagraphDeltaChips(oldPara, newPara);
  assert.ok(chips.some((c) => c === 'Gauge / Mil: 15 mil → 20 mil'));
  assert.ok(chips.some((c) => c === 'Directive: shall → may'));
  assert.ok(chips.some((c) => c === 'Threshold: not less than → not exceeding'));

  // Regression 1: Typo fix inside a "shall" + "minimum" boilerplate paragraph must NOT trigger risk flags
  const typoOld = 'Contractor shall submit shop drawigns within minimum 14 days.';
  const typoNew = 'Contractor shall submit shop drawings within minimum 14 days.';
  const typoDiff = computeWordDiff(typoOld, typoNew);
  assert.deepEqual(detectDeltaRiskFlags(typoDiff.tokens, typoOld, typoNew), []);
  assert.deepEqual(extractParagraphDeltaChips(typoOld, typoNew), []);

  // Regression 2: Capitalized month "May" in calendar dates must NOT match modal directive "may"
  const dateOld = 'Bid date extended to May 14, 2026.';
  const dateNew = 'Bid date extended to May 21, 2026.';
  const dateDiff = computeWordDiff(dateOld, dateNew);
  assert.deepEqual(detectDeltaRiskFlags(dateDiff.tokens, dateOld, dateNew), []);
  assert.equal(detectRiskFlags(dateNew).length, 0);
});

test('stripHeadersAndFooters removes stamps cleanly while preserving bottom-margin spec prose', () => {
  assert.equal(isSectionPageStamp('CAST-IN-PLACE CONCRETE 033000 - 5'), true);
  assert.equal(isSectionPageStamp('08 71 00 - DOOR HARDWARE - Page 4 of 12'), true);
  assert.equal(isSectionPageStamp('SECTION 03 30 00 - CAST-IN-PLACE CONCRETE'), false);
  assert.equal(isSectionPageStamp('1.02 SUBMITTALS'), false);
  assert.equal(isSectionPageStamp('Warranty period shall be 5 years. See page 12.'), false);

  const lines = [
    { page: 1, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 1, yPct: 0.25, text: 'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE' },
    { page: 1, yPct: 0.94, text: 'CAST-IN-PLACE CONCRETE 033000 - 5' },
    { page: 2, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 2, yPct: 0.30, text: '1.02 SUBMITTALS' },
    { page: 2, yPct: 0.92, text: 'Warranty period shall be 5 years. See page 12.' },
    { page: 2, yPct: 0.96, text: 'CAST-IN-PLACE CONCRETE 033000 - 6' },
    { page: 3, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 3, yPct: 0.40, text: 'Provide 4,000 psi concrete.' },
    { page: 3, yPct: 0.94, text: '08 71 00 - DOOR HARDWARE - Page 4 of 12' },
    { page: 4, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 4, yPct: 0.94, text: 'SECTION 26 24 13 - PAGE 2' },
  ];

  const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
    lines,
    4,
    DEFAULT_NOISE_CONFIG
  );
  assert.equal(strippedLineCount, 8);
  assert.deepEqual(
    cleanLines.map((l) => l.text),
    [
      'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE',
      '1.02 SUBMITTALS',
      'Warranty period shall be 5 years. See page 12.',
      'Provide 4,000 psi concrete.',
    ]
  );
  assert.ok(strippedPatterns.some((p) => p.sample.includes('033000 - 5')));
});

test('compareParsedBooks aligns shifted sections, differentiates content hashes, and blocks scanned books', () => {
  const oldBook: SingleSpecParseOutput = {
    fileName: 'Base.pdf',
    pageCount: 10,
    parseTimeMs: 40,
    scannedWarning: false,
    strippedPatterns: [],
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 03 30 00',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 4,
        text: 'Minimum concrete strength shall be 3,000 psi.',
        paragraphs: ['Minimum concrete strength shall be 3,000 psi.'],
      },
      {
        id: '23 05 93__1',
        rawCode: 'SECTION 23 05 93',
        normalizedCode: '23 05 93',
        division: '23',
        divisionTitle: 'Heating, Ventilating, and Air Conditioning (HVAC)',
        title: 'TESTING, ADJUSTING, AND BALANCING FOR HVAC',
        startPage: 5,
        endPage: 8,
        text: 'Balance air diffusers within plus or minus 10%.',
        paragraphs: ['Balance air diffusers within plus or minus 10%.'],
      },
      {
        id: '08 71 00__2',
        rawCode: 'SECTION 08 71 00',
        normalizedCode: '08 71 00',
        division: '08',
        divisionTitle: 'Openings',
        title: 'DOOR HARDWARE',
        startPage: 9,
        endPage: 10,
        text: 'Furnish and install electrified locksets.',
        paragraphs: ['Furnish and install electrified locksets.'],
      },
    ],
  };

  const newBook: SingleSpecParseOutput = {
    fileName: 'Addendum1.pdf',
    pageCount: 12,
    parseTimeMs: 45,
    scannedWarning: false,
    strippedPatterns: [],
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 033000',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 6,
        text: 'Minimum concrete strength shall be 4,000 psi.',
        paragraphs: ['Minimum concrete strength shall be 4,000 psi.'],
      },
      {
        id: '23 05 93__1',
        rawCode: 'SECTION 23 05 93',
        normalizedCode: '23 05 93',
        division: '23',
        divisionTitle: 'Heating, Ventilating, and Air Conditioning (HVAC)',
        title: 'TESTING, ADJUSTING, AND BALANCING FOR HVAC',
        startPage: 7,
        endPage: 10,
        text: 'Balance air diffusers within plus or minus 10%.',
        paragraphs: ['Balance air diffusers within plus or minus 10%.'],
      },
      {
        id: '08 71 13__2',
        rawCode: 'SECTION 08 71 13',
        normalizedCode: '08 71 13',
        division: '08',
        divisionTitle: 'Openings',
        title: 'DOOR HARDWARE',
        startPage: 11,
        endPage: 12,
        text: 'Furnish and install electrified locksets.',
        paragraphs: ['Furnish and install electrified locksets.'],
      },
    ],
  };

  assert.notEqual(
    computeSpecContentHash(oldBook.sections),
    computeSpecContentHash(newBook.sections)
  );

  const diff = compareParsedBooks(oldBook, newBook);
  const concrete = diff.results.find((r) => r.sectionCode === '03 30 00');
  const hvac = diff.results.find((r) => r.sectionCode === '23 05 93');
  const renumbered = diff.results.find((r) => r.sectionCode === '08 71 13');

  assert.equal(concrete?.status, 'modified');
  assert.equal(hvac?.status, 'unchanged');
  assert.equal(renumbered?.renumberedFrom, '08 71 00');
  assert.equal(diff.diagnostics.renumberedCount, 1);
  assert.equal(diff.diagnostics.oldContentHash, computeSpecContentHash(oldBook.sections));

  const scannedNew: SingleSpecParseOutput = {
    ...newBook,
    isMostlyScanned: true,
    scannedPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
  const blocked = compareParsedBooks(oldBook, scannedNew);
  assert.equal(blocked.results.length, 0);
  assert.equal(blocked.diagnostics.newMostlyScanned, true);
});

test('pure-TS OOXML builder produces a valid ZIP/XLSX package and RFC-4180 CSV', () => {
  const xlsx = buildXlsxBytes(
    ['CSI Code', 'Section Title', 'Notes'],
    [['03 30 00', 'Concrete & "Vapor" <Retarder>', '4000 PSI -> 5000 PSI']],
    [14, 32, 40],
    'Spec Diff Log'
  );

  // Verify ZIP local file header signature (PK\x03\x04)
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);
  assert.equal(xlsx[2], 0x03);
  assert.equal(xlsx[3], 0x04);

  const rawText = Buffer.from(xlsx).toString('utf8');
  assert.ok(rawText.includes('[Content_Types].xml'));
  assert.ok(rawText.includes('xl/workbook.xml'));
  assert.ok(rawText.includes('xl/worksheets/sheet1.xml'));
  assert.ok(rawText.includes('Concrete &amp; &quot;Vapor&quot; &lt;Retarder&gt;'));

  const csv = buildCsvString(
    ['CSI Code', 'Delta'],
    [['03 30 00', '4,000 PSI, "Class A"']]
  );
  assert.equal(csv, 'CSI Code,Delta\r\n03 30 00,"4,000 PSI, ""Class A"""');
});

async function parseRealPdfBytesWithProductionPipeline(
  bytes: Uint8Array,
  fileName: string
): Promise<SingleSpecParseOutput> {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const rawLines = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const { lines } = assemblePageLinesFromSpans(textContent.items, pageNum, viewport.height);
    rawLines.push(...lines);
  }

  const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
    rawLines,
    doc.numPages,
    DEFAULT_NOISE_CONFIG
  );
  const { sections } = chunkIntoCsiSections(cleanLines, doc.numPages, new Map());

  return {
    fileName,
    pageCount: doc.numPages,
    parseTimeMs: 10,
    scannedWarning: false,
    strippedPatterns,
    strippedLineCount,
    sections,
  };
}

test('end-to-end PDF binary parsing pipeline handles generated sample Project Manuals', async () => {
  const { oldBytes, newBytes, oldFileName, newFileName } = await generateSampleProjectManuals();
  const [oldBook, newBook] = await Promise.all([
    parseRealPdfBytesWithProductionPipeline(oldBytes, oldFileName),
    parseRealPdfBytesWithProductionPipeline(newBytes, newFileName),
  ]);

  assert.ok((oldBook.strippedLineCount ?? 0) > 0, 'Expected real headers/footers stripped from old PDF');
  assert.ok((newBook.strippedLineCount ?? 0) > 0, 'Expected real headers/footers stripped from new PDF');

  const diff = compareParsedBooks(oldBook, newBook);

  const concrete = diff.results.find((r) => r.sectionCode === '03 30 00');
  const masonry = diff.results.find((r) => r.sectionCode === '04 22 00');
  const hardware = diff.results.find((r) => r.sectionCode === '08 71 00');
  const canopy = diff.results.find((r) => r.sectionCode === '13 31 00');
  const hvac = diff.results.find((r) => r.sectionCode === '23 05 93');

  assert.equal(concrete?.status, 'modified');
  assert.ok(
    concrete?.changedParagraphs.some((p) =>
      p.deltaChips?.includes('Strength: 4000 PSI → 5000 PSI')
    )
  );
  assert.ok(
    concrete?.changedParagraphs.some((p) =>
      p.deltaChips?.includes('Gauge / Mil: 15 mil → 20 mil')
    )
  );

  assert.equal(masonry?.status, 'deleted');
  assert.equal(canopy?.status, 'added');

  assert.equal(hardware?.status, 'modified');
  assert.equal(hardware?.spacingNormalized, true);

  assert.equal(hvac?.status, 'unchanged');
  assert.notEqual(hvac?.oldPageRange, hvac?.newPageRange);
});
