import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { useAuthStore, getCurrentPermissionKeys } from "@/store/auth-store";
import { getUserRoleKeys, isSuperAdminRole } from "@/config/rbac";
import { me, changePassword, updateProfile } from "@/services/auth-service";
import { toast } from "@/components/notifications/toast";
import { MyPayslipsTab } from "./my-payslips-tab";

const inputClass =
  "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30";

type ActiveTab = "profile" | "password" | "payslips" | "permissions";

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white/70 p-3 dark:bg-white/5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text)]">{value || "—"}</p>
    </div>
  );
}

function Alert({ type, message }: { type: "success" | "error"; message: string }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message}
    </div>
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, setUser, hasPermission } = useAuthStore();
  const roles = getUserRoleKeys(user);
  const permissions = getCurrentPermissionKeys();
  const showRestrictedCommunicationLinks = isSuperAdminRole(user);
  const canViewOwnPayslips =
    hasPermission("payroll:view_own") || hasPermission("payroll:view") || hasPermission("payroll:manage_settings");

  const [tab, setTab] = useState<ActiveTab>("profile");
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user?.employee ? null : null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? "",
    phone: "",
    address: "",
    date_of_birth: "",
    gender: "",
  });

  const [pwForm, setPwForm] = useState({
    current_password: "",
    password: "",
    password_confirmation: "",
  });

  // Fetch fresh user data from /auth/me on mount
  const { data: meData } = useQuery({
    queryKey: ["auth-me"],
    queryFn: me,
  });

  useEffect(() => {
    if (meData) {
      setUser(meData.user, meData.license);
      setProfileForm((prev) => ({
        ...prev,
        name: meData.user.name ?? prev.name,
      }));
    }
  }, [meData]);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (profileForm.name.trim()) fd.append("name", profileForm.name.trim());
      if (profileForm.phone) fd.append("phone", profileForm.phone);
      if (profileForm.address) fd.append("address", profileForm.address);
      if (profileForm.date_of_birth) fd.append("date_of_birth", profileForm.date_of_birth);
      if (profileForm.gender) fd.append("gender", profileForm.gender);
      if (photoFile) fd.append("profile_image", photoFile);
      return updateProfile(fd);
    },
    onSuccess: async (fresh) => {
      setUser(fresh);
      await queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      toast.success("Profile saved", "Your profile has been updated successfully.");
      setProfileMsg({ type: "success", text: "Profile updated successfully." });
      setTimeout(() => setProfileMsg(null), 3500);
    },
    onError: (e: Error) => { toast.error("Save failed", e.message); setProfileMsg({ type: "error", text: e.message }); },
  });

  const pwMutation = useMutation({
    mutationFn: () => changePassword(pwForm),
    onSuccess: () => {
      setPwForm({ current_password: "", password: "", password_confirmation: "" });
      toast.success("Password changed", "Your password has been updated successfully.");
      setPwMsg({ type: "success", text: "Password changed successfully." });
      setTimeout(() => setPwMsg(null), 3500);
    },
    onError: (e: Error) => { toast.error("Password change failed", e.message); setPwMsg({ type: "error", text: e.message }); },
  });

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) setPreviewUrl(URL.createObjectURL(file));
  }

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const avatarUrl = previewUrl ?? user?.profile_image ?? user?.employee?.profile_image ?? null;

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "profile", label: "Edit Profile" },
    { key: "password", label: "Change Password" },
    ...(canViewOwnPayslips ? [{ key: "payslips" as const, label: "My Payslips" }] : []),
    { key: "permissions", label: "Roles & Permissions" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" subtitle="Manage your account details, password, and view your permissions." />

      {/* Avatar + overview strip */}
      <Card className="flex flex-wrap items-center gap-5">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user?.name}
              className="h-20 w-20 rounded-full object-cover ring-4 ring-[var(--border)]"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--primary)]/10 text-2xl font-bold text-[var(--primary)] ring-4 ring-[var(--border)]">
              {initials}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-xs shadow hover:bg-[var(--border)]/40"
            title="Change photo"
          >
            ✎
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold">{user?.name}</p>
          <p className="text-sm text-[var(--muted)]">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-[var(--primary)]/10 px-3 py-0.5 text-xs font-semibold text-[var(--primary)]"
              >
                {role.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <InfoBox label="Employee #" value={user?.employee?.employee_number ?? "—"} />
          <InfoBox label="Department" value={user?.employee?.department?.name ?? "—"} />
          <InfoBox label="Designation" value={user?.employee?.designation?.name ?? "—"} />
          <InfoBox label="Status" value={user?.employee?.status ?? "—"} />
        </div>
      </Card>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.key
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Edit Profile */}
      {tab === "profile" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Personal Information</h3>
          {profileMsg && <div className="mb-4"><Alert type={profileMsg.type} message={profileMsg.text} /></div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setProfileMsg(null);
              profileMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full name">
                <FormInput
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Your full name"
                />
              </FormField>

              <FormField label="Phone number">
                <FormInput
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+92 300 0000000"
                />
              </FormField>

              <FormField label="Date of birth">
                <FormInput
                  type="date"
                  value={profileForm.date_of_birth}
                  onChange={(e) => setProfileForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                />
              </FormField>

              <FormField label="Gender">
                <select
                  className={inputClass}
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </FormField>
            </div>

            <FormField label="Home address">
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                value={profileForm.address}
                onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Street address, city, province..."
              />
            </FormField>

            {photoFile && (
              <p className="text-xs text-[var(--muted)]">
                New photo selected: <span className="font-medium">{photoFile.name}</span>
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setProfileForm({ name: user?.name ?? "", phone: "", address: "", date_of_birth: "", gender: "" });
                  setPhotoFile(null);
                  setPreviewUrl(null);
                }}
              >
                Reset
              </Button>
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab: Change Password */}
      {tab === "password" && (
        <Card>
          <h3 className="mb-4 text-base font-semibold">Change Password</h3>
          <p className="mb-5 text-sm text-[var(--muted)]">
            Choose a strong password of at least 8 characters. You will remain logged in after changing it.
          </p>
          {pwMsg && <div className="mb-4"><Alert type={pwMsg.type} message={pwMsg.text} /></div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPwMsg(null);
              if (pwForm.password !== pwForm.password_confirmation) {
                setPwMsg({ type: "error", text: "Passwords do not match." });
                return;
              }
              if (pwForm.password.length < 8) {
                setPwMsg({ type: "error", text: "Password must be at least 8 characters." });
                return;
              }
              pwMutation.mutate();
            }}
            className="max-w-md space-y-4"
          >
            <FormField label="Current password">
              <FormInput
                type="password"
                value={pwForm.current_password}
                onChange={(e) => setPwForm((p) => ({ ...p, current_password: e.target.value }))}
                placeholder="Enter current password"
                required
              />
            </FormField>

            <FormField label="New password">
              <FormInput
                type="password"
                value={pwForm.password}
                onChange={(e) => setPwForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Min 8 characters"
                required
              />
            </FormField>

            <FormField label="Confirm new password">
              <FormInput
                type="password"
                value={pwForm.password_confirmation}
                onChange={(e) => setPwForm((p) => ({ ...p, password_confirmation: e.target.value }))}
                placeholder="Repeat new password"
                required
              />
            </FormField>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwForm({ current_password: "", password: "", password_confirmation: "" })}
              >
                Clear
              </Button>
              <Button type="submit" disabled={pwMutation.isPending}>
                {pwMutation.isPending ? "Updating..." : "Update password"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab: My Payslips */}
      {tab === "payslips" && canViewOwnPayslips && <MyPayslipsTab />}

      {/* Tab: Roles & Permissions */}
      {tab === "permissions" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-base font-semibold">Assigned Roles</h3>
            {roles.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No roles assigned to your account.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-[var(--primary)]/10 px-4 py-1.5 text-xs font-semibold text-[var(--primary)]"
                  >
                    {role.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-4 text-base font-semibold">Quick links</h3>
            <div className="space-y-2">
              <Link
                to="/dashboard"
                className="block rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--border)]/35 transition"
              >
                ← Back to dashboard
              </Link>
              <Link
                to="/leaves"
                className="block rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--border)]/35 transition"
              >
                My leave requests
              </Link>
              <Link
                to="/attendance"
                className="block rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--border)]/35 transition"
              >
                My attendance
              </Link>
              {showRestrictedCommunicationLinks && (
                <Link
                  to="/notifications"
                  className="block rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--border)]/35 transition"
                >
                  Notifications
                </Link>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h3 className="mb-4 text-base font-semibold">
              Permissions
              <span className="ml-2 rounded-full bg-[var(--border)] px-2 py-0.5 text-xs font-normal text-[var(--muted)]">
                {permissions.length}
              </span>
            </h3>
            {permissions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No direct permissions detected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {permissions.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--text)]"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}