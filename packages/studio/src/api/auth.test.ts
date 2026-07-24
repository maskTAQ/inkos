import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveStudioAuthToken,
  isAuthenticatedStudioSession,
  isStudioAuthPublicPath,
  loadStudioPassword,
  safeEqualString,
  studioPasswordPath,
} from "./auth.js";

describe("studio auth helpers", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("resolves pwd.txt under the project root", () => {
    expect(studioPasswordPath("/tmp/project")).toBe(join("/tmp/project", "pwd.txt"));
  });

  it("loads a trimmed password and treats missing/empty as open access", async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-auth-"));
    expect(await loadStudioPassword(root)).toBeNull();

    await writeFile(join(root, "pwd.txt"), "  secret-pass  \n", "utf-8");
    expect(await loadStudioPassword(root)).toBe("secret-pass");

    await writeFile(join(root, "pwd.txt"), "   \n", "utf-8");
    expect(await loadStudioPassword(root)).toBeNull();
  });

  it("derives a stable token and rejects mismatched cookies", () => {
    const token = deriveStudioAuthToken("hunter2");
    expect(token).toHaveLength(64);
    expect(deriveStudioAuthToken("hunter2")).toBe(token);
    expect(deriveStudioAuthToken("other")).not.toBe(token);

    expect(isAuthenticatedStudioSession(token, "hunter2")).toBe(true);
    expect(isAuthenticatedStudioSession("deadbeef", "hunter2")).toBe(false);
    expect(isAuthenticatedStudioSession(undefined, "hunter2")).toBe(false);
    expect(isAuthenticatedStudioSession(undefined, null)).toBe(true);
  });

  it("compares secrets in constant time when lengths match", () => {
    expect(safeEqualString("abc", "abc")).toBe(true);
    expect(safeEqualString("abc", "abd")).toBe(false);
    expect(safeEqualString("ab", "abc")).toBe(false);
  });

  it("only treats auth status/login/logout as public API paths", () => {
    expect(isStudioAuthPublicPath("/api/v1/auth/status")).toBe(true);
    expect(isStudioAuthPublicPath("/api/v1/auth/login?x=1")).toBe(true);
    expect(isStudioAuthPublicPath("/api/v1/auth/logout")).toBe(true);
    expect(isStudioAuthPublicPath("/api/v1/project")).toBe(false);
    expect(isStudioAuthPublicPath("/api/v1/events")).toBe(false);
  });

  it("ignores nested directories when looking for pwd.txt", async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-auth-"));
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "nested", "pwd.txt"), "nope", "utf-8");
    expect(await loadStudioPassword(root)).toBeNull();
  });
});
