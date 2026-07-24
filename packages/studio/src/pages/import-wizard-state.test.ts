import { describe, expect, it } from "vitest";
import {
  buildImportRequestBody,
  canPreviewSource,
  canSubmitImport,
  createEmptyImportWizardBookForm,
  nextWizardStepAfterPreview,
} from "./import-wizard-state";

describe("import wizard state helpers", () => {
  it("allows preview only when text or file is present", () => {
    expect(canPreviewSource({ text: "", fileName: null })).toBe(false);
    expect(canPreviewSource({ text: "  a  ", fileName: null })).toBe(true);
    expect(canPreviewSource({ text: "", fileName: "a.txt" })).toBe(true);
  });

  it("requires chapter preview plus book identity before submit", () => {
    const form = createEmptyImportWizardBookForm("zh");
    expect(canSubmitImport({ preview: null, form })).toBe(false);
    expect(canSubmitImport({
      preview: { chapterCount: 2, totalChars: 10, chapters: [] },
      form,
    })).toBe(false);
    expect(canSubmitImport({
      preview: { chapterCount: 2, totalChars: 10, chapters: [] },
      form: { ...form, title: "旧书", genre: "xuanhuan" },
    })).toBe(true);
    expect(canSubmitImport({
      preview: { chapterCount: 2, totalChars: 10, chapters: [] },
      form: { ...form, useExistingBook: true, existingBookId: "old-book" },
    })).toBe(true);
  });

  it("builds create-book and resume payloads", () => {
    const form = {
      ...createEmptyImportWizardBookForm("zh"),
      title: "续写旧稿",
      genre: "xuanhuan",
      platform: "qidian",
      targetChapters: "120",
      chapterWordCount: "2800",
      blurb: "已有前二十章",
    };
    expect(buildImportRequestBody({
      text: "第一章\n正文",
      splitRegex: "",
      form,
    })).toEqual({
      text: "第一章\n正文",
      importMode: "continuation",
      createBook: {
        title: "续写旧稿",
        genre: "xuanhuan",
        language: "zh",
        platform: "qidian",
        targetChapters: 120,
        chapterWordCount: 2800,
        blurb: "已有前二十章",
      },
    });

    expect(buildImportRequestBody({
      text: "body",
      splitRegex: "第.+章",
      form: {
        ...form,
        useExistingBook: true,
        existingBookId: "old-book",
        resumeFrom: "21",
        importMode: "series",
      },
    })).toEqual({
      text: "body",
      importMode: "series",
      splitRegex: "第.+章",
      bookId: "old-book",
      resumeFrom: 21,
    });
  });

  it("moves to meta only after a non-empty preview", () => {
    expect(nextWizardStepAfterPreview(null)).toBe("source");
    expect(nextWizardStepAfterPreview({ chapterCount: 0, totalChars: 0, chapters: [] })).toBe("source");
    expect(nextWizardStepAfterPreview({ chapterCount: 3, totalChars: 9, chapters: [] })).toBe("meta");
  });
});
