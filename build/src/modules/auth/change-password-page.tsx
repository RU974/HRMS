import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { changePassword } from "@/services/auth-service";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "@/components/notifications/toast";

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, setUser, logout } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  if (user && !user.must_change_password) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError("Password must be at least 8 characters and include upper case, lower case and a number.");
      return;
    }
    if (password !== confirmation) {
      setError("Password confirmation does not match.");
      return;
    }

    setLoading(true);
    try {
      await changePassword({ current_password: currentPassword, password, password_confirmation: confirmation });
      if (user) setUser({ ...user, must_change_password: false });
      toast.success("Password updated", "Your new password is set.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change password");
    } finally {
      setLoading(false);
    }
  }

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[var(--muted)] hover:text-[var(--text)]"
      aria-label={show ? "Hide passwords" : "Show passwords"}
    >
      {show ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[400px] rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-8">
      <div className="mb-5 flex flex-col items-center text-center">
        <ShieldCheck className="mb-2 h-8 w-8 text-emerald-500" />
        <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--text)]">Set your password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Welcome{user?.name ? `, ${user.name}` : ""}. Since this is your first sign-in, choose a new password before continuing.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <FormInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Current (temporary) password"
            autoComplete="current-password"
            className="pr-11"
            required
          />
          {toggle}
        </div>
        <FormInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type={show ? "text" : "password"}
          placeholder="New password"
          autoComplete="new-password"
          required
        />
        <FormInput
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          type={show ? "text" : "password"}
          placeholder="Confirm new password"
          autoComplete="new-password"
          required
        />
      </div>

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

      <Button className="mt-4 h-[46px] w-full rounded-xl" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password & continue"}
      </Button>
      <button
        type="button"
        onClick={() => { logout(); navigate("/auth/login", { replace: true }); }}
        className="mt-3 w-full text-center text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        Sign out
      </button>
    </form>
  );
}
