import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { register } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";

export function RegisterPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const session = await register(name, email, password, passwordConfirmation);
      setSession(session.token, session.user);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <h1 className="text-2xl font-bold">Create account</h1>
      <div className="mt-4 space-y-3">
        <FormInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required />
        <FormInput value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Work email" type="email" required />
        <FormInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" required />
        <FormInput value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} type="password" placeholder="Confirm password" required />
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
        <Button className="w-full" disabled={loading}>{loading ? "Creating..." : "Register"}</Button>
      </div>
    </form>
  );
}


