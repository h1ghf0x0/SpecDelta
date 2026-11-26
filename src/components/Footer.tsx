import { TRADE_GUIDE_ROUTES } from '../data/seoContent';
import type { AppRoute } from '../types/spec';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="no-print border-t border-slate-200 bg-white mt-16">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="font-display text-base font-bold tracking-tight text-slate-900 cursor-pointer"
            >
              SpecDelta
            </button>
            <p className="text-sm text-slate-600 leading-relaxed max-w-xs">
              Section-aware Project Manual diffing and CSI MasterFormat splitting built for commercial estimators. Runs locally in your browser.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide mb-3">
              Core Tools
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                >
                  Spec Diff Checker
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/split-spec-book')}
                  className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                >
                  CSI Spec Book Splitter
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/benchmark')}
                  className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                >
                  500-Page Spec Benchmark
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide mb-3">
              Workflow Comparisons
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/vs-bluebeam')}
                  className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                >
                  Bluebeam Compare Alternative
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/acrobat-alternative')}
                  className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                >
                  Adobe Acrobat Alternative
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('/unclouded-addenda')}
                  className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                >
                  Unclouded Addendum Guide
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide mb-3">
              CSI Trade Guides
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              {TRADE_GUIDE_ROUTES.map((trade) => (
                <li key={trade.route}>
                  <button
                    type="button"
                    onClick={() => onNavigate(trade.route)}
                    className="hover:text-[#1E40AF] transition-colors cursor-pointer"
                  >
                    <span className="font-mono text-xs text-slate-500 mr-1.5 tabular-nums">
                      Div {trade.code}
                    </span>
                    {trade.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span>SpecDelta</span>
            <span aria-hidden="true">·</span>
            <span>Client-Side Web Worker PDF Engine</span>
            <span aria-hidden="true">·</span>
            <span>Zero Server PDF Storage</span>
          </div>
          <span>CSI MasterFormat Division Alignment</span>
        </div>
      </div>
    </footer>
  );
}
