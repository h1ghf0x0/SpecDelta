import type { AppRoute } from '../types/spec';

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface BenchmarkRow {
  metric: string;
  bluebeam: string;
  llmChat: string;
  specDelta: string;
}

export interface SeoPageConfig {
  route: AppRoute;
  category: 'Comparison' | 'Workflow Guide' | 'Benchmark' | 'Trade Guide' | 'Legal & Trust';
  divisionFilter?: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  headline: string;
  summary: string;
  heroImage: 'desk' | 'blueprint';
  heroImageAlt: string;
  keyGotchas: Array<{ title: string; detail: string }>;
  howToSteps: Array<{ step: string; description: string }>;
  benchmarkTable?: BenchmarkRow[];
  faqs: SeoFaqItem[];
  ctaLabel: string;
  ctaTarget: AppRoute;
}

export const SEO_PAGES: Record<Exclude<AppRoute, '/' | '/split-spec-book'>, SeoPageConfig> = {
  '/vs-bluebeam': {
    route: '/vs-bluebeam',
    category: 'Comparison',
    metaTitle: 'Bluebeam Compare Documents Alternative for Spec Books | SpecDelta',
    metaDescription:
      'Stop Bluebeam Revu from flagging 200+ pages red after a 2-line addendum shift. Compare Project Manuals by CSI section locally in your browser.',
    eyebrow: 'Comparison · Bluebeam Revu vs. SpecDelta',
    headline: 'Why Bluebeam Compare Documents Breaks on 600-Page Spec Books',
    summary:
      'Bluebeam Revu compares PDFs visually page-by-page. When an architect adds three lines in Division 01 or concrete mixes in Division 03, every downstream paragraph shifts onto the next page—causing Bluebeam to highlight hundreds of unchanged pages in red.',
    heroImage: 'desk',
    heroImageAlt: 'Commercial construction Project Manual binder open beside architectural scale on drafting desk',
    keyGotchas: [
      {
        title: '01. The Page-Shift Domino Effect',
        detail:
          'Visual overlay and page-locked diffing treat page 142 in the Permit Set as equivalent to page 142 in Addendum 1. A single inserted paragraph offsets every subsequent page boundary.',
      },
      {
        title: '02. Repeating Architect Headers & Footers',
        detail:
          'Updated issue stamps (e.g., "ADDENDUM 01 - AUG 14, 2026") and shifted section page numbers ("08 71 00 - 4") trigger false-positive changes on every single sheet unless manually masked.',
      },
      {
        title: '03. Inconsistent CSI Numbering',
        detail:
          'Architects frequently mix spacing between revisions (SECTION 08 71 00 vs. SECTION 08 7100 vs. 08710). Section-aware normalization aligns them automatically.',
      },
    ],
    howToSteps: [
      {
        step: 'Load Original Bid Set & Addendum PDF',
        description:
          'Drop both Project Manuals into SpecDelta. All parsing runs locally inside a browser Web Worker—your NDA bid specs never leave your workstation.',
      },
      {
        step: 'Auto-Strip Headers, Footers & Page Numbers',
        description:
          'SpecDelta inspects text Y-coordinates, identifies repeating lines in the top and bottom 10% across >40% of pages, and strips them before comparison.',
      },
      {
        step: 'Export a Clean CSI Change Log to Excel',
        description:
          'Review word-level Myers diffs section-by-section with Money & Risk highlights (PSI, mil, allowances, by Owner) and export directly to .xlsx.',
      },
    ],
    benchmarkTable: [
      {
        metric: 'Multi-Division Spec with Page Shifts',
        bluebeam: 'Highlights all downstream shifted pages',
        llmChat: 'Hits context limits or misses silent edits',
        specDelta: 'Isolates modified CSI sections only',
      },
      {
        metric: 'Header / Footer Date Change',
        bluebeam: 'Highlighted on every page',
        llmChat: 'Pollutes token budget',
        specDelta: 'Auto-stripped via Y-coordinate & stamp rules',
      },
      {
        metric: 'Data Privacy / NDA Posture',
        bluebeam: 'Local desktop executable',
        llmChat: 'Uploads proprietary bid docs to cloud',
        specDelta: 'Client-side Web Worker (opt-in Gemini brief)',
      },
      {
        metric: 'Deliverable Format',
        bluebeam: 'Redline PDF markup pages',
        llmChat: 'Unstructured chat bullets',
        specDelta: 'Excel Change Log + Clean Redline Print',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta replace Bluebeam Revu for drawing takeoffs?',
        answer:
          'No. Bluebeam Revu remains the industry standard for 2D plan takeoffs and visual drawing overlays. SpecDelta is built specifically for multi-hundred-page text Project Manuals where page-by-page visual comparison breaks.',
      },
      {
        question: 'How does SpecDelta handle text pushed across a page break?',
        answer:
          'SpecDelta strips repeating headers and footers first, stitches each CSI section into continuous normalized paragraphs across page breaks, and diffs section-to-section rather than page-to-page.',
      },
      {
        question: 'Do my confidential bid specifications get uploaded to a server?',
        answer:
          'Never by default. PDF extraction, noise stripping, CSI chunking, Myers diffing, and Excel export run locally in your browser. Only an explicit opt-in click on the Gemini Scope Brief sends isolated changed paragraphs.',
      },
    ],
    ctaLabel: 'Test on Built-In Sample Spec',
    ctaTarget: '/',
  },

  '/acrobat-alternative': {
    route: '/acrobat-alternative',
    category: 'Comparison',
    metaTitle: 'Adobe Acrobat Compare PDF Alternative for Project Manuals | SpecDelta',
    metaDescription:
      'Why Adobe Acrobat Compare Files stalls on 500-page construction specs—and how CSI section alignment gives estimators an instant Excel Change Log.',
    eyebrow: 'Comparison · Adobe Acrobat Alternative',
    headline: 'Adobe Acrobat Compare PDF Alternative for Construction Project Manuals',
    summary:
      'Adobe Acrobat Pro Compare Files was built for 10-page legal contracts, not 800-page CSI MasterFormat Project Manuals. SpecDelta chunks specifications by CSI division so estimators review only their trade scope.',
    heroImage: 'blueprint',
    heroImageAlt: 'Architectural floor plan and door hardware schedule blueprints on drafting table',
    keyGotchas: [
      {
        title: '01. Memory Spikes & Unfiltered Noise',
        detail:
          'Acrobat attempts to render and compare every running header, footer, and blank back-of-section page, slowing down on large bid sets.',
      },
      {
        title: '02. No CSI Division Filtering',
        detail:
          'Electrical or roofing subcontractors do not want to scroll through 400 pages of architectural finishes to verify two modified paragraphs in Division 26 or 07.',
      },
      {
        title: '03. No Estimator Risk Flagging',
        detail:
          'Acrobat marks a changed comma with the same visual weight as changing 4000 PSI concrete to 5000 PSI or shifting hardware from Furnish & Install to Install Only.',
      },
    ],
    howToSteps: [
      {
        step: 'Drop Original and Revised Project Manuals',
        description:
          'Open SpecDelta in any modern browser—no Acrobat license or desktop install required.',
      },
      {
        step: 'Filter by Your CSI Division',
        description:
          'Narrow the results tree to Division 03, 08, 23, 26, or any specific trade section in one click.',
      },
      {
        step: 'Download Excel Change Log or Clean Redline',
        description:
          'Send a concise tabular change log to your project manager or subcontractor pricing team before bid closing.',
      },
    ],
    faqs: [
      {
        question: 'Can subcontractors split out just their CSI Division from a GC Project Manual?',
        answer:
          'Yes. Use the built-in CSI Spec Book Splitter to extract only the pages belonging to your Division or selected sections into a clean standalone PDF.',
      },
      {
        question: 'Does SpecDelta export to Excel without manual copy-pasting?',
        answer:
          'Yes. Click Excel (.xlsx) in the workbench to download a structured spreadsheet with CSI Division, Section #, Title, Status, Old Text, New Text, and Risk Keyword Flags.',
      },
    ],
    ctaLabel: 'Open Spec Diff Checker',
    ctaTarget: '/',
  },

  '/unclouded-addenda': {
    route: '/unclouded-addenda',
    category: 'Workflow Guide',
    metaTitle: 'How to Catch Unclouded Addendum Changes & Silent Reverts | SpecDelta',
    metaDescription:
      'Detect silent spec edits, deleted CSI sections, and unclouded addendum changes in re-issued Project Manuals without relying on architect narratives.',
    eyebrow: 'Estimator Guide · Addendum Risk Control',
    headline: 'How to Catch Unclouded Addendum Changes in a Re-Issued Spec Book',
    summary:
      'Addendum cover narratives routinely omit subtle edits—such as silently deleting a masonry section, bumping membrane thickness from 60 mil to 80 mil, or reverting an Addendum 1 substitution in Addendum 2.',
    heroImage: 'desk',
    heroImageAlt: 'Open specification binder showing numbered construction specification clauses',
    keyGotchas: [
      {
        title: '01. Narrative vs. Actual Text Mismatches',
        detail:
          'Design teams sometimes summarize "Updated Division 08 hardware" while quietly shifting card reader furnish-and-install responsibility between Division 08 and Division 28.',
      },
      {
        title: '02. Silent Section Deletions & Additions',
        detail:
          'When an architect deletes Section 04 22 00 or inserts Section 13 31 00 without a prominent cloud, page-diff tools scramble every section after it.',
      },
      {
        title: '03. Tolerance & Warranty Creep',
        detail:
          'Single-word changes like "15-year NDL" to "20-year NDL" or "65,000 AIC" to "85,000 AIC" can add tens of thousands of dollars on bid day.',
      },
    ],
    howToSteps: [
      {
        step: 'Run Full-Book Section Alignment',
        description:
          'Never rely solely on the Addendum narrative sheet. Always run the complete re-issued manual against the base Permit/Bid Set.',
      },
      {
        step: 'Filter Results by Money & Risk Flags',
        description:
          'Toggle the Risk-Flagged filter to inspect every edit involving PSI, mil, gauge, AIC, warranty terms, allowances, or "by Owner" language first.',
      },
      {
        step: 'Audit Stripped Headers & Footers',
        description:
          'Open the Stripped Noise inspector to confirm no legitimate spec lines were hidden alongside project footers.',
      },
    ],
    faqs: [
      {
        question: 'How does SpecDelta flag Money & Risk keywords?',
        answer:
          'SpecDelta runs a deterministic regex scanner on every modified token—no AI required—highlighting PSI/MPa, mil/gauge/mm tolerances, hour fire ratings, warranties, dollar allowances, alternates, and scope-transfer phrases like "install only" or "by owner".',
      },
      {
        question: 'What if the architect changed section numbering formatting between addenda?',
        answer:
          'SpecDelta normalizes SECTION 08 71 00, SECTION 08 7100, and legacy 08710 codes into a canonical 6-digit CSI key before matching.',
      },
    ],
    ctaLabel: 'Audit an Addendum Now',
    ctaTarget: '/',
  },

  '/benchmark': {
    route: '/benchmark',
    category: 'Benchmark',
    metaTitle: 'Benchmark: Bluebeam Revu vs. LLMs vs. SpecDelta on Addendum PDFs',
    metaDescription:
      'Side-by-side benchmark measuring false positives, runtime, and privacy across Bluebeam Revu, cloud LLM chat tools, and SpecDelta.',
    eyebrow: 'Benchmark Study · Synthetic Sample Fixture',
    headline: 'Bluebeam Revu vs. Cloud LLMs vs. SpecDelta on a Multi-Division Addendum',
    summary:
      'Methodology note: this benchmark evaluates SpecDelta’s deterministic engine on our reproducible 26-page synthetic Project Manual fixture (Issued_For_Bid_Sample.pdf vs. Addendum_01_Sample.pdf) containing repeating headers, page shifts, inconsistent CSI spacing, a deleted section, and tolerance upgrades.',
    heroImage: 'desk',
    heroImageAlt: 'Specification benchmark desk setup with Project Manual and structural sheets',
    keyGotchas: [
      {
        title: '01. Why Visual Overlay Struggles on Shifts',
        detail:
          'Inserting 2 paragraphs in Section 01 21 00 and Section 03 30 00 shifts Section 23 05 93 down by two pages. Visual page-by-page comparison flags Section 23 as changed even though its specification text did not change.',
      },
      {
        title: '02. Why Full-Book LLM Uploads Struggle',
        detail:
          'Pasting 500+ pages into a cloud chat model risks context truncation, latency, NDA policy concerns, and missed single-digit tolerance edits.',
      },
      {
        title: '03. Why Deterministic Parsing + Optional Diff Brief Works',
        detail:
          'By isolating only the changed paragraphs locally in milliseconds, SpecDelta keeps the core diff deterministic and dramatically shrinks any optional Gemini brief payload.',
      },
    ],
    howToSteps: [
      {
        step: 'Download or Load the 26-Page Benchmark Sample Set',
        description:
          'Click "Load Sample Spec" in the SpecDelta Diff Checker to generate the exact Issued-For-Bid and Addendum 01 synthetic fixture PDFs locally in your browser.',
      },
      {
        step: 'Inspect Division 23 (Aligned Across Page Shift)',
        description:
          'Verify that Section 23 05 93 shifted pages between sets yet reports Unchanged—while Section 03 30 00, 07 54 23, 08 71 00, and 26 24 13 surface exact word diffs.',
      },
      {
        step: 'Export the Auditable Change Log',
        description:
          'Download the .xlsx log to distribute to trade estimators in seconds—and always cross-check pricing-critical changes against the signed Addendum PDF.',
      },
    ],
    benchmarkTable: [
      {
        metric: 'Page-Shift False Positives',
        bluebeam: 'High (every shifted page flagged)',
        llmChat: 'Moderate (summarization drift)',
        specDelta: 'Section-aligned (eliminates page-shift noise)',
      },
      {
        metric: 'Inconsistent CSI Code Matching',
        bluebeam: 'Manual navigation required',
        llmChat: 'Inconsistent across chunks',
        specDelta: 'Automatic (08 71 00 = 08 7100)',
      },
      {
        metric: 'Deterministic Tolerance Detection',
        bluebeam: 'Visual highlight only',
        llmChat: 'Can miss 15 mil → 20 mil edits',
        specDelta: 'Myers word-token diff + Amber risk flag',
      },
      {
        metric: 'Client-Side Privacy',
        bluebeam: 'Local desktop',
        llmChat: 'Cloud upload required',
        specDelta: 'Local Web Worker (optional Gemini brief)',
      },
    ],
    faqs: [
      {
        question: 'Can I download the benchmark sample PDFs to test in Bluebeam myself?',
        answer:
          'Yes. Inside the Diff Checker, click "Download Sample PDFs" right beside the Load Sample Spec action to save both the Issued For Bid and Addendum 01 PDFs to your computer.',
      },
    ],
    ctaLabel: 'Run the Sample Benchmark Live',
    ctaTarget: '/',
  },

  '/compare-division-03-concrete-specs': {
    route: '/compare-division-03-concrete-specs',
    category: 'Trade Guide',
    divisionFilter: '03',
    metaTitle: 'Compare Division 03 Concrete Specs & Addenda | SpecDelta',
    metaDescription:
      'Catch PSI upgrades, fly ash SCM limits, vapor retarder mil thickness, and curing spec edits in CSI Division 03 Project Manuals.',
    eyebrow: 'CSI Trade Guide · Division 03 Concrete',
    headline: 'Comparing Division 03 Concrete Specifications Across Addenda',
    summary:
      'Concrete subcontractors lose margin when addenda quietly increase 28-day compressive strength, tighten water-cementitious ratios, or upgrade under-slab vapor retarders from 15 mil to 20 mil.',
    heroImage: 'blueprint',
    heroImageAlt: 'Structural concrete drawings and specification schedules',
    keyGotchas: [
      {
        title: '01. Compressive Strength & SCM Ratios',
        detail:
          'Watch for 4000 PSI bumped to 5000 PSI, lowered w/cm ratios (0.45 → 0.40), or mandated Class F fly ash / slag percentages affecting ready-mix pricing.',
      },
      {
        title: '02. Vapor Retarder Mil Thickness',
        detail:
          'ASTM E1745 Class A upgrades from 10 mil or 15 mil to 20 mil poly sheeting substantially change material and taped-seam labor costs.',
      },
      {
        title: '03. Hot & Cold Weather Concreting Triggers',
        detail:
          'Added ACI 305R / 306R clauses mandating chilled water, ice, or heated enclosures shift seasonal general conditions risk onto the concrete sub.',
      },
    ],
    howToSteps: [
      {
        step: 'Filter Diffs to Division 03',
        description: 'Run your Project Manual comparison and filter the left tree to Division 03 — Concrete.',
      },
      {
        step: 'Check Tolerance & Unit Highlights',
        description: 'Review amber-flagged PSI, mil, and ACI ratio changes without wading through administrative Division 01 pages.',
      },
      {
        step: 'Split Division 03 for Your Field Team',
        description: 'Need a clean PDF of just Division 03? Use the Spec Splitter to extract Concrete sections in two seconds.',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta highlight PSI and mil changes automatically?',
        answer:
          'Yes. Any modified diff containing PSI, ksi, MPa, mil, gauge, or percentage values is automatically flagged in amber and tagged in the Excel Change Log.',
      },
    ],
    ctaLabel: 'Compare Division 03 Specs',
    ctaTarget: '/',
  },

  '/compare-division-07-thermal-moisture-specs': {
    route: '/compare-division-07-thermal-moisture-specs',
    category: 'Trade Guide',
    divisionFilter: '07',
    metaTitle: 'Compare Division 07 Roofing & Waterproofing Specs | SpecDelta',
    metaDescription:
      'Spot TPO/EPDM membrane mil changes, wind uplift ratings, R-value shifts, and 20-year NDL warranty edits in CSI Division 07.',
    eyebrow: 'CSI Trade Guide · Division 07 Thermal & Moisture',
    headline: 'Comparing Division 07 Roofing, Waterproofing & Insulation Specs',
    summary:
      'Division 07 addenda frequently alter membrane mil thickness, wind-speed warranty thresholds, and No Dollar Limit (NDL) terms—changes that immediately invalidate early supplier quotes.',
    heroImage: 'desk',
    heroImageAlt: 'Construction specification manual opened to thermal and moisture protection sections',
    keyGotchas: [
      {
        title: '01. Membrane Thickness & Fastening Density',
        detail:
          'A silent bump from 60 mil to 80 mil TPO or from mechanically attached to fully adhered shifts both material and adhesive labor dramatically.',
      },
      {
        title: '02. NDL Warranty Duration & Wind Speed',
        detail:
          'Upgrading a 15-year 72 mph warranty to a 20-year 90 mph NDL warranty requires manufacturer-inspected perimeter enhancements.',
      },
    ],
    howToSteps: [
      {
        step: 'Upload Base Spec & Addendum',
        description: 'Compare full Project Manuals locally without splitting files beforehand.',
      },
      {
        step: 'Isolate Division 07 Changes',
        description: 'Select Division 07 in the filter bar and export changed paragraphs for your roofing manufacturer rep.',
      },
    ],
    faqs: [
      {
        question: 'Can I extract just Division 07 from an 800-page GC spec book?',
        answer:
          'Yes. Open the Spec Splitter tool, select Division 07 — Thermal and Moisture Protection, and download a standalone PDF for your distributor.',
      },
    ],
    ctaLabel: 'Split or Compare Division 07',
    ctaTarget: '/split-spec-book',
  },

  '/compare-division-08-doors-hardware-specs': {
    route: '/compare-division-08-doors-hardware-specs',
    category: 'Trade Guide',
    divisionFilter: '08',
    metaTitle: 'Compare Division 08 Doors & Hardware Specs | SpecDelta',
    metaDescription:
      'Track hardware set changes, UL 10C fire ratings, no-substitution clauses, and card reader scope moving between Div 08 and Div 28.',
    eyebrow: 'CSI Trade Guide · Division 08 Openings',
    headline: 'Comparing Division 08 Doors, Frames & Hardware Specifications',
    summary:
      'Division 08 is notorious for late addendum scope ping-pong—electrified locksets, card readers, and power supplies shifting between Division 08 Hardware and Division 28 Security, plus "or equal" clauses turning into "no substitutions."',
    heroImage: 'blueprint',
    heroImageAlt: 'Door and hardware schedule blueprint with architectural scale',
    keyGotchas: [
      {
        title: '01. Furnish & Install vs. Install Only Scope Shifts',
        detail:
          'Addenda routinely shift electrified strikes or card readers to "Install only; furnished by Owner security integrator"—completely altering hardware supply pricing.',
      },
      {
        title: '02. Division 08 vs. Division 28 Cross-References',
        detail:
          'Power supplies, door position switches, and conduit rough-ins frequently migrate between 08 71 00 and 28 13 00 without clear narrative notes.',
      },
      {
        title: '03. Inconsistent Section Numbering (08 71 00 vs. 08 7100)',
        detail:
          'Door hardware consultants often export hardware schedules using legacy 08710 or 08 7100 spacing. SpecDelta normalizes every variant automatically.',
      },
    ],
    howToSteps: [
      {
        step: 'Run Section-Aware Diff',
        description: 'SpecDelta aligns 08 71 00 and 08 7100 seamlessly and exposes exact word-level substitutions.',
      },
      {
        step: 'Review Scope-Liability Highlights',
        description: 'Look for amber flags on "install only", "by owner", "no substitutions", and "UL 10C" fire rating edits.',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta match SECTION 08 71 00 against SECTION 08 7100?',
        answer:
          'Yes. SpecDelta normalizes all 5-digit and 6-digit CSI formatting differences so hardware sections always align cleanly.',
      },
    ],
    ctaLabel: 'Compare Division 08 Specs',
    ctaTarget: '/',
  },

  '/compare-division-09-finishes-specs': {
    route: '/compare-division-09-finishes-specs',
    category: 'Trade Guide',
    divisionFilter: '09',
    metaTitle: 'Compare Division 09 Finishes & Drywall Specs | SpecDelta',
    metaDescription:
      'Catch metal stud gauge upgrades, gypsum fire/STC rating changes, and Level 5 finish edits across CSI Division 09 addenda.',
    eyebrow: 'CSI Trade Guide · Division 09 Finishes',
    headline: 'Comparing Division 09 Framing, Gypsum Board & Finishes Specs',
    summary:
      'Small edits in Division 09—such as upgrading framing from 20 gauge to 18 gauge equivalent, adding Level 5 skim coats, or raising STC acoustic ratings—multiply across tens of thousands of square feet.',
    heroImage: 'desk',
    heroImageAlt: 'Project Manual open to Section 09 29 00 Gypsum Board specifications',
    keyGotchas: [
      {
        title: '01. Stud Gauge & Deflection Limits',
        detail:
          'Watch for L/240 changing to L/360 or minimum mil thickness increases on interior non-load-bearing framing.',
      },
      {
        title: '02. Finish Levels & Moisture Tolerances',
        detail:
          'Changes to concrete slab RH% moisture limits or flooring adhesive specs create hidden floor-prep contingencies.',
      },
    ],
    howToSteps: [
      {
        step: 'Split Division 09 or Run Full Diff',
        description: 'Isolate all 09 XX XX sections in seconds and export modified clauses straight to Excel.',
      },
    ],
    faqs: [
      {
        question: 'Can painting or drywall subs export only their Division 09 sections?',
        answer:
          'Yes. Use the CSI Spec Book Splitter to pick individual sections like 09 29 00 and 09 91 00 into a single focused PDF.',
      },
    ],
    ctaLabel: 'Split Division 09 Spec Book',
    ctaTarget: '/split-spec-book',
  },

  '/compare-division-23-hvac-specs': {
    route: '/compare-division-23-hvac-specs',
    category: 'Trade Guide',
    divisionFilter: '23',
    metaTitle: 'Compare Division 23 HVAC & BAS Specs | SpecDelta',
    metaDescription:
      'Track TAB tolerances, BAS controls integration, and basis-of-design equipment changes in CSI Division 23 mechanical specifications.',
    eyebrow: 'CSI Trade Guide · Division 23 HVAC',
    headline: 'Comparing Division 23 Mechanical, HVAC & Controls Specifications',
    summary:
      'Mechanical packages often sit late in 700-page Project Manuals—right where Bluebeam page-shift noise hits hardest. SpecDelta isolates genuine Division 23 changes across BAS controls, TAB tolerances, and equipment schedules.',
    heroImage: 'blueprint',
    heroImageAlt: 'Mechanical and architectural coordination blueprints on drafting table',
    keyGotchas: [
      {
        title: '01. BAS Controls & Commissioning Scope',
        detail:
          'Addenda often shift BMS integration points, BacNet gateways, or commissioning authority testing hours onto the mechanical contractor.',
      },
      {
        title: '02. TAB Balancing Tolerances & Sheet Metal Gauge',
        detail:
          'Tightened CFM tolerances or SMACNA pressure-class upgrades impact ductwork fabrication and balancing man-hours.',
      },
    ],
    howToSteps: [
      {
        step: 'Verify Zero Page-Shift False Positives',
        description:
          'Even when Divisions 01–09 push Division 23 back by 15 pages, SpecDelta ignores page numbers and compares Section 23 XX XX directly.',
      },
      {
        step: 'Share Clean Redline Print with Vendors',
        description: 'Print or save a clean HTML-to-PDF redline showing only changed HVAC paragraphs.',
      },
    ],
    faqs: [
      {
        question: 'Why does Bluebeam always turn Division 23 red when Division 03 changes?',
        answer:
          'Because Division 23 sits near the back of the Project Manual. Any page growth in earlier divisions shifts every Division 23 page number, breaking page-locked visual comparisons.',
      },
    ],
    ctaLabel: 'Compare Division 23 Specs',
    ctaTarget: '/',
  },

  '/compare-division-26-electrical-specs': {
    route: '/compare-division-26-electrical-specs',
    category: 'Trade Guide',
    divisionFilter: '26',
    metaTitle: 'Compare Division 26 Electrical & Switchgear Specs | SpecDelta',
    metaDescription:
      'Catch switchgear AIC rating hikes, copper vs. aluminum bus edits, manufacturer substitutions, and temporary generator tap requirements in Div 26.',
    eyebrow: 'CSI Trade Guide · Division 26 Electrical',
    headline: 'Comparing Division 26 Electrical & Switchgear Specifications',
    summary:
      'Electrical addenda frequently adjust fault-current AIC ratings, bus plating, approved switchgear manufacturers, and temporary power contingencies for long-lead equipment—all buried deep in the back of the manual.',
    heroImage: 'desk',
    heroImageAlt: 'Commercial Project Manual and drafting tools for electrical specification review',
    keyGotchas: [
      {
        title: '01. AIC Interrupting Ratings & Bus Material',
        detail:
          'Bumping a main switchboard from 65,000 AIC to 85,000 AIC or switching silver-plated to tin-plated copper alters gear pricing and lead times immediately.',
      },
      {
        title: '02. Temporary Generator & Lead-Time Clauses',
        detail:
          'Addenda increasingly insert 28-week lead-time triggers requiring temporary 800A tap boxes or rental generators at the electrical contractor’s cost.',
      },
    ],
    howToSteps: [
      {
        step: 'Compare Bid Set vs. Addendum Locally',
        description: 'Filter straight to Division 26 to inspect switchgear, panelboard, and feeder edits.',
      },
      {
        step: 'Generate Optional Cost & Scope Impact Brief',
        description: 'Toggle the opt-in AI Scope Brief on isolated Division 26 diffs for an instant bid-day risk checklist.',
      },
    ],
    faqs: [
      {
        question: 'Can I isolate Division 26 and Division 28 together?',
        answer:
          'Yes. Both the Diff Checker and CSI Spec Book Splitter let you inspect and extract Division 26 Electrical alongside Division 28 Electronic Safety and Security.',
      },
    ],
    ctaLabel: 'Compare Division 26 Specs',
    ctaTarget: '/',
  },

  '/privacy': {
    route: '/privacy',
    category: 'Legal & Trust',
    metaTitle: 'Privacy & Local Processing Policy | SpecDelta',
    metaDescription:
      'How SpecDelta processes Project Manual PDFs locally in browser Web Workers, stores review checkboxes in localStorage, and handles optional Google Gemini requests.',
    eyebrow: 'Privacy & Architecture Disclosure',
    headline: 'How SpecDelta Handles Your Project Manuals & Optional AI Requests',
    summary:
      'PDF extraction, header/footer stripping, CSI section alignment, word diffing, and Excel/CSV/PDF exports execute locally inside your browser Web Worker. Full Project Manual PDFs are never uploaded to SpecDelta servers.',
    heroImage: 'desk',
    heroImageAlt: 'Specification desk representing local browser PDF processing',
    keyGotchas: [
      {
        title: '01. Local Web Worker PDF Parsing',
        detail:
          'Uploaded PDF bytes remain in browser memory inside an isolated Web Worker. No copies are transmitted to or stored on a backend database.',
      },
      {
        title: '02. Browser Review Persistence (localStorage)',
        detail:
          'Section "Reviewed" checkboxes are saved only in your browser localStorage keyed by filename and page-count fingerprint so multi-hour bid reviews survive refreshes. Clear browser site data anytime to reset.',
      },
      {
        title: '03. Explicit Opt-In Google Gemini Scope Brief',
        detail:
          'Clicking "Generate 5-Bullet Gemini Brief" is strictly optional and transmits only the top risk-ranked changed paragraph excerpts (capped at 25 sections) to Google Gemini via /api/scope-brief.',
      },
    ],
    howToSteps: [
      {
        step: 'Keep Confidential Specs 100% Local',
        description:
          'Leave the Opt-In Gemini Brief closed on NDA projects; deterministic diffing, Money & Risk highlighting, and Excel exports work offline once loaded.',
      },
      {
        step: 'Inspect Exact Transmission Scope Before Clicking',
        description:
          'When you open the Gemini Brief panel, SpecDelta displays the exact section count and character budget before sending any excerpt.',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta retain any PDF text or diffs on a server?',
        answer:
          'No. SpecDelta has no user database or file storage. The optional /api/scope-brief route processes the compact changed-paragraph payload in memory and applies IP rate limiting to prevent abuse.',
      },
    ],
    ctaLabel: 'Return to Spec Diff Checker',
    ctaTarget: '/',
  },

  '/terms': {
    route: '/terms',
    category: 'Legal & Trust',
    metaTitle: 'Terms of Use & Estimator Verification Standard | SpecDelta',
    metaDescription:
      'Terms of use and bid-day verification disclaimer for SpecDelta Project Manual diffing and CSI PDF splitting.',
    eyebrow: 'Terms of Use · Bid-Day Verification',
    headline: 'Terms of Use & Estimator Verification Disclaimer',
    summary:
      'SpecDelta is an automated pre-construction triage and PDF splitting aid designed to accelerate addendum review. It does not replace professional estimator verification against signed contract documents.',
    heroImage: 'blueprint',
    heroImageAlt: 'Construction specifications and drawings for bid-day verification',
    keyGotchas: [
      {
        title: '01. Verify Scope & Pricing Against Signed Addenda',
        detail:
          'PDF text streams vary widely across authoring tools. Always verify material tolerances, allowances, warranties, and contractual directives directly against the architect’s signed Addendum PDF before submitting a bid.',
      },
      {
        title: '02. Scanned or Non-OCR Pages Require Manual Review',
        detail:
          'SpecDelta detects raster-image pages with <30 extractable characters and surfaces per-section warnings, because SpecDelta does not perform optical character recognition (OCR).',
      },
      {
        title: '03. Provided As-Is Without Warranty',
        detail:
          'SpecDelta is provided "as is" under the MIT License without express or implied warranties of completeness or fitness for a particular bid submission.',
      },
    ],
    howToSteps: [
      {
        step: 'Check Parse Coverage & Scanned-Page Warnings',
        description:
          'Confirm the extracted CSI section count and inspect any raster-page overlap notices shown in the workbench.',
      },
      {
        step: 'Audit Stripped Headers & Footers',
        description:
          'Open the Stripped Noise drawer if a specification uses unusual edge-margin formatting.',
      },
    ],
    faqs: [
      {
        question: 'Who is responsible for final bid accuracy?',
        answer:
          'The estimating team and contractor submitting the bid remain solely responsible for verifying all contract requirements against the official bidding documents.',
      },
    ],
    ctaLabel: 'Open Spec Diff Checker',
    ctaTarget: '/',
  },
};

export const TRADE_GUIDE_ROUTES: Array<{ route: AppRoute; code: string; label: string }> = [
  { route: '/compare-division-03-concrete-specs', code: '03', label: 'Concrete' },
  { route: '/compare-division-07-thermal-moisture-specs', code: '07', label: 'Thermal & Moisture' },
  { route: '/compare-division-08-doors-hardware-specs', code: '08', label: 'Doors & Hardware' },
  { route: '/compare-division-09-finishes-specs', code: '09', label: 'Finishes' },
  { route: '/compare-division-23-hvac-specs', code: '23', label: 'HVAC' },
  { route: '/compare-division-26-electrical-specs', code: '26', label: 'Electrical' },
];
