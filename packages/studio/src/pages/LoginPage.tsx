import { useState, type FormEvent } from "react";
import { postApi } from "../hooks/use-api";

export function LoginPage({ onSuccess }: { readonly onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await postApi("/auth/login", { password });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8">
      <div className="mb-12 text-center">
        <div className="flex items-baseline justify-center gap-1.5 mb-4">
          <span className="font-serif text-6xl italic text-primary">Ink</span>
          <span className="text-5xl font-semibold tracking-tight text-foreground">OS</span>
        </div>
        <div className="text-base text-muted-foreground tracking-widest uppercase">Studio</div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-soft space-y-5"
      >
        <div>
          <h1 className="font-serif text-2xl text-foreground">访问验证 / Access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            请输入密码以继续使用 InkOS Studio。
            <br />
            Enter the password to continue.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">密码 / Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="••••••••"
          />
        </label>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !password.trim()}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "验证中… / Checking…" : "进入 / Enter"}
        </button>
      </form>

      <p className="mt-8 text-xs text-muted-foreground text-center max-w-sm">
        密码保存在项目根目录的 <code className="font-mono">pwd.txt</code>。
        <br />
        Password is read from project-root <code className="font-mono">pwd.txt</code>.
      </p>
    </div>
  );
}
