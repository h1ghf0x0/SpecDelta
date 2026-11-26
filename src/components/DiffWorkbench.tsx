import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  List,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { exportChangeLogToCsv, exportChangeLogToExcel, triggerBlobDownload } from '../utils/exporters';
import { generateSampleProjectManuals } from '../utils/sampleSpecGenerator';
import { compareParsedBooks } from '../utils/specDiffEngine';
import { HeroRedlineSpecimen } from './HeroRedlineSpecimen';
import { RedlineTokenRenderer, type DiffViewMode } from './RedlineTokenRenderer';
import {
  DEFAULT_NOISE_CONFIG,
  type AppRoute,
  type DiffRunOutput,
  type DiffSectionResult,
  type DiffStatus,
  type NoiseFilterConfig,
  type ScopeBriefResponse,
  type SingleSpecParseOutput,
  type WorkerProgress,
} from '../types/spec';

interface DiffWorkbenchProps {
  onNavigate: (route: AppRoute) => void;
  externalSampleRequest: number;
  initialDivisionFilter?: string;
  onBusyChange?: (busy: boolean) => void;
}

interface FileSlotState {
  fileName: string;
  fileSize: number;
  buffer: ArrayBuffer | null;
  status: 'idle' | 'parsing' | 'ready' | 'error';
  progress: WorkerProgress | null;
  parsed: SingleSpecParseOutput | null;
  error: string | null;
}

const EMPTY_SLOT: FileSlotState = {
  fileName: '',
  fileSize: 0,
  buffer: null,
  status: 'idle',
  progress: null,
  parsed: null,
  error: null,
};

interface FileUploadProgress {
  side: 'old' | 'new';
  fileName: string;
  fileSize: number;
  status: 'reading' | 'parsing' | 'ready' | 'error';
  stage: WorkerProgress['stage'] | 'reading';
  percent: number;
  detail: string;
}

