"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  FileUp,
  Info,
  RefreshCcw,
  SlidersHorizontal,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/use-toast";
import { WizardStepper } from "@/components/import/import-stepper";
import { ImportSummaryCards } from "@/components/import/import-summary-cards";
import { ImportRowsTable } from "@/components/import/import-rows-table";
import { ImportHistory } from "@/components/import/import-history";
import { ImportExceptions } from "@/components/import/import-exceptions";
import {
  MAX_IMPORT_FILE_BYTES,
  IMPORT_FIELDS,
  type ColumnMapping,
  type ParsedImportFile,
  type ImportFileFormat,
  type RawImportRow,
  type StatementPeriod,
} from "@/lib/import/types";
import {
  parseCsv,
  parseXlsx,
  detectColumns,
  validateMapping,
  normalizeImportRow,
  tagDuplicates,
  categorizeImportRows,
  buildImportPreview,
  shouldIncludeByDefault,
  filterPreviewRows,
  countByView,
  summarizeStatementPeriod,
  periodsOverlap,
  IMPORT_REVIEW_VIEWS,
  IMPORT_REVIEW_VIEW_LABELS,
  type BuiltPreview,
  type ImportReviewView,
} from "@/lib/import/index";
import type { ImportCategoryOption } from "@/lib/import/types";
import {
  IMPORT_DRAFT_VERSION,
  parseDraft,
  serializeDraft,
  parseMappingMemo,
  serializeMappingMemo,
  parseAccountMemo,
  serializeAccountMemo,
  claimImportOwner,
  draftKey,
  accountKey,
  mappingKey,
  draftMatchesFile,
  readStorage,
  writeStorage,
  removeStorage,
  sessionStore,
  localStore,
  type ImportDraft,
} from "@/lib/import/draft";
import {
  getImportFingerprintsAction,
  commitImportAction,
  parsePdfImportAction,
  getExistingDateRangeAction,
} from "@/lib/actions/imports";
import { getCategoryRulesAction } from "@/lib/actions/rules";
import type { CategoryRuleDto } from "@/types";
import type { AccountServiceData } from "@/lib/services/accounts";
import type { CategoryServiceData } from "@/lib/services/categories";
import type { ImportHistoryItem, ImportCommitServiceResult } from "@/lib/services/imports";

export interface ImportWizardProps {
  accounts: AccountServiceData[];
  categories: CategoryServiceData[];
  histories: ImportHistoryItem[];
  currency: string;
  businessId: string;
  userName?: string;
  userEmail: string;
  businessName: string;
  onSignOut?: () => void;
}

const STEPS = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Columns" },
  { id: 3, label: "Review" },
  { id: 4, label: "Import" },
];

const MAPPING_FIELDS: { field: (typeof IMPORT_FIELDS)[number]; label: string; required?: boolean }[] = [
  { field: "date", label: "Date", required: true },
  { field: "description", label: "Description", required: true },
  { field: "amount", label: "Amount (single column)" },
  { field: "debit", label: "Debit / money out" },
  { field: "credit", label: "Credit / money in" },
  { field: "reference", label: "Reference" },
  { field: "type", label: "Type column" },
  { field: "category", label: "Category column" },
];

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Format an ISO day for display, or an em dash when absent. */
function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? iso : DAY_FORMAT.format(date);
}

/** Draft/selection maps round-trip through JSON with string keys. */
function toNumericBoolMap(source: Record<string, boolean>): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  for (const [key, value] of Object.entries(source)) out[Number(key)] = value;
  return out;
}

function toNumericStringMap(source: Record<string, string>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [key, value] of Object.entries(source)) out[Number(key)] = value;
  return out;
}

