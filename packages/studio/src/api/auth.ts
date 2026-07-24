import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Cookie that marks an authenticated Studio browser session. */
export const STUDIO_AUTH_COOKIE = "inkos_studio_auth";

/** Auth endpoints that remain reachable without a valid session. */
export const STUDIO_AUTH_PUBLIC_PATHS = new Set([
  "/api/v1/auth/status",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
]);

/**
 * Password file lives at the project root (INKOS_PROJECT_ROOT), next to inkos.json.
 * If the file is missing or empty, Studio stays open (tests + local defaults).
 */
export function studioPasswordPath(root: string): string {
  return join(root, "pwd.txt");
}

export async function loadStudioPassword(root: string): Promise<string | null> {
  try {
    const raw = await readFile(studioPasswordPath(root), "utf-8");
    // Strip optional UTF-8 BOM and surrounding whitespace.
    const password = raw.replace(/^﻿/, "").trim();
    return password.length > 0 ? password : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Stable token derived from the current password — changes when pwd.txt changes. */
export function deriveStudioAuthToken(password: string): string {
  return createHash("sha256")
    .update("inkos-studio-auth\0")
    .update(password)
    .digest("hex");
}

export function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isStudioAuthPublicPath(path: string): boolean {
  // strip query string
  const pathname = path.split("?")[0] ?? path;
  return STUDIO_AUTH_PUBLIC_PATHS.has(pathname);
}

export function isAuthenticatedStudioSession(
  cookieToken: string | undefined,
  password: string | null,
): boolean {
  if (!password) return true;
  if (!cookieToken) return false;
  return safeEqualString(cookieToken, deriveStudioAuthToken(password));
}
