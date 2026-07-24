export type ImportWizardStep = "source" | "preview" | "meta" | "importing" | "done";

export type ImportWizardMode = "continuation" | "series";

export interface ImportWizardChapterPreview {
  readonly index: number;
  readonly title: string;
  readonly charCount: number;
  readonly preview: string;
}

export interface ImportWizardPreviewPayload {
  readonly chapterCount: number;
  readonly totalChars: number;
  readonly chapters: ReadonlyArray<ImportWizardChapterPreview>;
  readonly warning?: string;
}

export interface ImportWizardResult {
  readonly bookId: string;
  readonly importedCount: number;
  readonly nextChapter: number;
  readonly createdBook: boolean;
  readonly importMode: ImportWizardMode;
  readonly chapterCount: number;
}

export interface ImportWizardBookForm {
  readonly title: string;
  readonly genre: string;
  readonly language: "zh" | "en";
  readonly platform: string;
  readonly targetChapters: string;
  readonly chapterWordCount: string;
  readonly blurb: string;
  readonly existingBookId: string;
  readonly useExistingBook: boolean;
  readonly importMode: ImportWizardMode;
  readonly resumeFrom: string;
}

export function createEmptyImportWizardBookForm(language: "zh" | "en" = "zh"): ImportWizardBookForm {
  return {
    title: "",
    genre: "other",
    language,
    platform: "other",
    targetChapters: "200",
    chapterWordCount: language === "en" ? "2000" : "3000",
    blurb: "",
    existingBookId: "",
    useExistingBook: false,
    importMode: "continuation",
    resumeFrom: "",
  };
}

export function canPreviewSource(input: {
  readonly text: string;
  readonly fileName: string | null;
}): boolean {
  return input.text.trim().length > 0 || Boolean(input.fileName);
}

export function canSubmitImport(input: {
  readonly preview: ImportWizardPreviewPayload | null;
  readonly form: ImportWizardBookForm;
}): boolean {
  if (!input.preview || input.preview.chapterCount <= 0) return false;
  if (input.form.useExistingBook) {
    return Boolean(input.form.existingBookId.trim());
  }
  return Boolean(input.form.title.trim()) && Boolean(input.form.genre.trim());
}

export function buildImportRequestBody(input: {
  readonly text: string;
  readonly splitRegex: string;
  readonly form: ImportWizardBookForm;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: input.text,
    importMode: input.form.importMode,
  };
  if (input.splitRegex.trim()) {
    body.splitRegex = input.splitRegex.trim();
  }
  if (input.form.useExistingBook) {
    body.bookId = input.form.existingBookId.trim();
    const resume = Number.parseInt(input.form.resumeFrom, 10);
    if (Number.isInteger(resume) && resume > 0) {
      body.resumeFrom = resume;
    }
  } else {
    const targetChapters = Number.parseInt(input.form.targetChapters, 10);
    const chapterWordCount = Number.parseInt(input.form.chapterWordCount, 10);
    body.createBook = {
      title: input.form.title.trim(),
      genre: input.form.genre.trim(),
      language: input.form.language,
      platform: input.form.platform || "other",
      ...(Number.isFinite(targetChapters) && targetChapters > 0 ? { targetChapters } : {}),
      ...(Number.isFinite(chapterWordCount) && chapterWordCount > 0 ? { chapterWordCount } : {}),
      ...(input.form.blurb.trim() ? { blurb: input.form.blurb.trim() } : {}),
    };
  }
  return body;
}

export async function readTextFileAsUtf8(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (!(
    lower.endsWith(".txt")
    || lower.endsWith(".md")
    || lower.endsWith(".markdown")
    || file.type.startsWith("text/")
    || file.type === ""
  )) {
    throw new Error("Only .txt / .md text files are supported in the wizard.");
  }
  return file.text();
}

export function nextWizardStepAfterPreview(
  preview: ImportWizardPreviewPayload | null,
): ImportWizardStep {
  if (!preview || preview.chapterCount <= 0) return "source";
  return "meta";
}
