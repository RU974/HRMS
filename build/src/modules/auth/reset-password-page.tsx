import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { resetPassword } from "@/services/auth-service";
import { toast } from "@/components/notifications/toast";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const presetEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams]);

  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing or invalid.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Password confirmation does not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        token,
        email: email.trim().toLowerCase(),
        password,
        passwordConfirmation
      });
      toast.success("Password reset", "Password reset successfully. You can now sign in.");
      setPassword("");
      setPasswordConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h1 className="text-2xl font-bold">Reset password</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">Enter your account email and a new password to finish reset.</p>
      <div className="mt-4 space-y-3">
        <FormInput
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="Work email"
          autoComplete="email"
          required
        />
        <FormInput
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          required
        />
        <FormInput
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          required
        />
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
        <Button className="w-full" disabled={loading}>
          {loading ? "Resetting..." : "Reset password"}
        </Button>
      </div>
      <Link to="/auth/login" className="mt-3 block text-sm text-[var(--primary)]">Back to login</Link>
    </form>
  );
}