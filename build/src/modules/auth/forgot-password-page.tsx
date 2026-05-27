import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { forgotPassword } from "@/services/auth-service";
import { Toast } from "@/components/notifications/toast";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(normalizedEmail);
      setSuccess("If the email exists, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reset link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      {success && <Toast message={success} />}
      <h1 className="text-2xl font-bold">Forgot password</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">Enter your work email to receive a password reset link.</p>
      <div className="mt-4 space-y-3">
        <FormInput
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Work email"
          type="email"
          autoComplete="email"
          required
        />
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
        <Button className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </div>
      <Link to="/auth/login" className="mt-3 block text-sm text-[var(--primary)]">Back to login</Link>
    </form>
  );
}


