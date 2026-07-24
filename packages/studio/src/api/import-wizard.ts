import type { SplitChapter } from "@actalk/inkos-core";

export type ImportMode = "continuation" | "series";

export interface ImportChapterDraft {
  readonly title: string;
  readonly content: string;
}

export interface ImportWizardBookMeta {
  readonly title: string;
  readonly genre: string;
  readonly language: "zh" | "en";
  readonly platform?: string;
  readonly targetChapters?: number;
  readonly chapterWordCount?: number;
  readonly blurb?: string;
}

export interface SplitPreviewResult {
  readonly chapterCount: number;
  readonly totalChars: number;
  readonly chapters: ReadonlyArray<{
    readonly index: number;
    readonly title: string;
    readonly charCount: number;
    readonly preview: string;
  }>;
  readonly warning?: string;
}

export function normalizeImportChapters(
  chapters: ReadonlyArray<ImportChapterDraft> | undefined,
): ImportChapterDraft[] {
  if (!chapters?.length) return [];
  return chapters
    .map((chapter) => ({
      title: String(chapter.title ?? "").trim() || "Untitled",
      content: String(chapter.content ?? "").trim(),
    }))
    .filter((chapter) => chapter.content.length > 0);
}

export function buildSplitPreview(
  chapters: ReadonlyArray<SplitChapter>,
  options?: { readonly previewChars?: number },
): SplitPreviewResult {
  const previewChars = options?.previewChars ?? 160;
  const mapped = chapters.map((chapter, index) => {
    const content = chapter.content.trim();
    return {
      index: index + 1,
      title: chapter.title?.trim() || `Chapter ${index + 1}`,
      charCount: content.length,
      preview: content.slice(0, previewChars),
    };
  });
  const totalChars = mapped.reduce((sum, chapter) => sum + chapter.charCount, 0);
  return {
    chapterCount: mapped.length,
    totalChars,
    chapters: mapped,
    ...(mapped.length === 0
      ? {
          warning:
            "No chapters detected. Check the split regex or paste text that uses 第X章 / Chapter N headings.",
        }
      : {}),
  };
}

export function mergeImportSources(input: {
  readonly text?: string;
  readonly splitRegex?: string;
  readonly chapters?: ReadonlyArray<ImportChapterDraft>;
  readonly splitChapters: (text: string, pattern?: string) => ReadonlyArray<SplitChapter>;
}): ImportChapterDraft[] {
  const explicit = normalizeImportChapters(input.chapters);
  if (explicit.length > 0) return explicit;

  const text = input.text?.trim() ?? "";
  if (!text) return [];

  const split = input.splitChapters(text, input.splitRegex);
  if (split.length > 0) {
    return normalizeImportChapters(split);
  }

  // Fallback: treat whole paste as one chapter so the wizard can still proceed.
  return [{ title: "Chapter 1", content: text }];
}

export function resolveResumeFrom(input: {
  readonly existingChapterCount: number;
  readonly resumeFrom?: number;
}): number | undefined {
  if (input.existingChapterCount <= 0) {
    return input.resumeFrom && input.resumeFrom > 1 ? input.resumeFrom : undefined;
  }
  if (input.resumeFrom === undefined) {
    throw new Error(
      `Book already has ${input.existingChapterCount} chapter(s). Pass resumeFrom to append, or clear existing chapters first.`,
    );
  }
  if (!Number.isInteger(input.resumeFrom) || input.resumeFrom < 1) {
    throw new Error(`Invalid resumeFrom: ${input.resumeFrom}`);
  }
  return input.resumeFrom;
}

export function normalizeImportMode(value: unknown): ImportMode {
  return value === "series" ? "series" : "continuation";
}
