import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
export function ResetPasswordPage() { return <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"><h1 className="text-2xl font-bold">Reset password</h1><div className="mt-4 space-y-3"><FormInput type="password" placeholder="New password" /><FormInput type="password" placeholder="Confirm password" /><Button className="w-full">Reset password</Button></div></div>; }


