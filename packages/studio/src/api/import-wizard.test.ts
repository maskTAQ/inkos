import { describe, expect, it } from "vitest";
import {
  buildSplitPreview,
  mergeImportSources,
  normalizeImportChapters,
  normalizeImportMode,
  resolveResumeFrom,
} from "./import-wizard.js";

describe("import wizard helpers", () => {
  it("normalizes and drops empty chapter bodies", () => {
    expect(normalizeImportChapters([
      { title: "  A  ", content: " body " },
      { title: "", content: "   " },
      { title: "", content: "ok" },
    ])).toEqual([
      { title: "A", content: "body" },
      { title: "Untitled", content: "ok" },
    ]);
  });

  it("builds a preview with counts and warning when empty", () => {
    expect(buildSplitPreview([])).toMatchObject({
      chapterCount: 0,
      totalChars: 0,
      warning: expect.stringContaining("No chapters"),
    });
    expect(buildSplitPreview([
      { title: "开端", content: "甲".repeat(200) },
      { title: "中段", content: "乙" },
    ], { previewChars: 3 })).toEqual({
      chapterCount: 2,
      totalChars: 201,
      chapters: [
        { index: 1, title: "开端", charCount: 200, preview: "甲甲甲" },
        { index: 2, title: "中段", charCount: 1, preview: "乙" },
      ],
    });
  });

  it("prefers explicit chapters over text split, then falls back to whole text", () => {
    const splitChapters = (text: string) => {
      if (text.includes("第")) {
        return [
          { title: "一", content: "aaa" },
          { title: "二", content: "bbb" },
        ];
      }
      return [];
    };

    expect(mergeImportSources({
      chapters: [{ title: "X", content: "manual" }],
      text: "第一章\na",
      splitChapters,
    })).toEqual([{ title: "X", content: "manual" }]);

    expect(mergeImportSources({
      text: "第一章\na",
      splitChapters,
    })).toEqual([
      { title: "一", content: "aaa" },
      { title: "二", content: "bbb" },
    ]);

    expect(mergeImportSources({
      text: "no headings here",
      splitChapters,
    })).toEqual([{ title: "Chapter 1", content: "no headings here" }]);
  });

  it("requires resumeFrom when the book already has chapters", () => {
    expect(resolveResumeFrom({ existingChapterCount: 0 })).toBeUndefined();
    expect(resolveResumeFrom({ existingChapterCount: 0, resumeFrom: 3 })).toBe(3);
    expect(resolveResumeFrom({ existingChapterCount: 5, resumeFrom: 6 })).toBe(6);
    expect(() => resolveResumeFrom({ existingChapterCount: 5 })).toThrow(/resumeFrom/);
    expect(() => resolveResumeFrom({ existingChapterCount: 5, resumeFrom: 0 })).toThrow(/Invalid resumeFrom/);
  });

  it("normalizes import mode", () => {
    expect(normalizeImportMode("series")).toBe("series");
    expect(normalizeImportMode("continuation")).toBe("continuation");
    expect(normalizeImportMode(undefined)).toBe("continuation");
  });
});
