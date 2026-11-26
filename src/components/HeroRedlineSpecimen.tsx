import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Columns2, List } from 'lucide-react';
import type { WordDiffToken } from '../types/spec';
import { RedlineTokenRenderer, type DiffViewMode } from './RedlineTokenRenderer';

interface SpecimenCase {
  id: string;
  tabLabel: string;
  sectionCode: string;
  title: string;
  pageShift: string;
  strippedHeaderSample: string;
  riskFlags: string[];
  tokens: WordDiffToken[];
}

const SPECIMEN_CASES: SpecimenCase[] = [
  {
    id: 'concrete',
    tabLabel: '03 30 00 Concrete',
    sectionCode: '03 30 00',
    title: 'Cast-in-Place Concrete',
    pageShift: 'pp. 114–128 → pp. 119–133',
    strippedHeaderSample: '03 30 00 - # · Issued for Bid',
    riskFlags: ['3,000 PSI → 4,500 PSI', 'Tolerance / Mix Upgrade'],
    tokens: [
      { op: 0, text: '2.4 MIX DESIGN: Elevated structural slab concrete shall achieve a minimum compressive strength of ' },
      { op: -1, text: '3,000 psi', riskMatch: '3,000 psi' },
      { op: 1, text: '4,500 psi', riskMatch: '4,500 psi' },
      { op: 0, text: ' at 28 days with maximum water-cementitious ratio of ' },
      { op: -1, text: '0.50' },
      { op: 1, text: '0.42' },
      { op: 0, text: ' and supplementary fly ash content limited to 20%.' },
    ],
  },
  {
    id: 'hardware',
    tabLabel: '08 71 00 Hardware',
    sectionCode: '08 71 00',
    title: 'Door Hardware',
    pageShift: 'pp. 284–302 → pp. 291–309',
    strippedHeaderSample: 'SECTION 08 71 00 - Page #',
    riskFlags: ['Install Only → Furnish and Install', '5-Year Warranty'],
    tokens: [
      { op: 0, text: '1.2 SCOPE OF WORK: Access control electrified mortise locksets and power transfer hinges shall be ' },
      { op: -1, text: 'furnished by Owner and installed only', riskMatch: 'install only' },
      { op: 1, text: 'furnished and installed', riskMatch: 'furnish and install' },
      { op: 0, text: ' by Division 08 Contractor, including a ' },
      { op: -1, text: '2-year', riskMatch: '2-year' },
      { op: 1, text: '5-year', riskMatch: '5-year' },
      { op: 0, text: ' manufacturer warranty on electrified trim.' },
    ],
  },
  {
    id: 'electrical',
    tabLabel: '26 24 16 Electrical',
    sectionCode: '26 24 16',
    title: 'Panelboards & Switchgear',
    pageShift: 'pp. 512–526 → pp. 521–535',
    strippedHeaderSample: '26 24 16 · Addendum Set',
    riskFlags: ['22 kAIC → 65 kAIC', '$18,500 Allowance'],
    tokens: [
      { op: 0, text: '2.2 DISTRIBUTION PANELBOARDS: Main bus bars shall be tin-plated copper rated minimum ' },
      { op: -1, text: '22,000 AIC', riskMatch: '22,000 AIC' },
      { op: 1, text: '65,000 AIC', riskMatch: '65,000 AIC' },
      { op: 0, text: ' fully rated (series rating prohibited). Include an ' },
      { op: -1, text: 'owner-carried utility metering', riskMatch: 'owner-carried' },
      { op: 1, text: '$18,500 feeder metering allowance', riskMatch: 'allowance' },
      { op: 0, text: ' in base bid.' },
    ],
  },
];

interface HeroRedlineSpecimenProps {
  onLoadSample: () => void;
  isProcessing: boolean;
}

export function HeroRedlineSpecimen({
  onLoadSample,
  isProcessing,
}: HeroRedlineSpecimenProps) {
  const [activeId, setActiveId] = useState<string>('concrete');
  const [viewMode, setViewMode] = useState<DiffViewMode>('inline');

  const activeCase =
    SPECIMEN_CASES.find((c) => c.id === activeId) ?? SPECIMEN_CASES[0];

  return (
    <div className="relative bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between h-full">
      {/* Subtle architectural corner registration ticks */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#1E40AF]/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#1E40AF]/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#1E40AF]/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#1E40AF]/40"
      />

      <div>
        {/* Specimen Title Block & Trade Selector */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-500">
              Interactive Redline Specimen · Unclouded Addendum Preview
            </div>
            <div className="mt-0.5 font-display text-sm font-bold text-slate-900 truncate">
              <span className="font-mono text-[#1E40AF] mr-2 tabular-nums">
                {activeCase.sectionCode}
              </span>
              {activeCase.title}
            </div>
          </div>

          <div
            className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md shrink-0"
            role="group"
            aria-label="Specimen diff view mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('inline')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'inline'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3 h-3" />
              Inline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'side-by-side'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns2 className="w-3 h-3" />
              Side-by-Side
            </button>
          </div>
        </div>

        {/* Trade Tabs */}
        <div className="px-4 sm:px-5 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center gap-1.5">
          {SPECIMEN_CASES.map((item) => {
            const active = item.id === activeCase.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'bg-[#1E40AF] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {item.tabLabel}
              </button>
            );
          })}
        </div>

        {/* Stripped Page-Shift & Header Metadata Strip */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 tabular-nums">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
            <span>
              Aligned across <span className="font-mono text-slate-800">{activeCase.pageShift}</span>
            </span>
          </div>
          <span className="font-mono text-slate-500 truncate max-w-[230px]">
            Stripped: {activeCase.strippedHeaderSample}
          </span>
        </div>

        {/* Live Rendered Diff Clause */}
        <div className="p-4 sm:p-5 space-y-3">
          <RedlineTokenRenderer tokens={activeCase.tokens} mode={viewMode} compact />

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-amber-900">
            <span className="font-semibold text-[#B45309] inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Money &amp; Risk Flagged:
            </span>
            {activeCase.riskFlags.map((flag, i) => (
              <span key={flag} className="font-mono">
                {flag}
                {i < activeCase.riskFlags.length - 1 ? ' ·' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Specimen Action Footer */}
      <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-600">
          Test the full 26-page multi-division sample manual locally
        </span>
        <button
          type="button"
          disabled={isProcessing}
          onClick={onLoadSample}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E40AF] hover:text-[#1E3A8A] disabled:opacity-50 drafting-transition cursor-pointer whitespace-nowrap shrink-0"
        >
          Run Full Sample Diff
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
