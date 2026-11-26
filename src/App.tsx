import { useEffect, useState } from 'react';
import { DiffWorkbench } from './components/DiffWorkbench';
import { Footer } from './components/Footer';
import { SeoContentPage } from './components/SeoContentPage';
import { SpecSplitter } from './components/SpecSplitter';
import { TopNav } from './components/TopNav';
import { SEO_PAGES } from './data/seoContent';
import type { AppRoute } from './types/spec';

const VALID_ROUTES = new Set<AppRoute>([
  '/',
  '/split-spec-book',
  '/vs-bluebeam',
  '/acrobat-alternative',
  '/unclouded-addenda',
  '/benchmark',
  '/compare-division-03-concrete-specs',
  '/compare-division-07-thermal-moisture-specs',
  '/compare-division-08-doors-hardware-specs',
  '/compare-division-09-finishes-specs',
  '/compare-division-23-hvac-specs',
  '/compare-division-26-electrical-specs',
  '/privacy',
  '/terms',
]);

function normalizeRoute(pathname: string): AppRoute | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return VALID_ROUTES.has(clean as AppRoute) ? (clean as AppRoute) : null;
}

function updateDocumentSeo(route: AppRoute | null) {
  let title = 'SpecDelta – Section-Aware Construction Spec Diff & CSI Splitter';
  let description =
    'Compare 600-page Project Manuals and Addenda locally in your browser by CSI section—no page-shift false positives, instant Excel redlines, and CSI PDF splitting.';
  let robotsContent = 'index, follow';

  const schemas: unknown[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SpecDelta',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
      description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ];

  if (route === null) {
    title = 'Page Not Found (404) | SpecDelta';
    description = 'The requested SpecDelta page could not be found.';
    robotsContent = 'noindex, nofollow';
  } else if (route === '/split-spec-book') {
    title = 'Free CSI MasterFormat Spec Book Splitter | SpecDelta';
    description =
      'Upload an 800-page construction Project Manual PDF and extract only your CSI Division or sections into a clean standalone PDF locally in your browser.';
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to Split a Construction Project Manual by CSI Division',
      step: [
        {
          '@type': 'HowToStep',
          name: 'Load Project Manual PDF',
          text: 'Drop your full GC Project Manual PDF into the browser splitter.',
        },
        {
          '@type': 'HowToStep',
          name: 'Select CSI Divisions or Sections',
          text: 'Check only the CSI MasterFormat divisions or sections you are bidding.',
        },
        {
          '@type': 'HowToStep',
          name: 'Download Extracted PDF',
          text: 'Click Download Extracted PDF to save a sliced PDF in seconds.',
        },
      ],
    });
  } else if (route !== '/' && route in SEO_PAGES) {
    const cfg = SEO_PAGES[route];
    title = cfg.metaTitle;
    description = cfg.metaDescription;
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: cfg.faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.answer,
        },
      })),
    });
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: cfg.headline,
      step: cfg.howToSteps.map((s) => ({
        '@type': 'HowToStep',
        name: s.step,
        text: s.description,
      })),
    });
  }

  document.title = title;
  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('content', content);
  };
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);

  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    document.head.appendChild(robotsMeta);
  }
  robotsMeta.setAttribute('content', robotsContent);

  const schemaScript = document.getElementById('specdelta-schema');
  if (schemaScript) {
    schemaScript.textContent = JSON.stringify(schemas);
  }
}

export default function App() {
  const [route, setRoute] = useState<AppRoute | null>(() =>
    normalizeRoute(window.location.pathname)
  );
  const [divisionPreset, setDivisionPreset] = useState<string>('all');
  const [sampleRequestCount, setSampleRequestCount] = useState<number>(0);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    updateDocumentSeo(route);
  }, [route]);

  const navigate = (nextRoute: AppRoute, divisionCode?: string) => {
    if (divisionCode) {
      setDivisionPreset(divisionCode);
    } else if (nextRoute === '/') {
      setDivisionPreset('all');
    }
    if (window.location.pathname !== nextRoute || window.location.search) {
      window.history.pushState({}, '', nextRoute);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleLoadSampleFromAnywhere = (divisionCode?: string) => {
    if (divisionCode) {
      setDivisionPreset(divisionCode);
    }
    if (route !== '/') {
      window.history.pushState({}, '', '/');
      setRoute('/');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    setSampleRequestCount((c) => c + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#0F172A]">
      <TopNav
        currentRoute={route}
        onNavigate={(r) => navigate(r)}
        onLoadSample={() => handleLoadSampleFromAnywhere()}
        isBusy={isBusy}
      />

      <main className="flex-1">
        {route === null ? (
          <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-20">
            <div className="max-w-xl bg-white border border-slate-200 rounded-lg p-8 space-y-4">
              <div className="font-mono text-xs font-semibold text-[#B91C1C]">HTTP 404 · Route Not Found</div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                That SpecDelta page does not exist.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Check the URL path or return directly to the Spec Diff Checker or CSI Spec Book Splitter.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href="/"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      navigate('/');
                    }
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors"
                >
                  Open Spec Diff Checker
                </a>
                <a
                  href="/split-spec-book"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      navigate('/split-spec-book');
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Open CSI Spec Splitter
                </a>
              </div>
            </div>
          </section>
        ) : route === '/' ? (
          <DiffWorkbench
            onNavigate={(r) => navigate(r)}
            externalSampleRequest={sampleRequestCount}
            initialDivisionFilter={divisionPreset}
            onBusyChange={setIsBusy}
          />
        ) : route === '/split-spec-book' ? (
          <SpecSplitter onNavigateWithDivision={(r, div) => navigate(r, div)} />
        ) : (
          <SeoContentPage
            route={route}
            onNavigate={(r, div) => navigate(r, div)}
            onRunSampleDiff={(div) => handleLoadSampleFromAnywhere(div)}
          />
        )}
      </main>

      <Footer onNavigate={(r) => navigate(r)} />
    </div>
  );
}