type StatusFilter = 'all' | 'changed' | DiffStatus | 'risk';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DiffWorkbench({
  onNavigate,
  externalSampleRequest,
  initialDivisionFilter = 'all',
  onBusyChange,
}: DiffWorkbenchProps) {
  const [oldSlot, setOldSlot] = useState<FileSlotState>(EMPTY_SLOT);
  const [newSlot, setNewSlot] = useState<FileSlotState>(EMPTY_SLOT);
  const [fileProgressMap, setFileProgressMap] = useState<
    Partial<Record<'old' | 'new', FileUploadProgress>>
  >({});
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diffOutput, setDiffOutput] = useState<DiffRunOutput | null>(null);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('changed');
  const [divisionFilter, setDivisionFilter] = useState<string>(initialDivisionFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullSection, setShowFullSection] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('inline');
  const [sortBy, setSortBy] = useState<'risk' | 'csi'>('risk');
  const [showNoiseDrawer, setShowNoiseDrawer] = useState(false);
  const [noiseConfig, setNoiseConfig] = useState<NoiseFilterConfig>(DEFAULT_NOISE_CONFIG);

  // Opt-in AI Scope Brief state
  const [aiBriefEnabled, setAiBriefEnabled] = useState(false);
  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [aiBriefError, setAiBriefError] = useState<string | null>(null);
  const [aiBrief, setAiBrief] = useState<ScopeBriefResponse | null>(null);

  const oldInputRef = useRef<HTMLInputElement | null>(null);
  const newInputRef = useRef<HTMLInputElement | null>(null);
  const oldWorkerRef = useRef<Worker | null>(null);
  const newWorkerRef = useRef<Worker | null>(null);
  const oldGenRef = useRef(0);
  const newGenRef = useRef(0);
  const lastHandledSampleRef = useRef(0);

  const isProcessing =
    isGeneratingSample ||
    isDiffing ||
    oldSlot.status === 'parsing' ||
    newSlot.status === 'parsing';

  useEffect(() => {
    if (initialDivisionFilter && initialDivisionFilter !== 'all') {
      setDivisionFilter(initialDivisionFilter);
    }
  }, [initialDivisionFilter]);

  useEffect(() => {
    onBusyChange?.(isProcessing);
  }, [isProcessing, onBusyChange]);

  useEffect(() => {
    return () => {
      oldWorkerRef.current?.terminate();
      newWorkerRef.current?.terminate();
    };
  }, []);

  // Yield to paint 100% worker state before running section-to-section Myers diff
  useEffect(() => {
    if (
      oldSlot.status === 'ready' &&
      oldSlot.parsed &&
      newSlot.status === 'ready' &&
      newSlot.parsed
    ) {
      const oldParsed = oldSlot.parsed;
      const newParsed = newSlot.parsed;
      setIsDiffing(true);
      const timerId = window.setTimeout(() => {
        const output = compareParsedBooks(oldParsed, newParsed);
        setDiffOutput(output);
        const changed = output.results.filter((r) => r.status !== 'unchanged');
        const topRisk = [...changed]
          .filter((r) => r.riskFlags.length > 0)
          .sort(
            (a, b) =>
              b.riskFlags.length - a.riskFlags.length ||
              b.addedWords + b.deletedWords - (a.addedWords + a.deletedWords) ||
              a.sectionCode.localeCompare(b.sectionCode)
          )[0];
        const firstTarget = topRisk ?? changed[0] ?? output.results[0] ?? null;
        setSelectedCode(firstTarget ? firstTarget.sectionCode : null);
        setStatusFilter(changed.length > 0 ? 'changed' : 'all');
        setShowFullSection(false);
        setIsDiffing(false);
      }, 0);
      return () => window.clearTimeout(timerId);
    }
  }, [oldSlot.status, oldSlot.parsed, newSlot.status, newSlot.parsed]);

  const cancelSlotWorker = (side: 'old' | 'new') => {
    const workerRef = side === 'old' ? oldWorkerRef : newWorkerRef;
    const genRef = side === 'old' ? oldGenRef : newGenRef;
    const setSlot = side === 'old' ? setOldSlot : setNewSlot;
    genRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setSlot(EMPTY_SLOT);
    setFileProgressMap((prev) => {
      const next = { ...prev };
      delete next[side];
      return next;
    });
  };

  const parseSlot = (
    side: 'old' | 'new',
    buffer: ArrayBuffer,
    fileName: string,
    fileSize: number,
    existingGen?: number,
    overrideConfig?: NoiseFilterConfig
  ): Promise<void> => {
    const workerRef = side === 'old' ? oldWorkerRef : newWorkerRef;
    const genRef = side === 'old' ? oldGenRef : newGenRef;
    const setSlot = side === 'old' ? setOldSlot : setNewSlot;
    const activeNoiseConfig = overrideConfig ?? noiseConfig;

    // Terminate any previous worker on this specific slot
    workerRef.current?.terminate();
    const myGen = existingGen ?? ++genRef.current;
    const requestId = `${side}_${myGen}`;

    setErrorMsg(null);
    setDiffOutput(null);
    setAiBrief(null);
    setAiBriefError(null);

    const initialProgress: WorkerProgress = {
      stage: 'loading',
      percent: 3,
      detail: `Initializing Web Worker for ${fileName}...`,
    };

    setSlot({
      fileName,
      fileSize,
      buffer,
      status: 'parsing',
      progress: initialProgress,
      parsed: null,
      error: null,
    });
    setFileProgressMap((prev) => ({
      ...prev,
      [side]: {
        side,
        fileName,
        fileSize,
        status: 'parsing',
        stage: 'loading',
        percent: initialProgress.percent,
        detail: initialProgress.detail,
      },
    }));

    const worker = new Worker(new URL('../workers/pdf-parser.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    return new Promise<void>((resolve) => {
      worker.onmessage = (event: MessageEvent) => {
        if (genRef.current !== myGen) return;
        const msg = event.data;
        if (!msg || msg.requestId !== requestId) return;

        if (msg.type === 'progress') {
          const p = msg.payload as WorkerProgress;
          setSlot((prev) => ({ ...prev, progress: p }));
          setFileProgressMap((prev) => ({
            ...prev,
            [side]: {
              side,
              fileName,
              fileSize,
              status: 'parsing',
              stage: p.stage,
              percent: p.percent,
              detail: p.detail,
            },
          }));
        } else if (msg.type === 'complete') {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          const parsed = msg.payload as SingleSpecParseOutput;
          setSlot({
            fileName,
            fileSize,
            buffer,
            status: 'ready',
            progress: { stage: 'complete', percent: 100, detail: 'Parsed cleanly.' },
            parsed,
            error: null,
          });
          setFileProgressMap((prev) => ({
            ...prev,
            [side]: {
              side,
              fileName,
              fileSize,
              status: 'ready',
              stage: 'complete',
              percent: 100,
              detail: `${parsed.pageCount} pages · ${parsed.sections.length} CSI sections`,
            },
          }));
          resolve();
        } else if (msg.type === 'error') {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          const message = String(msg.payload || 'Unable to parse PDF.');
          setSlot({
            fileName,
            fileSize,
            buffer,
            status: 'error',
            progress: null,
            parsed: null,
            error: message,
          });
          setFileProgressMap((prev) => ({
            ...prev,
            [side]: {
              side,
              fileName,
              fileSize,
              status: 'error',
              stage: 'loading',
              percent: 0,
              detail: message,
            },
          }));
          setErrorMsg(message);
          resolve();
        }
      };

      worker.onerror = (err) => {
        if (genRef.current !== myGen) return;
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        const message = err.message || 'Web Worker execution error.';
        setSlot({
          fileName,
          fileSize,
          buffer,
          status: 'error',
          progress: null,
          parsed: null,
          error: message,
        });
        setFileProgressMap((prev) => ({
          ...prev,
          [side]: {
            side,
            fileName,
            fileSize,
            status: 'error',
            stage: 'loading',
            percent: 0,
            detail: message,
          },
        }));
        setErrorMsg(message);
        resolve();
      };

      const transferableCopy = buffer.slice(0);
      worker.postMessage(
        {
          type: 'parse-pdf',
          requestId,
          buffer: transferableCopy,
          fileName,
          noiseConfig: activeNoiseConfig,
        },
        [transferableCopy]
      );
    });
  };

  const handleReparseWithNoiseConfig = (nextConfig: NoiseFilterConfig) => {
    setNoiseConfig(nextConfig);
    const jobs: Array<Promise<void>> = [];
    if (oldSlot.buffer && oldSlot.fileName) {
      jobs.push(
        parseSlot('old', oldSlot.buffer, oldSlot.fileName, oldSlot.fileSize, undefined, nextConfig)
      );
    }
    if (newSlot.buffer && newSlot.fileName) {
      jobs.push(
        parseSlot('new', newSlot.buffer, newSlot.fileName, newSlot.fileSize, undefined, nextConfig)
      );
    }
    void Promise.all(jobs);
  };

  const handleLoadSample = async () => {
    setErrorMsg(null);
    setIsGeneratingSample(true);
    try {
      const sample = await generateSampleProjectManuals();
      const oldBuf = sample.oldBytes.buffer.slice(
        sample.oldBytes.byteOffset,
        sample.oldBytes.byteOffset + sample.oldBytes.byteLength
      ) as ArrayBuffer;
      const newBuf = sample.newBytes.buffer.slice(
        sample.newBytes.byteOffset,
        sample.newBytes.byteOffset + sample.newBytes.byteLength
      ) as ArrayBuffer;

      setIsGeneratingSample(false);
      await Promise.all([
        parseSlot('old', oldBuf, sample.oldFileName, sample.oldBytes.byteLength),
        parseSlot('new', newBuf, sample.newFileName, sample.newBytes.byteLength),
      ]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate sample Project Manuals.');
      setIsGeneratingSample(false);
    }
  };

  useEffect(() => {
    if (externalSampleRequest > 0 && externalSampleRequest !== lastHandledSampleRef.current) {
      lastHandledSampleRef.current = externalSampleRequest;
      void handleLoadSample();
    }
  }, [externalSampleRequest]);

  const handleDownloadSamplePdfs = async () => {
    const sample = await generateSampleProjectManuals();
    triggerBlobDownload(
      new Blob([sample.oldBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
      sample.oldFileName
    );
    setTimeout(() => {
      triggerBlobDownload(
        new Blob([sample.newBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
        sample.newFileName
      );
    }, 250);
  };

  const beginReadingFile = async (file: File, side: 'old' | 'new') => {
    const workerRef = side === 'old' ? oldWorkerRef : newWorkerRef;
    const genRef = side === 'old' ? oldGenRef : newGenRef;
    const setSlot = side === 'old' ? setOldSlot : setNewSlot;

    workerRef.current?.terminate();
    const myGen = ++genRef.current;

    setSlot({
      fileName: file.name,
      fileSize: file.size,
      buffer: null,
      status: 'parsing',
      progress: {
        stage: 'loading',
        percent: 1,
        detail: `Reading ${file.name} (${formatBytes(file.size)})...`,
      },
      parsed: null,
      error: null,
    });
    setFileProgressMap((prev) => ({
      ...prev,
      [side]: {
        side,
        fileName: file.name,
        fileSize: file.size,
        status: 'reading',
        stage: 'reading',
        percent: 1,
        detail: `Reading file bytes (${formatBytes(file.size)})...`,
      },
    }));

    const buffer = await file.arrayBuffer();
    if (genRef.current !== myGen) return;
    await parseSlot(side, buffer, file.name, file.size, myGen);
  };

  const handleFilesPick = async (fileList: FileList | null | undefined, side: 'old' | 'new') => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const invalid = files.find(
      (f) => f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')
    );
    if (invalid) {
      setErrorMsg(`"${invalid.name}" is not a valid .pdf Project Manual file.`);
      return;
    }

    if (files.length >= 2) {
      void Promise.all([
        beginReadingFile(files[0], 'old'),
        beginReadingFile(files[1], 'new'),
      ]);
      return;
    }

    void beginReadingFile(files[0], side);
  };

  const handleRerunDiff = () => {
    if (oldSlot.parsed && newSlot.parsed) {
      const output = compareParsedBooks(oldSlot.parsed, newSlot.parsed);
      setDiffOutput(output);
    }
  };

  const availableDivisions = useMemo(() => {
    if (!diffOutput) return [];
    const map = new Map<string, string>();
    for (const r of diffOutput.results) {
      if (!map.has(r.division)) map.set(r.division, r.divisionTitle);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [diffOutput]);

  const counts = useMemo(() => {
    if (!diffOutput) {
      return { total: 0, modified: 0, added: 0, deleted: 0, unchanged: 0, risk: 0, changed: 0 };
    }
    let modified = 0;
    let added = 0;
    let deleted = 0;
    let unchanged = 0;
    let risk = 0;
    for (const r of diffOutput.results) {
      if (r.status === 'modified') modified++;
      else if (r.status === 'added') added++;
      else if (r.status === 'deleted') deleted++;
      else unchanged++;
      if (r.riskFlags.length > 0 && r.status !== 'unchanged') risk++;
    }
    return {
      total: diffOutput.results.length,
      modified,
      added,
      deleted,
      unchanged,
      risk,
      changed: modified + added + deleted,
    };
  }, [diffOutput]);

  const filteredSections = useMemo(() => {
    if (!diffOutput) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = diffOutput.results.filter((r) => {
      if (divisionFilter !== 'all' && r.division !== divisionFilter) return false;
      if (statusFilter === 'changed' && r.status === 'unchanged') return false;
      if (statusFilter === 'modified' && r.status !== 'modified') return false;
      if (statusFilter === 'added' && r.status !== 'added') return false;
      if (statusFilter === 'deleted' && r.status !== 'deleted') return false;
      if (statusFilter === 'unchanged' && r.status !== 'unchanged') return false;
      if (statusFilter === 'risk' && (r.riskFlags.length === 0 || r.status === 'unchanged')) return false;
      if (q) {
        const hay = `${r.sectionCode} ${r.renumberedFrom ?? ''} ${r.title} ${r.divisionTitle} ${r.riskFlags.join(' ')} ${r.fullNewText} ${r.fullOldText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'csi') {
      return [...list].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
    }

    return [...list].sort((a, b) => {
      const aChanged = a.status !== 'unchanged' ? 1 : 0;
      const bChanged = b.status !== 'unchanged' ? 1 : 0;
      if (aChanged !== bChanged) return bChanged - aChanged;

      const aRisk = a.status !== 'unchanged' ? a.riskFlags.length : 0;
      const bRisk = b.status !== 'unchanged' ? b.riskFlags.length : 0;
      if (aRisk !== bRisk) return bRisk - aRisk;

      const aChurn = a.addedWords + a.deletedWords;
      const bChurn = b.addedWords + b.deletedWords;
      if (aChurn !== bChurn) return bChurn - aChurn;

      return a.sectionCode.localeCompare(b.sectionCode);
    });
  }, [diffOutput, divisionFilter, statusFilter, searchQuery, sortBy]);

  const topRiskSections = useMemo(() => {
    if (!diffOutput) return [];
    return diffOutput.results
      .filter((r) => r.status !== 'unchanged' && r.riskFlags.length > 0)
      .sort(
        (a, b) =>
          b.riskFlags.length - a.riskFlags.length ||
          b.addedWords + b.deletedWords - (a.addedWords + a.deletedWords) ||
          a.sectionCode.localeCompare(b.sectionCode)
      )
      .slice(0, 3);
  }, [diffOutput]);

  const activeSection: DiffSectionResult | null = useMemo(() => {
    if (!diffOutput) return null;
    return (
      filteredSections.find((s) => s.sectionCode === selectedCode) ??
      filteredSections[0] ??
      null
    );
  }, [diffOutput, filteredSections, selectedCode]);

  const changedPayloadEstimate = useMemo(() => {
    if (!diffOutput) return { sectionsCount: 0, charCount: 0 };
    const changed = diffOutput.results.filter((r) => r.status !== 'unchanged');
    const charCount = changed.reduce(
      (sum, s) =>
        sum + s.changedParagraphs.reduce((pSum, p) => pSum + p.oldText.length + p.newText.length, 0),
      0
    );
    return { sectionsCount: changed.length, charCount };
  }, [diffOutput]);

  const handleGenerateAiBrief = async () => {
    if (!diffOutput) return;
    const changedSections = diffOutput.results.filter((r) => r.status !== 'unchanged');
    if (changedSections.length === 0) return;

    setAiBriefLoading(true);
    setAiBriefError(null);
    try {
      const response = await fetch('/api/scope-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: changedSections.map((s) => ({
            sectionCode: s.sectionCode,
            division: `${s.division} - ${s.divisionTitle}`,
            title: s.title,
            status: s.status,
            changedParagraphs: s.changedParagraphs.map((p) => ({
              oldText: p.oldText,
              newText: p.newText,
              riskFlags: p.riskFlags,
            })),
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate Scope Impact Brief.');
      }
      setAiBrief(data as ScopeBriefResponse);
    } catch (err: unknown) {
      setAiBriefError(err instanceof Error ? err.message : 'Unable to reach Gemini brief endpoint.');
    } finally {
      setAiBriefLoading(false);
    }
  };

  const renderSlotCard = (
    side: 'old' | 'new',
    slot: FileSlotState,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const isOld = side === 'old';
    const slotLabel = isOld
      ? '01. Baseline Specification'
      : '02. Revised Specification / Addendum';
    const emptyTitle = isOld
      ? 'Drop Original Project Manual PDF'
      : 'Drop Addendum or Re-Issued Manual PDF';
    const emptySub = isOld
      ? 'Issued For Bid / Permit Set · Click or drag .pdf'
      : 'Addendum 1, 2, 3 or Conformed Set · Click or drag .pdf';

    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFilesPick(e.dataTransfer.files, side);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`group rounded-lg border bg-white p-4 drafting-transition cursor-pointer flex flex-col justify-between gap-2.5 ${
          slot.status === 'error'
            ? 'border-red-300'
            : slot.status === 'ready' || slot.status === 'parsing'
            ? 'border-[#1E40AF]/50 ring-1 ring-[#1E40AF]/15'
            : 'border-slate-300 border-dashed hover:border-[#1E40AF]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFilesPick(e.target.files, side);
            e.target.value = '';
          }}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700 group-hover:text-[#1E40AF]">
              {isOld ? <Upload className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500">{slotLabel}</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900 truncate">
                {slot.fileName || emptyTitle}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {slot.status === 'idle' && emptySub}
                {slot.status === 'parsing' && (slot.progress?.detail ?? 'Parsing in worker...')}
                {slot.status === 'ready' && slot.parsed && (
                  <>
                    {formatBytes(slot.fileSize)} · {slot.parsed.pageCount} pp. ·{' '}
                    {slot.parsed.sections.length} CSI sections ·{' '}
                    {slot.parsed.strippedPatterns.length} noise patterns stripped
                  </>
                )}
                {slot.status === 'error' && (
                  <span className="text-red-700">{slot.error}</span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {slot.status === 'parsing' && slot.progress && (
              <>
                <span className="font-mono text-xs font-semibold text-[#1E40AF] tabular-nums">
                  {slot.progress.percent}%
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelSlotWorker(side);
                  }}
                  aria-label={`Cancel parsing ${slot.fileName}`}
                  className="text-xs text-slate-500 hover:text-red-700 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </>
            )}
            {slot.status === 'ready' && (
              <span className="text-xs font-medium text-[#15803D]">Ready</span>
            )}
          </div>
        </div>

        {/* Inline per-file Web Worker progress bar & stage status */}
        {slot.status === 'parsing' && slot.progress && (
          <div className="space-y-1.5">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1E40AF] transition-all duration-150"
                style={{ width: `${slot.progress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              <span className="capitalize">Stage: {slot.progress.stage}</span>
              <span>{formatBytes(slot.fileSize)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Screen Workspace */}
      <div className="no-print">
        {/* Hero / Asymmetric Drafting Desk Split */}
        <section className="blueprint-grid border-b border-slate-200">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-9 lg:py-11">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
              {/* Left Column: Value Proposition + Dual Dropzones */}
              <div className="lg:col-span-6 flex flex-col justify-between gap-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 mb-2.5">
                    <span>Section-Aware Diff Engine</span>
                    <span aria-hidden="true">·</span>
                    <span>CSI MasterFormat Alignment</span>
                    <span aria-hidden="true">·</span>
                    <span>Zero Page-Shift False Positives</span>
                  </div>
                  <h1
                    className="font-display font-bold tracking-tight text-slate-900 leading-[1.1] text-balance"
                    style={{ fontSize: 'clamp(1.95rem, 3.1vw, 2.75rem)' }}
                  >
                    Compare 600-Page Project Manuals by CSI Section—Not Page Number
                  </h1>
                  <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                    Stop Bluebeam from flagging 200+ pages red when an addendum pushes text across page breaks. SpecDelta parses PDFs locally in a Web Worker, strips repeating headers, and surfaces money and risk shifts cleanly.
                  </p>
                </div>

                {/* Dual PDF Dropzones with Immediate Per-File Worker Parsing */}
                <div className="grid grid-cols-1 gap-3">
                  {renderSlotCard('old', oldSlot, oldInputRef)}
                  {renderSlotCard('new', newSlot, newInputRef)}
                </div>
              </div>

              {/* Right Column: Interactive Redline Specimen */}
              <div className="lg:col-span-6">
                <HeroRedlineSpecimen
                  onLoadSample={() => void handleLoadSample()}
                  isProcessing={isProcessing}
                />
              </div>
            </div>

            {/* Active Per-File Worker Progress Tracker */}
            {(isProcessing || Object.values(fileProgressMap).some((entry) => entry?.status === 'parsing' || entry?.status === 'reading')) && (
              <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>
                    {isDiffing
                      ? 'Aligning CSI MasterFormat sections and running Myers word diff...'
                      : 'Processing Project Manual PDFs in local Web Workers'}
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {Object.keys(fileProgressMap).length} file{Object.keys(fileProgressMap).length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(['old', 'new'] as const).map((side) => {
                    const entry = fileProgressMap[side];
                    if (!entry) return null;
                    return (
                      <div
                        key={side}
                        className="border border-slate-200 rounded-md p-3 bg-slate-50/70 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-900 truncate">
                            {side === 'old' ? 'Baseline' : 'Addendum'} · {entry.fileName}
                          </span>
                          <span
                            className={`font-mono font-semibold tabular-nums shrink-0 ${
                              entry.status === 'ready'
                                ? 'text-[#15803D]'
                                : entry.status === 'error'
                                ? 'text-[#B91C1C]'
                                : 'text-[#1E40AF]'
                            }`}
                          >
                            {entry.percent}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-150 ${
                              entry.status === 'ready'
                                ? 'bg-[#15803D]'
                                : entry.status === 'error'
                                ? 'bg-[#B91C1C]'
                                : 'bg-[#1E40AF]'
                            }`}
                            style={{ width: `${entry.percent}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-600 truncate tabular-nums">
                          {entry.detail}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Privacy Assurance + Sample Action Row */}
            <div className="mt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3.5 py-2.5">
                <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                <span>
                  <strong className="font-semibold text-slate-900">100% Private — Runs Locally in Your Browser.</strong>{' '}
                  Your Bid Specs Never Leave Your Device.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {oldSlot.status === 'ready' && newSlot.status === 'ready' && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleRerunDiff}
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Re-Run Comparison
                  </button>
                )}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void handleLoadSample()}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#1E40AF] bg-white border border-[#1E40AF]/30 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isGeneratingSample ? 'Building Sample PDFs...' : 'Load Sample Project Manual'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadSamplePdfs()}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample PDFs
                </button>
              </div>
            </div>

            {/* Error Alert */}
            {errorMsg && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between gap-3 text-sm text-red-900">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-red-700 hover:text-red-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Main Workbench or Asymmetric Empty-State Ledger */}
        {!diffOutput ? (
          <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left: Numbered Drafting Mechanism Ledger */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
                <div className="px-6 py-4 bg-slate-50/60 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    How SpecDelta Eliminates Bid-Day False Positives
                  </h2>
                  <span className="text-xs font-mono text-slate-500">3-Stage Local Pipeline</span>
                </div>

                <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-[#1E40AF] shrink-0 pt-0.5 tabular-nums">
                    01.
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Coordinate Header &amp; Footer Noise Stripping
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                      Reads X/Y text positions inside a dedicated Web Worker, detects lines repeating across more than 40% of pages in the top or bottom 10% margins, and strips stamps like{' '}
                      <span className="font-mono text-xs text-slate-800">08 71 00 - 4</span> before diffing.
                    </p>
                  </div>
                </div>

                <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-[#1E40AF] shrink-0 pt-0.5 tabular-nums">
                    02.
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      CSI MasterFormat Alignment &amp; Bookmark Fallback
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                      Normalizes inconsistent section codes (<span className="font-mono text-xs text-slate-800">08 71 00</span> vs. <span className="font-mono text-xs text-slate-800">08 7100</span> vs. <span className="font-mono text-xs text-slate-800">08710</span>), falls back to PDF outline bookmarks on schedule pages, and heals hyphenated line wraps.
                    </p>
                  </div>
                </div>

                <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-[#1E40AF] shrink-0 pt-0.5 tabular-nums">
                    03.
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Deterministic Money &amp; Risk Highlighter
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                      Surfaces numeric tolerances (<span className="font-mono text-xs text-slate-800">PSI</span>, <span className="font-mono text-xs text-slate-800">mil</span>, <span className="font-mono text-xs text-slate-800">gauge</span>), warranty shifts, allowances, and liability transfers (<span className="font-mono text-xs text-slate-800">furnish and install</span> vs. <span className="font-mono text-xs text-slate-800">install only</span>) with 1-click Excel export.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Dedicated CSI Spec Book Splitter + Proof Benchmarks */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="text-xs font-mono text-slate-500">Companion Utility · Division Slicer</div>
                  <h2 className="font-display text-xl font-bold text-slate-900 leading-snug text-balance">
                    Only bidding one trade? Extract your CSI Division before comparing.
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Use the free CSI MasterFormat Spec Book Splitter to slice Division 03, 08, 23, or 26 out of an 800-page GC Project Manual into a standalone PDF—without uploading a single byte.
                  </p>

                  <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
                    <div>
                      <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">0</div>
                      <div className="text-xs text-slate-500 mt-0.5">False page-shift flags</div>
                    </div>
                    <div>
                      <div className="font-mono text-2xl font-bold text-[#1E40AF] tabular-nums">100%</div>
                      <div className="text-xs text-slate-500 mt-0.5">Local Web Worker parsing</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('/split-spec-book')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] drafting-transition whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open Spec Book Splitter
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/benchmark')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 drafting-transition whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    View 500-Page Benchmark
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
            {diffOutput.diagnostics.scannedWarning && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3 text-sm text-amber-950">
                <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Low embedded text detected.</strong> One of your PDFs appears to be a scanned raster image without an OCR text layer. Run OCR in your PDF viewer first so SpecDelta can extract CSI sections.
                </div>
              </div>
            )}

            {/* Connected Tabular KPI Ledger Strip */}
            <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
              <div className="p-4">
                <div className="text-xs text-slate-500">Total CSI Sections</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {counts.total}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">Modified</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#1E40AF] tabular-nums">
                  {counts.modified}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">New Sections</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#15803D] tabular-nums">
                  {counts.added}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">Deleted Sections</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#B91C1C] tabular-nums">
                  {counts.deleted}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">Money &amp; Risk Sections</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#D97706] tabular-nums">
                  {counts.risk}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">Local Parse Time</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {(diffOutput.diagnostics.parseTimeMs / 1000).toFixed(2)}s
                </div>
              </div>
            </div>

            {/* Action & Export Toolbar */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-mono tabular-nums">
                  Old: {diffOutput.diagnostics.oldPageCount} pages
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  New: {diffOutput.diagnostics.newPageCount} pages
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setShowNoiseDrawer((prev) => !prev)}
                  className="text-[#1E40AF] font-medium hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Stripped Headers/Footers (
                  <span className="tabular-nums">
                    {diffOutput.diagnostics.oldStrippedPatterns.length +
                      diffOutput.diagnostics.newStrippedPatterns.length}
                  </span>
                  )
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => exportChangeLogToExcel(filteredSections)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => exportChangeLogToCsv(filteredSections)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Clean Redline
                </button>
                <button
                  type="button"
                  onClick={() => setAiBriefEnabled((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    aiBriefEnabled
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
                  {aiBriefEnabled ? 'Hide AI Scope Brief' : 'Optional AI Scope Brief'}
                </button>
              </div>
            </div>

            {/* Stripped Noise Inspector & Threshold Tuning Drawer */}
            {showNoiseDrawer && (
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Auto-Stripped Repeating Headers & Footers
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      Active policy: top/bottom {Math.round(noiseConfig.edgeMarginPct * 100)}% margins recurring on &gt;
                      {Math.round(noiseConfig.minRecurrencePct * 100)}% of pages
                      {(diffOutput.diagnostics.outlineHintsUsed ?? 0) > 0
                        ? ` · ${diffOutput.diagnostics.outlineHintsUsed} PDF outline TOC fallback hints applied`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNoiseDrawer(false)}
                    className="text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Configurable Sensitivity Controls */}
                <div className="flex flex-wrap items-center gap-4 pt-1 pb-2 border-b border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-medium">Margin Zone:</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                      {[0.05, 0.1, 0.15].map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
                            handleReparseWithNoiseConfig({
                              ...noiseConfig,
                              edgeMarginPct: val,
                            })
                          }
                          className={`px-2.5 py-1 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                            Math.abs(noiseConfig.edgeMarginPct - val) < 0.001
                              ? 'bg-white text-[#1E40AF] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {Math.round(val * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 font-medium">Page Recurrence:</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                      {[0.3, 0.4, 0.6].map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
                            handleReparseWithNoiseConfig({
                              ...noiseConfig,
                              minRecurrencePct: val,
                            })
                          }
                          className={`px-2.5 py-1 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                            Math.abs(noiseConfig.minRecurrencePct - val) < 0.001
                              ? 'bg-white text-[#1E40AF] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          &gt;{Math.round(val * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      label: `Baseline (${diffOutput.diagnostics.oldFileName})`,
                      items: diffOutput.diagnostics.oldStrippedPatterns,
                    },
                    {
                      label: `Addendum (${diffOutput.diagnostics.newFileName})`,
                      items: diffOutput.diagnostics.newStrippedPatterns,
                    },
                  ].map((col) => (
                    <div key={col.label} className="border border-slate-200 rounded-md overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 border-b border-slate-200">
                        {col.label}
                      </div>
                      {col.items.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500">No repeating edge noise detected.</div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {col.items.map((item, i) => (
                            <li key={i} className="px-3 py-2 text-xs flex items-center justify-between gap-3">
                              <span className="font-mono text-slate-800 truncate">{item.sample}</span>
                              <span className="text-slate-500 shrink-0 tabular-nums">
                                {item.zone} · {item.frequencyPct}% ({item.pageHits}/{item.totalPages} pp)
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opt-In Gemini Cost & Scope Impact Brief */}
            {aiBriefEnabled && (
              <div className="bg-white border border-amber-300 rounded-lg p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Opt-In Bid-Day Cost & Scope Impact Brief
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Strict diff-only transmission: sends only{' '}
                      <span className="font-mono tabular-nums">
                        {changedPayloadEstimate.sectionsCount}
                      </span>{' '}
                      changed sections (
                      <span className="font-mono tabular-nums">
                        {changedPayloadEstimate.charCount.toLocaleString()}
                      </span>{' '}
                      characters of isolated deltas)—never your full Project Manual PDFs.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={aiBriefLoading || changedPayloadEstimate.sectionsCount === 0}
                    onClick={() => void handleGenerateAiBrief()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#D97706] rounded-md hover:bg-[#B45309] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {aiBriefLoading ? 'Analyzing Diffs...' : 'Generate 5-Bullet Scope Brief'}
                  </button>
                </div>

                {aiBriefError && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-900">
                    {aiBriefError}
                  </div>
                )}

                {aiBrief && (
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                    <p className="text-sm font-medium text-slate-900 leading-relaxed">
                      {aiBrief.executiveSummary}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {aiBrief.bullets.map((b, idx) => (
                        <div key={idx} className="border border-slate-200 rounded-md p-3.5 bg-slate-50/70">
                          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                            <span className="font-mono font-semibold text-[#1E40AF] tabular-nums">
                              {b.sectionCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-amber-800">{b.impactCategory}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900">{b.headline}</div>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{b.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bid-Day Risk Triage Quick-Jump Strip */}
            {(topRiskSections.length > 0 || (diffOutput.diagnostics.renumberedCount ?? 0) > 0) && (
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-semibold text-[#B45309] inline-flex items-center gap-1.5 whitespace-nowrap">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Bid-Day Triage:
                  </span>
                  {topRiskSections.map((sec) => (
                    <button
                      key={sec.sectionCode}
                      type="button"
                      onClick={() => {
                        setStatusFilter('changed');
                        setDivisionFilter('all');
                        setSelectedCode(sec.sectionCode);
                        setShowFullSection(false);
                      }}
                      className={`inline-flex items-center gap-1.5 font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                        activeSection?.sectionCode === sec.sectionCode
                          ? 'text-[#1E40AF] underline underline-offset-4'
                          : 'text-slate-700 hover:text-[#1E40AF]'
                      }`}
                    >
                      <span className="font-mono font-semibold tabular-nums">{sec.sectionCode}</span>
                      <span className="text-slate-500">·</span>
                      <span className="truncate max-w-[180px]">{sec.title}</span>
                      <span className="font-mono text-[#B45309] tabular-nums">
                        ({sec.riskFlags.length} risk)
                      </span>
                    </button>
                  ))}
                </div>
                {(diffOutput.diagnostics.renumberedCount ?? 0) > 0 && (
                  <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                    {diffOutput.diagnostics.renumberedCount} renumbered section
                    {diffOutput.diagnostics.renumberedCount === 1 ? '' : 's'} matched by title
                  </span>
                )}
              </div>
            )}

            {/* Split-Pane Diff Workbench */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Rail: Filterable CSI Section List */}
              <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="p-3.5 border-b border-slate-200 space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search CSI code, keyword, PSI..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#1E40AF]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      value={divisionFilter}
                      onChange={(e) => setDivisionFilter(e.target.value)}
                      aria-label="Filter by CSI Division"
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#1E40AF]"
                    >
                      <option value="all">All CSI Divisions ({counts.total})</option>
                      {availableDivisions.map(([div, divTitle]) => (
                        <option key={div} value={div}>
                          Div {div} — {divTitle}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-md">
                    {(
                      [
                        { id: 'changed', label: `Changed (${counts.changed})` },
                        { id: 'risk', label: `Risk (${counts.risk})` },
                        { id: 'all', label: `All (${counts.total})` },
                        { id: 'unchanged', label: `Unchanged (${counts.unchanged})` },
                      ] as Array<{ id: StatusFilter; label: string }>
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                          statusFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-500 font-medium">Order:</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                      <button
                        type="button"
                        onClick={() => setSortBy('risk')}
                        className={`px-2 py-0.5 rounded font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                          sortBy === 'risk'
                            ? 'bg-white text-[#1E40AF] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Risk Priority
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy('csi')}
                        className={`px-2 py-0.5 rounded font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                          sortBy === 'csi'
                            ? 'bg-white text-[#1E40AF] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        CSI Order
                      </button>
                    </div>
                  </div>
                </div>

                <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
                  {filteredSections.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No sections match the active filter.
                    </div>
                  ) : (
                    filteredSections.map((sec) => {
                      const isSelected = activeSection?.sectionCode === sec.sectionCode;
                      return (
                        <button
                          key={sec.sectionCode}
                          type="button"
                          onClick={() => {
                            setSelectedCode(sec.sectionCode);
                            setShowFullSection(false);
                          }}
                          className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {sec.sectionCode}
                            </span>
                            <span
                              className={`text-[11px] font-semibold uppercase tracking-wide ${
                                sec.status === 'modified'
                                  ? 'text-[#1E40AF]'
                                  : sec.status === 'added'
                                  ? 'text-[#15803D]'
                                  : sec.status === 'deleted'
                                  ? 'text-[#B91C1C]'
                                  : 'text-slate-500'
                              }`}
                            >
                              {sec.status === 'added'
                                ? 'New Section'
                                : sec.status === 'deleted'
                                ? 'Deleted Section'
                                : sec.status === 'modified'
                                ? 'Modified'
                                : 'Unchanged'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-800 truncate">
                            {sec.title}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                            <span>
                              pp. {sec.oldPageRange} → {sec.newPageRange}
                            </span>
                            {sec.renumberedFrom && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono text-[#1E40AF]">
                                  was {sec.renumberedFrom}
                                </span>
                              </>
                            )}
                            {sec.status !== 'unchanged' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">
                                  +{sec.addedWords} / -{sec.deletedWords} words
                                </span>
                              </>
                            )}
                            {sec.riskFlags.length > 0 && sec.status !== 'unchanged' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#B45309] font-medium">
                                  {sec.riskFlags.length} Risk
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Right Inspector: Word-Level Redline Diff */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
                {!activeSection ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    Select a CSI section from the left tree to inspect changes.
                  </div>
                ) : (
                  <div>
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/60">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                            <span className="font-mono font-semibold text-[#1E40AF] tabular-nums">
                              Div {activeSection.division}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{activeSection.divisionTitle}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Old pp. {activeSection.oldPageRange} → New pp. {activeSection.newPageRange}
                            </span>
                            {activeSection.renumberedFrom && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#1E40AF] font-medium font-mono tabular-nums">
                                  Renumbered ({activeSection.renumberedFrom} → {activeSection.sectionCode})
                                </span>
                              </>
                            )}
                            {activeSection.spacingNormalized && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-700 font-medium">
                                  Aligned ({activeSection.oldRawCode} ↔ {activeSection.newRawCode})
                                </span>
                              </>
                            )}
                          </div>
                          <h2 className="font-display text-xl font-bold text-slate-900">
                            <span className="font-mono mr-2 tabular-nums">{activeSection.sectionCode}</span>
                            {activeSection.title}
                          </h2>
                        </div>

                        {activeSection.status !== 'unchanged' && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {!showFullSection && (
                              <div
                                className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md"
                                role="group"
                                aria-label="Diff view mode"
                              >
                                <button
                                  type="button"
                                  onClick={() => setDiffViewMode('inline')}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 ${
                                    diffViewMode === 'inline'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <List className="w-3.5 h-3.5" />
                                  Inline Redline
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDiffViewMode('side-by-side')}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 ${
                                    diffViewMode === 'side-by-side'
                                      ? 'bg-white text-slate-900 shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Columns2 className="w-3.5 h-3.5" />
                                  Side-by-Side
                                </button>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => setShowFullSection((prev) => !prev)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 drafting-transition cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {showFullSection ? (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                  Show Changed Paragraphs Only
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                  Show Full Section Text
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {activeSection.riskFlags.length > 0 && activeSection.status !== 'unchanged' && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-900">
                          <span className="font-semibold text-[#B45309] inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Money & Risk Flags:
                          </span>
                          {activeSection.riskFlags.map((flag, idx) => (
                            <span key={idx} className="font-mono text-[11px]">
                              {flag}
                              {idx < activeSection.riskFlags.length - 1 ? ' ·' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-6 space-y-5">
                      {activeSection.status === 'unchanged' ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {activeSection.renumberedFrom
                                ? `Renumbered (${activeSection.renumberedFrom} → ${activeSection.sectionCode}) · Zero Textual Changes`
                                : 'Zero Textual Changes Detected'}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                              Even when earlier divisions shifted this section from page{' '}
                              <span className="font-mono tabular-nums">{activeSection.oldPageRange}</span>{' '}
                              to page{' '}
                              <span className="font-mono tabular-nums">{activeSection.newPageRange}</span>,
                              SpecDelta stripped repeating headers/footers and verified 100% identical normalized text.
                            </p>
                          </div>
                        </div>
                      ) : showFullSection ? (
                        <div className="space-y-4">
                          <div className="text-xs font-medium text-slate-500">
                            Full Normalized Section Text ({activeSection.status === 'deleted' ? 'Baseline' : 'Addendum'})
                          </div>
                          <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-md p-4">
                            {activeSection.status === 'deleted'
                              ? activeSection.fullOldText
                              : activeSection.fullNewText}
                          </div>
                        </div>
                      ) : (
                        activeSection.changedParagraphs.map((para, idx) => (
                          <div
                            key={idx}
                            className="border border-slate-200 rounded-lg overflow-hidden"
                          >
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-mono text-slate-600 tabular-nums">
                                Change Block {idx + 1} of {activeSection.changedParagraphs.length}
                              </span>
                              {para.riskFlags.length > 0 && (
                                <span className="text-[#B45309] font-medium">
                                  {para.riskFlags.join(' · ')}
                                </span>
                              )}
                            </div>

                            <div className="p-4 space-y-3 text-sm leading-relaxed">
                              {para.contextBefore && (
                                <p className="text-xs text-slate-500 leading-relaxed">
                                  {para.contextBefore}
                                </p>
                              )}

                              <RedlineTokenRenderer
                                tokens={para.tokens}
                                mode={diffViewMode}
                              />

                              {para.contextAfter && (
                                <p className="text-xs text-slate-500 leading-relaxed">
                                  {para.contextAfter}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Print-Only Clean Redline Report (HTML-to-PDF) */}
      {diffOutput && (
        <div className="hidden print-only p-6 space-y-6">
          <div className="border-b-2 border-slate-900 pb-4">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              SpecDelta Clean Redline Report
            </h1>
            <div className="mt-1 text-xs text-slate-600 font-mono">
              Baseline: {diffOutput.diagnostics.oldFileName} ({diffOutput.diagnostics.oldPageCount} pp.) · Revised:{' '}
              {diffOutput.diagnostics.newFileName} ({diffOutput.diagnostics.newPageCount} pp.)
            </div>
          </div>

          {filteredSections
            .filter((s) => s.status !== 'unchanged')
            .map((sec) => (
              <div key={sec.sectionCode} className="print-break-inside-avoid border border-slate-300 rounded p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="font-display font-bold text-base text-slate-900">
                    <span className="font-mono mr-2">{sec.sectionCode}</span>
                    {sec.title}
                  </div>
                  <div className="text-xs font-mono uppercase font-semibold">
                    {sec.status} · pp. {sec.oldPageRange} → {sec.newPageRange}
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
                        <ins key={tIdx} className="text-emerald-800 bg-emerald-50 no-underline font-semibold">
                          {tok.text}
                        </ins>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
