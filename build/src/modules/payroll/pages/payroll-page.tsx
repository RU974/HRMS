import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/page-header/page-header";
import { useCurrencyStore } from "@/store/currency-store";
import { BonusesTab } from "./bonuses-tab";
import { CommissionsTab } from "./commissions-tab";
import { DeductionsTab } from "./deductions-tab";
import { LoansTab } from "./loans-tab";
import { PayrollProcessingTab } from "./payroll-processing-tab";
import { PayrollRecordsTab } from "./payroll-records-tab";
import { PayslipsTab } from "./payslips-tab";
import { SalaryGradesTab } from "./salary-grades-tab";
import { SalaryIncrementsTab } from "./salary-increments-tab";
import { SalarySlipTab } from "./salary-slip-tab";
import { TaxBracketsTab } from "./tax-brackets-tab";

type Tab = "payroll-records" | "salary-slip" | "payroll-processing" | "payslips" | "bonuses" | "commissions" | "deductions" | "tax-brackets" | "salary-grades" | "salary-increments" | "loans" | "advances";

const TAB_PARAM_MAP: Record<string, Tab> = {
  "payroll-records":    "payroll-records",
  "salary-structure":   "payroll-records",
  "salary-slip":        "salary-slip",
  "payroll-processing": "payroll-processing",
  payslips:             "payslips",
  bonuses:              "bonuses",
  commissions:          "commissions",
  deductions:           "deductions",
  "tax-brackets":       "tax-brackets",
  "salary-grades":      "salary-grades",
  "salary-increments":  "salary-increments",
  loans:                "loans",
  advances:             "advances",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "payroll-records",    label: "Payroll Records" },
  { key: "salary-slip",        label: "Salary Slip" },
  { key: "payroll-processing", label: "Processing" },
  { key: "payslips",           label: "Payslips" },
  { key: "bonuses",            label: "Bonuses" },
  { key: "commissions",        label: "Commissions" },
  { key: "deductions",         label: "Deductions" },
  { key: "salary-increments",  label: "Increment History" },
  { key: "loans",              label: "Loans" },
  { key: "advances",           label: "Advances" },
  { key: "tax-brackets",       label: "Tax Brackets" },
  { key: "salary-grades",      label: "Salary Grades" },
];

export function PayrollPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Subscribe so the page re-renders on currency change (tab components use fmt())
  useCurrencyStore(s => s.currency);

  const initialTab = TAB_PARAM_MAP[searchParams.get("tab") ?? ""] ?? "payroll-records";
  const [tab, setTab] = useState<Tab>(initialTab);

  const switchTab = (t: Tab) => { setTab(t); setSearchParams({ tab: t }); };

  useEffect(() => {
    const requested = TAB_PARAM_MAP[searchParams.get("tab") ?? ""];
    if (requested && requested !== tab) setTab(requested);
  }, [searchParams, tab]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" subtitle="Salary records, payslips, deductions, loans, and pay structure." />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${t.key === tab ? "bg-[var(--primary)] text-white" : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "payroll-records"    && <PayrollRecordsTab />}
        {tab === "salary-slip"        && <SalarySlipTab />}
        {tab === "payroll-processing" && <PayrollProcessingTab />}
        {tab === "payslips"           && <PayslipsTab />}
        {tab === "bonuses"            && <BonusesTab />}
        {tab === "commissions"        && <CommissionsTab />}
        {tab === "deductions"         && <DeductionsTab />}
        {tab === "salary-increments"  && <SalaryIncrementsTab />}
        {tab === "loans"              && <LoansTab type="loan" />}
        {tab === "advances"           && <LoansTab type="advance" />}
        {tab === "tax-brackets"       && <TaxBracketsTab />}
        {tab === "salary-grades"      && <SalaryGradesTab />}
      </section>
    </div>
  );
}
