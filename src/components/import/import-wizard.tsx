"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  Info,
  RefreshCcw,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
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
import {
  MAX_IMPORT_FILE_BYTES,
  IMPORT_FIELDS,
  type ColumnMapping,
  type ParsedImportFile,
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
  type BuiltPreview,
} from "@/lib/import/index";
import type { ImportCategoryOption } from "@/lib/import/types";
import {
  getImportFingerprintsAction,
  commitImportAction,
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

export function ImportWizard({
  accounts,
  categories,
  histories,
  currency,
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

  const handleFile = React.useCallback(
    async (next: File) => {
      setParseError(null);
      setWorking(true);
      try {
        const ext = next.name.split(".").pop()?.toLowerCase() ?? "";
        if (ext !== "csv" && ext !== "xlsx") {
          setParseError("Unsupported file type. Upload a .csv or .xlsx statement.");
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

        const file: ParsedImportFile = {
          fileName: next.name,
          fileType: ext as "csv" | "xlsx",
          headers: raw.headers,
          rows: raw.rows,
        };

        const detected = detectColumns(file.headers);
        const fps = await getImportFingerprintsAction();
        const businessRules = await getCategoryRulesAction();

        setFile(next);
        setParsed(file);
        setMapping(detected);
        setExisting(fps);
        setRules(businessRules);

        const built = await buildPreviewFor(file, detected, fps, businessRules);
        setPreview(built);
        setSelections(applyDefaults(built));
        setOverrides({});
        setAccountId("");
        setStep(2);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "This file could not be parsed.");
      } finally {
        setWorking(false);
      }
    },
    [buildPreviewFor, applyDefaults],
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
  }, []);

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
        reset();
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
              Bring in a CSV or Excel bank statement · {businessName}
            </p>
          </div>
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={reset} leftIcon={<RefreshCcw className="h-3.5 w-3.5" />}>
              Start over
            </Button>
          )}
        </div>

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
                Supported: .csv and .xlsx (Excel / Google Sheets). Files up to 5 MB.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                role="button"
                tabIndex={0}
                aria-label="Choose a CSV or XLSX file to import"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const next = e.dataTransfer.files?.[0];
                  if (next) void handleFile(next);
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border-strong bg-surface-subtle/30 px-6 py-12 text-center transition-colors hover:border-brand/50 hover:bg-brand-soft/20"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <UploadCloud className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="font-medium text-foreground">Drop a file here or click to browse</p>
                <p className="text-sm text-muted">
                  Statements from Moniepoint, Kuda, Opay, Access, GTB, and similar exports work
                  best. Column names are detected automatically and can be corrected next.
                </p>
                <input
                  ref={inputRef}
                  id="import-file"
                  type="file"
                  accept=".csv,.xlsx"
                  className="sr-only"
                  onChange={(e) => {
                    const next = e.currentTarget.files?.[0];
                    if (next) void handleFile(next);
                    e.currentTarget.value = "";
                  }}
                />
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Nothing is sent to any AI service. Files stay on your device until you confirm
                the import in the last step.
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
              ) : (
                <ImportRowsTable
                  rows={preview.rows}
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