import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { invalidateApiPaths, postApi, useApi } from "../hooks/use-api";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useI18n } from "../hooks/use-i18n";
import { useColors } from "../hooks/use-colors";
import { tr } from "../lib/app-language";
import {
  buildImportRequestBody,
  canPreviewSource,
  canSubmitImport,
  createEmptyImportWizardBookForm,
  nextWizardStepAfterPreview,
  readTextFileAsUtf8,
  type ImportWizardBookForm,
  type ImportWizardPreviewPayload,
  type ImportWizardResult,
  type ImportWizardStep,
} from "./import-wizard-state";

interface BookSummary {
  readonly id: string;
  readonly title: string;
}

interface GenreInfo {
  readonly id: string;
  readonly name?: string;
  readonly language?: string;
  readonly source?: string;
}

interface Nav {
  toDashboard: () => void;
  toBook: (bookId: string) => void;
  toChat?: () => void;
}

const STEPS: ReadonlyArray<{ id: ImportWizardStep; zh: string; en: string }> = [
  { id: "source", zh: "上传文稿", en: "Source" },
  { id: "preview", zh: "预览分章", en: "Preview" },
  { id: "meta", zh: "书籍信息", en: "Book meta" },
  { id: "importing", zh: "导入中", en: "Importing" },
  { id: "done", zh: "完成", en: "Done" },
];

