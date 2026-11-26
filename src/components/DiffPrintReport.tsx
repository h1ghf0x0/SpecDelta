import type { DiffSectionResult, ParseDiagnostics } from '../types/spec';

interface DiffPrintReportProps {
  diagnostics: ParseDiagnostics;
  allChangedSections: DiffSectionResult[];
  reviewedCodes: Set<string>;
}

export function DiffPrintReport({
  diagnostics,
  allChangedSections,
  reviewedCodes,
}: DiffPrintReportProps) {
  return (
    <div className="hidden print-only p-6 space-y-6">
      <div className="border-b-2 border-slate-900 pb-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          SpecDelta Clean Redline Report
        </h1>
        <div className="mt-1 text-xs text-slate-600 font-mono">
          Baseline: {diagnostics.oldFileName} ({diagnostics.oldPageCount} pp.) · Revised:{' '}
          {diagnostics.newFileName} ({diagnostics.newPageCount} pp.) · {allChangedSections.length} Changed Sections
        </div>
      </div>

      {allChangedSections.map((sec) => (
        <div key={sec.sectionCode} className="print-break-inside-avoid border border-slate-300 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="font-display font-bold text-base text-slate-900">
              <span className="font-mono mr-2">{sec.sectionCode}</span>
              {sec.title}
            </div>
            <div className="text-xs font-mono uppercase font-semibold">
              {sec.status} · {reviewedCodes.has(sec.sectionCode) ? 'REVIEWED' : 'PENDING'} · pp. {sec.oldPageRange} → {sec.newPageRange}
            </div>
          </div>

          {sec.riskFlags.length > 0 && (
            <div className="text-xs font-mono text-amber-900 bg-amber-50 px-2.5 py-1.5 rounded">
              Risk Flags: {sec.riskFlags.join(' · ')}
            </div>
          )}

          {sec.changedParagraphs.map((para, pIdx) => (
            <div key={pIdx} className="text-xs leading-relaxed border-t border-slate-100 pt-2">
              {para.tokens.map((tok, tIdx) => {
                if (tok.op === 0) return <span key={tIdx}>{tok.text}</span>;
                if (tok.op === -1) {
                  return (
                    <del key={tIdx} className="text-red-700 bg-red-50 line-through">
                      {tok.text}
                    </del>
                  );
                }
                return (
                  <ins key={tIdx} className="text-emerald-800 bg-emerald-50 underline font-semibold">
                    {tok.text}
                  </ins>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
