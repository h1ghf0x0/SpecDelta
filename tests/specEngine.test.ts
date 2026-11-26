import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRiskFlags,
  extractParagraphDeltaChips,
  normalizeCsiCode,
} from '../src/utils/csiDictionary';
import { isSectionPageStamp, stripHeadersAndFooters } from '../src/utils/noiseFilter';
import { compareParsedBooks, computeWordDiff } from '../src/utils/specDiffEngine';
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

test('risk dictionary & delta chips catch threshold and modal directive shifts', () => {
  const oldPara = 'Contractor shall provide not less than 15 mil vapor retarder by Owner.';
  const newPara = 'Contractor may provide not exceeding 20 mil vapor retarder furnish and install.';
  const flags = detectRiskFlags(newPara);
  assert.ok(flags.some((f) => f.includes('Threshold / Limit')));
  assert.ok(flags.some((f) => f.includes('Contractual Directive')));

  const chips = extractParagraphDeltaChips(oldPara, newPara);
  assert.ok(chips.some((c) => c === 'Gauge / Mil: 15 mil → 20 mil'));
  assert.ok(chips.some((c) => c === 'Directive: shall → may'));
  assert.ok(chips.some((c) => c === 'Threshold: not less than → not exceeding'));
});

test('stripHeadersAndFooters removes section-scoped title+CSI+page footer stamps cleanly', () => {
  assert.equal(isSectionPageStamp('CAST-IN-PLACE CONCRETE 033000 - 5'), true);
  assert.equal(isSectionPageStamp('08 71 00 - DOOR HARDWARE - Page 4 of 12'), true);
  assert.equal(isSectionPageStamp('SECTION 03 30 00 - CAST-IN-PLACE CONCRETE'), false);
  assert.equal(isSectionPageStamp('1.02 SUBMITTALS'), false);

  const lines = [
    { page: 1, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 1, yPct: 0.25, text: 'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE' },
    { page: 1, yPct: 0.94, text: 'CAST-IN-PLACE CONCRETE 033000 - 5' },
    { page: 2, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 2, yPct: 0.30, text: '1.02 SUBMITTALS' },
    { page: 2, yPct: 0.94, text: 'CAST-IN-PLACE CONCRETE 033000 - 6' },
    { page: 3, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 3, yPct: 0.40, text: 'Provide 4,000 psi concrete.' },
    { page: 3, yPct: 0.94, text: '08 71 00 - DOOR HARDWARE - Page 4 of 12' },
    { page: 4, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 4, yPct: 0.94, text: 'SECTION 26 24 13 - PAGE 2' },
  ];

  const { cleanLines, strippedPatterns } = stripHeadersAndFooters(lines, 4, DEFAULT_NOISE_CONFIG);
  assert.equal(cleanLines.length, 3);
  assert.deepEqual(
    cleanLines.map((l) => l.text),
    [
      'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE',
      '1.02 SUBMITTALS',
      'Provide 4,000 psi concrete.',
    ]
  );
  assert.ok(strippedPatterns.some((p) => p.sample.includes('033000 - 5')));
});

test('compareParsedBooks aligns shifted sections, matches renumbered sections, and blocks scanned books', () => {
  const oldBook: SingleSpecParseOutput = {
    fileName: 'Base.pdf',
    pageCount: 10,
    parseTimeMs: 40,
    scannedWarning: false,
    strippedPatterns: [],
    sections: [
      {
        id: '033000__0',
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
        id: '230593__1',
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
        id: '087100__2',
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
        id: '033000__0',
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
        id: '230593__1',
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
        id: '087113__2',
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

  const diff = compareParsedBooks(oldBook, newBook);
  const concrete = diff.results.find((r) => r.sectionCode === '03 30 00');
  const hvac = diff.results.find((r) => r.sectionCode === '23 05 93');
  const renumbered = diff.results.find((r) => r.sectionCode === '08 71 13');

  assert.equal(concrete?.status, 'modified');
  assert.equal(hvac?.status, 'unchanged');
  assert.equal(renumbered?.renumberedFrom, '08 71 00');
  assert.equal(diff.diagnostics.renumberedCount, 1);

  const scannedNew: SingleSpecParseOutput = {
    ...newBook,
    isMostlyScanned: true,
    scannedPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
  const blocked = compareParsedBooks(oldBook, scannedNew);
  assert.equal(blocked.results.length, 0);
  assert.equal(blocked.diagnostics.newMostlyScanned, true);
});