export function ImportExistingWizard({
  nav,
  theme,
  t,
}: {
  readonly nav: Nav;
  readonly theme: Theme;
  readonly t: TFunction;
}) {
  const c = useColors(theme);
  const { lang } = useI18n();
  const isZh = lang === "zh";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: booksData } = useApi<{ books: ReadonlyArray<BookSummary> }>("/books");
  const { data: genresData } = useApi<{ genres: ReadonlyArray<GenreInfo> }>("/genres");

  const [step, setStep] = useState<ImportWizardStep>("source");
  const [text, setText] = useState("");
  const [splitRegex, setSplitRegex] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportWizardPreviewPayload | null>(null);
  const [form, setForm] = useState<ImportWizardBookForm>(() => createEmptyImportWizardBookForm(lang));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportWizardResult | null>(null);

  useEffect(() => {
    setForm((prev) => ({ ...prev, language: lang }));
  }, [lang]);

  const genres = useMemo(() => {
    const list = genresData?.genres ?? [];
    return list.filter((g) => !g.language || g.language === lang || g.source === "project");
  }, [genresData, lang]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const patchForm = (patch: Partial<ImportWizardBookForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const content = await readTextFileAsUtf8(file);
      setText(content);
      setFileName(file.name);
      if (!form.title.trim()) {
        const base = file.name.replace(/\.(txt|md|markdown)$/i, "");
        patchForm({ title: base });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runPreview = async () => {
    if (!canPreviewSource({ text, fileName })) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postApi<ImportWizardPreviewPayload>("/import/chapters/preview", {
        text,
        splitRegex: splitRegex.trim() || undefined,
      });
      setPreview(data);
      setStep(nextWizardStepAfterPreview(data) === "meta" ? "preview" : "source");
      if (data.chapterCount > 0) setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!canSubmitImport({ preview, form })) return;
    setBusy(true);
    setError(null);
    setStep("importing");
    try {
      const body = buildImportRequestBody({ text, splitRegex, form });
      const data = await postApi<ImportWizardResult>("/import/chapters", body);
      setResult(data);
      invalidateApiPaths(["/api/v1/books", `/api/v1/books/${data.bookId}`]);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("meta");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {t("import.wizardHint")}
        </p>
      </div>

      {/* Stepper */}
      <ol className="flex flex-wrap gap-2">
        {STEPS.filter((s) => s.id !== "importing").map((s, index) => {
          const active = s.id === step || (step === "importing" && s.id === "meta");
          const done = stepIndex > index || step === "done";
          return (
            <li
              key={s.id}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : done
                    ? "border-border bg-secondary/40 text-foreground"
                    : "border-border text-muted-foreground"
              }`}
            >
              {index + 1}. {isZh ? s.zh : s.en}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className={`border ${c.cardStatic} rounded-xl p-6 space-y-5`}>
        {step === "source" && (
          <>
            <div
              className="rounded-xl border border-dashed border-border bg-secondary/20 px-6 py-10 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0] ?? null;
                void handleFile(file);
              }}
            >
              <Upload className="mx-auto mb-3 text-primary" size={28} />
              <div className="text-sm font-medium text-foreground">
                {fileName
                  ? (isZh ? `已选择：${fileName}` : `Selected: ${fileName}`)
                  : t("import.wizardDropHint")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("import.wizardFileTypes")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0] ?? null); }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("import.wizardOrPaste")}</label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder={t("import.pasteChapters")}
                className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-y font-mono"
              />
            </div>

            <input
              type="text"
              value={splitRegex}
              onChange={(e) => setSplitRegex(e.target.value)}
              placeholder={t("import.splitRegex")}
              className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm font-mono"
            />

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || !canPreviewSource({ text, fileName })}
                onClick={() => { void runPreview(); }}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {t("import.wizardPreview")}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === "preview" && preview && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {isZh
                  ? `识别到 ${preview.chapterCount} 章 · 约 ${preview.totalChars} 字`
                  : `${preview.chapterCount} chapters · ~${preview.totalChars} chars`}
              </div>
              <button
                type="button"
                onClick={() => setStep("source")}
                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                {t("import.wizardBack")}
              </button>
            </div>

            {preview.warning ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{preview.warning}</p>
            ) : null}

            <div className="max-h-80 overflow-auto rounded-lg border border-border divide-y divide-border">
              {preview.chapters.map((chapter) => (
                <div key={chapter.index} className="px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    {chapter.index}. {chapter.title}
                    <span className="ml-2 text-xs text-muted-foreground">{chapter.charCount} chars</span>
                  </div>
                  <p className="mt-1 text-muted-foreground line-clamp-2 font-mono text-xs whitespace-pre-wrap">
                    {chapter.preview}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("meta")}
                disabled={preview.chapterCount <= 0}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}
              >
                {t("import.wizardContinue")}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === "meta" && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => patchForm({ useExistingBook: false })}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  !form.useExistingBook ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {t("import.wizardCreateNew")}
              </button>
              <button
                type="button"
                onClick={() => patchForm({ useExistingBook: true })}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  form.useExistingBook ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {t("import.wizardUseExisting")}
              </button>
            </div>

            {form.useExistingBook ? (
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={form.existingBookId}
                  onChange={(e) => patchForm({ existingBookId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
                >
                  <option value="">{t("import.selectTarget")}</option>
                  {booksData?.books.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={form.resumeFrom}
                  onChange={(e) => patchForm({ resumeFrom: e.target.value })}
                  placeholder={t("import.wizardResumeFrom")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
                />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => patchForm({ title: e.target.value })}
                  placeholder={t("import.wizardBookTitle")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm md:col-span-2"
                />
                <select
                  value={form.genre}
                  onChange={(e) => patchForm({ genre: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
                >
                  <option value="other">{tr("其他", "Other")}</option>
                  {genres.map((g) => (
                    <option key={g.id} value={g.id}>{g.name ?? g.id}</option>
                  ))}
                  {!genres.some((g) => g.id === "xuanhuan") ? <option value="xuanhuan">{tr("玄幻", "Xuanhuan")}</option> : null}
                  {!genres.some((g) => g.id === "urban") ? <option value="urban">{tr("都市", "Urban")}</option> : null}
                  {!genres.some((g) => g.id === "xianxia") ? <option value="xianxia">{tr("仙侠", "Xianxia")}</option> : null}
                </select>
                <select
                  value={form.language}
                  onChange={(e) => patchForm({ language: e.target.value as "zh" | "en" })}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
                >
                  <option value="zh">{tr("中文", "Chinese")}</option>
                  <option value="en">English</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={form.targetChapters}
                  onChange={(e) => patchForm({ targetChapters: e.target.value })}
                  placeholder={t("import.wizardTargetChapters")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
                />
                <input
                  type="number"
                  min={100}
                  value={form.chapterWordCount}
                  onChange={(e) => patchForm({ chapterWordCount: e.target.value })}
                  placeholder={t("import.wizardChapterWords")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm"
                />
                <textarea
                  value={form.blurb}
                  onChange={(e) => patchForm({ blurb: e.target.value })}
                  rows={3}
                  placeholder={t("import.wizardBlurb")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border text-sm resize-none md:col-span-2"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("import.wizardMode")}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => patchForm({ importMode: "continuation" })}
                  className={`px-3 py-2 rounded-lg text-sm border text-left max-w-sm ${
                    form.importMode === "continuation" ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <div className="font-medium">{t("import.wizardModeContinuation")}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("import.wizardModeContinuationHint")}</div>
                </button>
                <button
                  type="button"
                  onClick={() => patchForm({ importMode: "series" })}
                  className={`px-3 py-2 rounded-lg text-sm border text-left max-w-sm ${
                    form.importMode === "series" ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <div className="font-medium">{t("import.wizardModeSeries")}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("import.wizardModeSeriesHint")}</div>
                </button>
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("preview")}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={14} />
                {t("import.wizardBack")}
              </button>
              <button
                type="button"
                disabled={busy || !canSubmitImport({ preview, form })}
                onClick={() => { void runImport(); }}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30`}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {t("import.wizardStart")}
              </button>
            </div>
          </>
        )}

        {step === "importing" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="mx-auto animate-spin text-primary" size={32} />
            <p className="text-sm text-muted-foreground">{t("import.wizardImportingHint")}</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={24} />
              <div>
                <h2 className="text-lg font-semibold">{t("import.wizardDoneTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isZh
                    ? `已导入 ${result.importedCount} 章到「${result.bookId}」${result.createdBook ? "（新建）" : ""}。下一章从第 ${result.nextChapter} 章开始。`
                    : `Imported ${result.importedCount} chapters into “${result.bookId}”${result.createdBook ? " (new book)" : ""}. Next chapter is ${result.nextChapter}.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => nav.toBook(result.bookId)}
                className={`px-4 py-2 text-sm rounded-lg ${c.btnPrimary}`}
              >
                {t("import.wizardOpenBook")}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Land on the book surface; write-next is available from book detail / chat.
                  nav.toBook(result.bookId);
                }}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary/40"
              >
                {t("import.wizardContinueWriting")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("source");
                  setPreview(null);
                  setResult(null);
                  setText("");
                  setFileName(null);
                  setError(null);
                  setForm(createEmptyImportWizardBookForm(lang));
                }}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary/40"
              >
                {t("import.wizardAgain")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

