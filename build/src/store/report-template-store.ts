import { create } from "zustand";
import type { PdfTemplate } from "@/services/report-service";

export const REPORT_TEMPLATE_OPTIONS: { value: PdfTemplate; label: string; desc: string }[] = [
  { value: "classic", label: "Classic", desc: "Traditional layout with standard header" },
  { value: "corporate", label: "Corporate", desc: "Branded header with company details" },
  { value: "compact", label: "Compact", desc: "Condensed layout for dense tables" },
];

const STORAGE_KEY = "hrms-report-template";

function getInitialTemplate(): PdfTemplate {
  const stored = localStorage.getItem(STORAGE_KEY);
  return REPORT_TEMPLATE_OPTIONS.some((o) => o.value === stored)
    ? (stored as PdfTemplate)
    : "classic";
}

interface ReportTemplateState {
  reportTemplate: PdfTemplate;
  setReportTemplate: (template: PdfTemplate) => void;
}

export const useReportTemplateStore = create<ReportTemplateState>((set) => ({
  reportTemplate: getInitialTemplate(),

  setReportTemplate: (template) => {
    localStorage.setItem(STORAGE_KEY, template);
    set({ reportTemplate: template });
  },
}));