export function ImportWizard({
  accounts,
  categories,
  histories,
  currency,
  businessId,
  userName,
  userEmail,
  businessName,
  onSignOut,
}: ImportWizardProps) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [step, setStep] = React.useState(1);
  const [working, setWorking] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);

  const [file, setFile] = React.useState<File | null>(null);
  const [parsed, setParsed] = React.useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [preview, setPreview] = React.useState<BuiltPreview | null>(null);
  const [existing, setExisting] = React.useState<string[]>([]);
  const [rules, setRules] = React.useState<CategoryRuleDto[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [selections, setSelections] = React.useState<Record<number, boolean>>({});
  const [overrides, setOverrides] = React.useState<Record<number, string>>({});
  const [accountId, setAccountId] = React.useState("");
  const [view, setView] = React.useState<ImportReviewView>("all");
  const [bulkCategory, setBulkCategory] = React.useState("");
  const [existingRange, setExistingRange] = React.useState<StatementPeriod | null>(null);
  const [lastResult, setLastResult] = React.useState<ImportCommitServiceResult | null>(null);
  const [resumable, setResumable] = React.useState<ImportDraft | null>(null);

  const buildPreviewFor = React.useCallback(
    async (
      p: ParsedImportFile,
      m: ColumnMapping,
      fps: string[],
      businessRules: CategoryRuleDto[],
    ): Promise<BuiltPreview> => {
      const rows = p.rows.map((raw, index) => normalizeImportRow(raw, m, index));
      const tags = tagDuplicates(rows, new Set(fps));
      const categoryOptions: ImportCategoryOption[] = categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      }));
      const suggestions = await categorizeImportRows(rows, {
        businessRules,
        categoryOptions,
      });
      return buildImportPreview(rows, suggestions, tags);
    },
    [categories],
  );

  const applyDefaults = React.useCallback((built: BuiltPreview): Record<number, boolean> => {
    const next: Record<number, boolean> = {};
    for (const row of built.rows) {
      if (shouldIncludeByDefault(row)) next[row.rowIndex] = true;
    }
    return next;
  }, []);

  // Restore pointers to any unfinished review and the last-used account. The
  // draft is deliberately NOT auto-applied: the user re-selects the file and
  // we match it, so the wrong statement can never be silently resumed. The
  // read runs in a microtask callback (not synchronously) to avoid a cascading
  // render on mount, and is skipped after unmount.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Phase 5: claim the caches for this business first — a different
      // business's leftovers on a shared browser are purged before we read,
      // and expired drafts/hints are dropped outright rather than resumed.
      claimImportOwner(localStore(), sessionStore(), businessId);
      const draftRaw = readStorage(sessionStore(), draftKey(businessId));
      const draft = parseDraft(draftRaw);
      if (!draft && draftRaw) removeStorage(sessionStore(), draftKey(businessId));
      const accountRaw = readStorage(localStore(), accountKey(businessId));
      const rememberedAccount = parseAccountMemo(accountRaw);
      if (!rememberedAccount && accountRaw) {
        removeStorage(localStore(), accountKey(businessId));
      }
      if (cancelled) return;
      if (draft) setResumable(draft);
      if (rememberedAccount && accounts.some((a) => a.id === rememberedAccount)) {
        setAccountId(rememberedAccount);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, accounts]);

  // Autosave the review decisions so a refresh/accidental navigation does not
  // discard mapping + per-row choices. Only non-sensitive decisions are kept.
  React.useEffect(() => {
    if (!parsed || step < 2) return;
    const draft: ImportDraft = {
      v: IMPORT_DRAFT_VERSION,
      fileName: parsed.fileName,
      fileSize: file?.size ?? 0,
      fileLastModified: file?.lastModified ?? 0,
      fileType: parsed.fileType,
      mapping,
      accountId,
      step,
      selections: Object.fromEntries(Object.entries(selections)),
      overrides: Object.fromEntries(Object.entries(overrides)),
      savedAt: new Date().toISOString(),
    };
    writeStorage(sessionStore(), draftKey(businessId), serializeDraft(draft));
  }, [parsed, file, step, mapping, accountId, selections, overrides, businessId]);

  // Resolve the already-recorded date span when the user reaches confirmation,
  // for the overlapping-statement-period warning.
  React.useEffect(() => {
    if (step !== 4) return;
    let cancelled = false;
    void (async () => {
      const range = await getExistingDateRangeAction(accountId || null);
      if (!cancelled) setExistingRange(range);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, accountId]);

  const clearDraft = React.useCallback(() => {
    removeStorage(sessionStore(), draftKey(businessId));
    setResumable(null);
  }, [businessId]);

  const handleFile = React.useCallback(
    async (next: File) => {
      if (working) return;
      setParseError(null);
      setWorking(true);
      try {
        const ext = next.name.split(".").pop()?.toLowerCase() ?? "";
        if (ext !== "csv" && ext !== "xlsx" && ext !== "pdf") {
          setParseError("Unsupported file type. Upload a .csv, .xlsx or .pdf statement.");
          return;
        }
        if (next.size > MAX_IMPORT_FILE_BYTES) {
          setParseError("This file is larger than 5 MB. Split it and try again.");
          return;
        }
        if (next.size === 0) {
          setParseError("This file is empty.");
          return;
        }

        let headers: string[];
        let rows: RawImportRow[];
        if (ext === "pdf") {
          // pdf-parse is Node-only: the PDF is read by the server action,
          // while CSV/XLSX stay on-device. Commit re-parses these same
          // bytes server-side before anything is written.
          const fd = new FormData();
          fd.set("file", next);
          const res = await parsePdfImportAction(fd);
          if (!res.ok || !res.headers || !res.rows) {
            setParseError(res.error ?? "This PDF could not be read.");
            return;
          }
          headers = res.headers;
          rows = res.rows;
        } else {
          const arrayBuffer = await next.arrayBuffer();
          const raw =
            ext === "csv"
              ? parseCsv(new TextDecoder("utf-8").decode(arrayBuffer).replace(/^\uFEFF/, ""))
              : parseXlsx(arrayBuffer);
          if (raw.headers.length === 0 || raw.rows.length === 0) {
            setParseError(
              "No data rows found. The first row must be a header and there must be at least one data row.",
            );
            return;
          }
          headers = raw.headers;
          rows = raw.rows;
        }

        const file: ParsedImportFile = {
          fileName: next.name,
          fileType: ext as ImportFileFormat,
          headers,
          rows,
        };

        const detected = detectColumns(file.headers);
        const fps = await getImportFingerprintsAction();
        const businessRules = await getCategoryRulesAction();

        // Prefer a remembered mapping for this exact header set, but only when
        // it still validates against the file (server re-validates at commit).
        const remembered = parseMappingMemo(
          readStorage(localStore(), mappingKey(businessId, file.headers)),
        );
        const rememberedValid =
          remembered && validateMapping(remembered, file.headers).length === 0;

        // Resume the same file's earlier review, if one was saved.
        const resume =
          resumable && draftMatchesFile(resumable, next) ? resumable : null;

        let nextMapping: ColumnMapping = rememberedValid ? remembered : detected;
        if (resume && Object.keys(resume.mapping).length > 0) {
          nextMapping = resume.mapping;
        }

        setFile(next);
        setParsed(file);
        setMapping(nextMapping);
        setExisting(fps);
        setRules(businessRules);

        const built = await buildPreviewFor(file, nextMapping, fps, businessRules);
        setPreview(built);

        if (resume) {
          setSelections(toNumericBoolMap(resume.selections));
          setOverrides(toNumericStringMap(resume.overrides));
          if (resume.accountId && accounts.some((a) => a.id === resume.accountId)) {
            setAccountId(resume.accountId);
          }
          setStep(Math.min(Math.max(resume.step, 2), 4));
          clearDraft();
          toast.info({
            title: "Review restored",
            description: `Picked up where you left off with ${resume.fileName}.`,
          });
        } else {
          setSelections(applyDefaults(built));
          setOverrides({});
          setStep(2);
        }
        setView("all");
        setBulkCategory("");
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "This file could not be parsed.");
      } finally {
        setWorking(false);
      }
    },
    [
      buildPreviewFor,
      applyDefaults,
      working,
      businessId,
      resumable,
      accounts,
      clearDraft,
      toast,
    ],
  );

  const changeMapping = React.useCallback(
    async (field: keyof ColumnMapping, value: string) => {
      if (!parsed) return;
      const next: ColumnMapping = { ...mapping, [field]: value === "" ? undefined : value };
      if (field === "amount") {
        next.debit = undefined;
        next.credit = undefined;
      }
      if (field === "debit" || field === "credit") {
        next.amount = undefined;
      }
      setMapping(next);
      setWorking(true);
      try {
        const built = await buildPreviewFor(parsed, next, existing, rules);
        setPreview(built);
        setSelections(applyDefaults(built));
        setOverrides({});
      } finally {
        setWorking(false);
      }
    },
    [parsed, mapping, existing, rules, buildPreviewFor, applyDefaults],
  );

  const reset = React.useCallback(() => {
    setStep(1);
    setFile(null);
    setParsed(null);
    setMapping({});
    setPreview(null);
    setExisting([]);
    setRules([]);
    setParseError(null);
    setSelections({});
    setOverrides({});
    setAccountId("");
    setView("all");
    setBulkCategory("");
    setExistingRange(null);
    setLastResult(null);
    clearDraft();
  }, [clearDraft]);

  const handleCommit = async () => {
    if (!parsed || !preview) return;
    setCommitting(true);
    try {
      const fd = new FormData();
      if (!file) {
        toast.error({ title: "Import failed", description: "Choose the file again and retry." });
        return;
      }
      fd.set("file", file);
      fd.set("fileName", parsed.fileName);
      fd.set("fileType", parsed.fileType);
      fd.set("mapping", JSON.stringify(mapping));
      fd.set("accountId", accountId);
      fd.set(
        "selections",
        JSON.stringify(
          preview.rows.map((row) => ({
            rowIndex: row.rowIndex,
            include: !!selections[row.rowIndex],
            importAnyway:
              !!selections[row.rowIndex] && row.duplicate === "duplicate_existing",
            categoryId: overrides[row.rowIndex] ?? null,
          })),
        ),
      );

      const res = await commitImportAction({}, fd);
      if (res.ok && res.result) {
        // Remember this format + account for next time (wrapped with a
        // bounded saved-at timestamp), and drop the draft now that it has
        // been committed.
        writeStorage(
          localStore(),
          mappingKey(businessId, parsed.headers),
          serializeMappingMemo(mapping),
        );
        writeStorage(
          localStore(),
          accountKey(businessId),
          serializeAccountMemo(accountId),
        );
        clearDraft();

        const skipped =
          res.result.existingDuplicates + res.result.inFileDuplicates;
        const title =
          res.result.imported === 0 && skipped > 0
            ? `${res.result.imported} imported · ${skipped} skipped as duplicates`
            : `${res.result.imported} of ${res.result.total} row${res.result.total === 1 ? "" : "s"} imported`;
        toast.success({
          title,
          description: <ImportSuccessDescription result={res.result} />,
        });
        router.refresh();
        setLastResult(res.result);
        setStep(1);
      } else {
        toast.error({ title: "Import failed", description: res.error });
      }
    } catch (e) {
      toast.error({ title: "Import failed", description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setCommitting(false);
    }
  };

  const mappingIssues = parsed ? validateMapping(mapping, parsed.headers) : [];
  const includeCount = preview
    ? Object.values(selections).filter(Boolean).length
    : 0;

  const period = preview ? summarizeStatementPeriod(preview.rows) : null;
  const viewCounts = preview ? countByView(preview.rows) : null;
  const visibleRows = React.useMemo(
    () => (preview ? filterPreviewRows(preview.rows, view) : []),
    [preview, view],
  );
  const overlap =
    step === 4 && period && existingRange ? periodsOverlap(period, existingRange) : false;
  const overrideCount = Object.keys(overrides).length;

  const applyBulkCategory = () => {
    if (!preview || !bulkCategory) return;
    const category = categories.find((c) => c.id === bulkCategory);
    if (!category) return;
    setOverrides((prev) => {
      const next = { ...prev };
      for (const row of preview.rows) {
        if (!selections[row.rowIndex]) continue;
        if (row.type !== category.type) continue;
        next[row.rowIndex] = category.id;
      }
      return next;
    });
  };

  return (
    <AppShell
      onSignOut={onSignOut}
      header={{
        title: "Import",
        user: userName ? { name: userName, email: userEmail } : null,
      }}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Import transactions
            </h1>
            <p className="mt-1 text-muted">
              Bring in a CSV, Excel or PDF bank statement · {businessName}
            </p>
          </div>
          {!lastResult && step > 1 && (
            <Button variant="outline" size="sm" onClick={reset} leftIcon={<RefreshCcw className="h-3.5 w-3.5" />}>
              Start over
            </Button>
          )}
        </div>

        {lastResult ? (
          <ImportCompletePanel
            result={lastResult}
            onStartOver={() => {
              setLastResult(null);
              reset();
            }}
          />
        ) : (
          <>
            <WizardStepper steps={STEPS} current={step} />

        {/* ------------------------------------------------------------------ */}
        {/* Step 1 · Upload                                                    */}
        {/* ------------------------------------------------------------------ */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-subtle" aria-hidden="true" />
                Choose a statement file
              </CardTitle>
              <CardDescription>
                Supported: .csv, .xlsx (Excel, or Google Sheets downloaded as
                .xlsx) and .pdf. Files up to 5 MB.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resumable && (
                <div className="mb-4">
                  <Alert
                    tone="info"
                    title="Unfinished review found"
                    onDismiss={clearDraft}
                  >
                    <p>
                      You were reviewing <span className="font-medium">{resumable.fileName}</span>.
                      Choose the same file again to pick up where you left off.
                    </p>
                  </Alert>
                </div>
              )}
              {/* The drop target stays a plain element; the keyboard- and
                  click-accessible affordance is the real "Browse files"
                  button inside it (a div with role="button" could not be
                  triggered by Enter/Space in every browser). */}
              <div
                onDragOver={(e) => {
                  if (working) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  if (working) return;
                  e.preventDefault();
                  const next = e.dataTransfer.files?.[0];
                  if (next) void handleFile(next);
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border-strong bg-surface-subtle/30 px-6 py-12 text-center transition-colors ${
                  working
                    ? "opacity-80"
                    : "hover:border-brand/50 hover:bg-brand-soft/20"
                }`}
              >
                {working ? (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <Spinner className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p className="font-medium text-foreground">
                      Reading your statement…
                    </p>
                    <p className="text-sm text-muted">
                      Parsing the file on our server — this usually takes a few
                      seconds.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <UploadCloud className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p className="font-medium text-foreground">
                      Drop a statement file here
                    </p>
                    <p className="text-sm text-muted">
                      Statements from Moniepoint, Kuda, Opay, Access, GTB, and
                      similar exports work best. Column names are detected
                      automatically and can be corrected next.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => inputRef.current?.click()}
                      leftIcon={<FileUp className="h-4 w-4" aria-hidden="true" />}
                    >
                      Browse files
                    </Button>
                  </>
                )}
                <input
                  ref={inputRef}
                  id="import-file"
                  type="file"
                  accept=".csv,.xlsx,.pdf"
                  className="sr-only"
                  aria-label="Choose a CSV, XLSX or PDF file to import"
                  onChange={(e) => {
                    const next = e.currentTarget.files?.[0];
                    if (next) void handleFile(next);
                    e.currentTarget.value = "";
                  }}
                />
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Nothing is sent to any AI service. CSV and Excel files are read on your device;
                PDF statements are read securely on our server to build this preview, and your
                choices only apply when you confirm the import in the last step.
              </p>

              {parseError && (
                <div className="mt-4">
                  <Alert tone="danger" title="Could not read this file" onDismiss={() => setParseError(null)}>
                    {parseError}
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 2 · Map columns                                               */}
        {/* ------------------------------------------------------------------ */}
        {step === 2 && parsed && (
          <Card>
            <CardHeader>
              <CardTitle>Map columns</CardTitle>
              <CardDescription>
                Match your file&apos;s columns to LedgerAI fields. Date and Description are
                required; the amount can be a single Amount column or a Debit/Credit pair.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mappingIssues.length > 0 && (
                <Alert tone="danger" title="The mapping is incomplete">
                  <ul className="list-disc pl-4">
                    {mappingIssues.map((issue) => (
                      <li key={issue.field}>{issue.message}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {MAPPING_FIELDS.map(({ field, label, required }) => (
                  <Field key={field} label={label} required={required}>
                    <Select
                      value={mapping[field] ?? ""}
                      onChange={(e) => void changeMapping(field, e.target.value)}
                      aria-label={`Map the ${label} field`}
                    >
                      <option value="">Not mapped</option>
                      {parsed.headers
                        .filter((h) => h.trim() !== "")
                        .map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                    </Select>
                  </Field>
                ))}
              </div>

              {parsed.rows.length > 0 && (
                <AliveSample parsed={parsed} mapping={mapping} />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm text-muted">
                  {parsed.rows.length} data {parsed.rows.length === 1 ? "row" : "rows"} detected in{" "}
                  {parsed.fileName}.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                  <Button
                    disabled={mappingIssues.length > 0 || working}
                    loading={working}
                    onClick={() => setStep(3)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Review rows
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 3 · Review                                                     */}
        {/* ------------------------------------------------------------------ */}
        {step === 3 && preview && parsed && (
          <Card>
            <CardHeader>
              <CardTitle>Review imported rows</CardTitle>
              <CardDescription>
                Rows ready to import are included by default. Duplicates are excluded until you
                choose &quot;Import anyway&quot;. Review low-confidence categories and override per-row
                where needed. When you change a suggested category, LedgerAI will remember that
                correction for future imports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImportSummaryCards summary={preview.summary} />

              {preview.summary.needsReview > 0 && (
                <Alert tone="warning" title="Some categories need a look">
                  {preview.summary.needsReview} row{preview.summary.needsReview === 1 ? "" : "s"} have a
                  low-confidence suggestion. Change the category in the table below, or leave it and
                  the fallback category (Other / Other Income) is used.
                </Alert>
              )}

              {period && (period.from || period.to) && (
                <p className="text-sm text-muted">
                  Statement period:{" "}
                  <span className="font-medium text-foreground">
                    {formatDay(period.from)} – {formatDay(period.to)}
                  </span>
                </p>
              )}

              {viewCounts && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label="Filter rows by status"
                >
                  {IMPORT_REVIEW_VIEWS.map((option) => (
                    <Button
                      key={option}
                      variant={view === option ? "secondary" : "outline"}
                      size="sm"
                      aria-pressed={view === option}
                      disabled={option !== "all" && viewCounts[option] === 0}
                      onClick={() => setView(option)}
                    >
                      {IMPORT_REVIEW_VIEW_LABELS[option]} ({viewCounts[option]})
                    </Button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="w-56"
                  aria-label="Choose a category to apply to selected rows"
                >
                  <option value="">Set category for selected…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!bulkCategory || includeCount === 0}
                  onClick={applyBulkCategory}
                  leftIcon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                >
                  Apply to selected rows
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={overrideCount === 0}
                  onClick={() => setOverrides({})}
                >
                  Reset categories{overrideCount > 0 ? ` (${overrideCount})` : ""}
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted tabular-nums">
                  {includeCount} of {preview.rows.length} rows selected
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={preview.summary.readyToImport === 0}
                    onClick={() => {
                      const next: Record<number, boolean> = {};
                      for (const row of preview.rows) {
                        if (shouldIncludeByDefault(row)) next[row.rowIndex] = true;
                      }
                      setSelections(next);
                    }}
                  >
                    Select all ready
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelections({})}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {preview.summary.readyToImport === 0 && (
                <p className="text-sm text-muted">
                  No new rows — use Import anyway on duplicates.
                </p>
              )}

              {working ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded-field bg-surface-subtle"
                    />
                  ))}
                </div>
              ) : visibleRows.length === 0 ? (
                <p className="rounded-field border border-border bg-surface-subtle/40 px-3 py-6 text-center text-sm text-muted">
                  No rows match this filter.
                </p>
              ) : (
                <ImportRowsTable
                  rows={visibleRows}
                  currency={currency}
                  categories={categories}
                  selections={selections}
                  categoryOverrides={overrides}
                  onToggle={(rowIndex, include) =>
                    setSelections((prev) => ({ ...prev, [rowIndex]: include }))
                  }
                  onCategoryChange={(rowIndex, categoryId) =>
                    setOverrides((prev) => ({ ...prev, [rowIndex]: categoryId }))
                  }
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm text-muted">
                  {preview.summary.invalid} invalid row{preview.summary.invalid === 1 ? "" : "s"} will be
                  skipped — they cannot be imported.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setStep(2)} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                    Back
                  </Button>
                  <Button
                    disabled={includeCount === 0}
                    onClick={() => setStep(4)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Step 4 · Confirm import                                             */}
        {/* ------------------------------------------------------------------ */}
        {step === 4 && preview && parsed && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm import</CardTitle>
              <CardDescription>
                {parsed.fileName} · {includeCount} row{includeCount === 1 ? "" : "s"} to import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImportSummaryCards summary={preview.summary} />

              {period && (period.from || period.to) && (
                <p className="text-sm text-muted">
                  Statement period:{" "}
                  <span className="font-medium text-foreground">
                    {formatDay(period.from)} – {formatDay(period.to)}
                  </span>
                  {existingRange && (existingRange.from || existingRange.to) && (
                    <>
                      {" "}
                      · you already have records from {formatDay(existingRange.from)} to{" "}
                      {formatDay(existingRange.to)}
                    </>
                  )}
                </p>
              )}

              {overlap && (
                <Alert tone="warning" title="This period overlaps transactions you already have">
                  Exact duplicates are skipped automatically; anything genuinely new is still
                  imported.
                </Alert>
              )}

              <label className="flex w-full max-w-sm flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  Account (optional)
                </span>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Choose an account for the imported transactions">
                  <option value="">No account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>

              <Alert tone="info" title="What happens next">
                <ul className="list-disc pl-4">
                  <li>Rows marked ready are written in one atomic step — all or nothing.</li>
                  <li>Duplicates that already exist in your ledger are skipped automatically.</li>
                  <li>Rows you chose to skip, and any that turn out to duplicate, are not saved.</li>
                </ul>
              </Alert>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-sm text-muted">
                  Files are deleted after the import completes.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setStep(3)} disabled={committing}>
                    Back
                  </Button>
                  <Button
                    loading={committing}
                    onClick={handleCommit}
                    leftIcon={<Check className="h-4 w-4" />}
                  >
                    Import {includeCount} transaction{includeCount === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
          </>
        )}

        <ImportHistory items={histories} />
      </div>
    </AppShell>
  );
}

/** Live sample of how the very first data row parses with the current mapping. */
function AliveSample({
  parsed,
  mapping,
}: {
  parsed: ParsedImportFile;
  mapping: ColumnMapping;
}) {
  const sample = parsed.rows[0].values;
  const parts: string[] = [];
  const push = (key: string | undefined, label: string) => {
    if (!key || key.trim() === "") return;
    const value = (sample[key] ?? "").trim();
    if (value === "") return;
    parts.push(`${label}: ${value}`);
  };
  push(mapping.date, "Date");
  push(mapping.description, "Description");
  push(mapping.amount, "Amount");
  push(mapping.debit, "Debit");
  push(mapping.credit, "Credit");

  return (
    <p className="text-sm text-muted">
      <span className="font-medium uppercase tracking-wide text-xs">Sample row:</span>{" "}
      {parts.length > 0 ? parts.join(" · ") : "No sample values to show yet."}
    </p>
  );
}

export interface ImportSuccessDescriptionProps {
  result: ImportCommitServiceResult;
}

export function ImportSuccessDescription({ result }: ImportSuccessDescriptionProps) {
  const parts: string[] = [];
  if (result.imported > 0) parts.push(`${result.imported} imported`);
  if (result.existingDuplicates > 0) parts.push(`${result.existingDuplicates} already in ledger`);
  if (result.inFileDuplicates > 0) parts.push(`${result.inFileDuplicates} duplicate in file`);
  if (result.invalid > 0) parts.push(`${result.invalid} invalid`);
  if (result.excluded > 0) parts.push(`${result.excluded} excluded`);

  return (
    <>
      <p>{parts.length > 0 ? parts.join(" · ") : "Nothing to import."}</p>
      {result.learnedRuleCount > 0 && (
        <p className="mt-1">
          Remembered {result.learnedRuleCount} categorisation
          {result.learnedRuleCount === 1 ? "" : "s"} —{" "}
          <Link href="/settings/rules" className="underline">
            manage them in Settings → Rules
          </Link>
        </p>
      )}
    </>
  );
}

export interface ImportCompletePanelProps {
  result: ImportCommitServiceResult;
  onStartOver: () => void;
}

/**
 * Durable post-import summary shown in place of the wizard. It keeps the
 * exception queue (rows that were not written, with reasons) visible after the
 * transient toast disappears.
 */
export function ImportCompletePanel({ result, onStartOver }: ImportCompletePanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
          Import complete
        </CardTitle>
        <CardDescription>
          <ImportSuccessDescription result={result} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.exceptions.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">
                {result.exceptions.length} row
                {result.exceptions.length === 1 ? "" : "s"} not imported
              </h3>
            </div>
            <p className="text-xs text-muted">
              These rows were skipped. Fix the file or add them manually if any are wrong.
            </p>
            <ImportExceptions exceptions={result.exceptions} />
          </div>
        ) : (
          <p className="text-sm text-muted">Every row in this statement was handled.</p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onStartOver}>
            Import another statement
          </Button>
          <Link href="/transactions" className="text-sm text-brand underline">
            View transactions
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}