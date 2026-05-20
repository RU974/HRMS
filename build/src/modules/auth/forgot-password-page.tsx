import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
export function ForgotPasswordPage() { return <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"><h1 className="text-2xl font-bold">Forgot password</h1><div className="mt-4 space-y-3"><FormInput placeholder="Work email" /><Button className="w-full">Send link</Button></div></div>; }


