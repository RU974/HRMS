import { create } from "zustand";

export type PayslipPdfTemplate = "classic" | "corporate" | "compact";

export const PAYSLIP_TEMPLATE_OPTIONS: { value: PayslipPdfTemplate; label: string; desc: string }[] = [
  { value: "classic", label: "Classic", desc: "Traditional layout with standard header" },
  { value: "corporate", label: "Corporate", desc: "Branded header with company details" },
  { value: "compact", label: "Compact", desc: "Condensed single-page layout" },
];

const STORAGE_KEY = "hrms-payslip-template";

function getInitialTemplate(): PayslipPdfTemplate {
  const stored = localStorage.getItem(STORAGE_KEY);
  return PAYSLIP_TEMPLATE_OPTIONS.some((o) => o.value === stored)
    ? (stored as PayslipPdfTemplate)
    : "classic";
}

interface PayslipTemplateState {
  payslipTemplate: PayslipPdfTemplate;
  setPayslipTemplate: (template: PayslipPdfTemplate) => void;
}

export const usePayslipTemplateStore = create<PayslipTemplateState>((set) => ({
  payslipTemplate: getInitialTemplate(),

  setPayslipTemplate: (template) => {
    localStorage.setItem(STORAGE_KEY, template);
    set({ payslipTemplate: template });
  },
}));
