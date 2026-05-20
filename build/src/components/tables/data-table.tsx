import { ChevronDown, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";

const rows = [
  { id: "EMP-1023", name: "Ayesha Noor", dept: "Engineering", status: "Active" },
  { id: "EMP-1024", name: "Bilal Raza", dept: "Finance", status: "On Leave" },
  { id: "EMP-1025", name: "Hira Khan", dept: "HR", status: "Active" }
];

export function DataTable() {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-3">
        <FormInput placeholder="Search employees..." className="max-w-sm" />
        <Button variant="outline">Filter <ChevronDown className="ml-2 h-4 w-4" /></Button>
        <Button variant="ghost" className="ml-auto"><Download className="mr-2 h-4 w-4" />Export</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="p-3">ID</th><th className="p-3">Name</th><th className="p-3">Department</th><th className="p-3">Status</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--border)]/20"><td className="p-3">{r.id}</td><td className="p-3">{r.name}</td><td className="p-3">{r.dept}</td><td className="p-3">{r.status}</td></tr>)}</tbody>
        </table>
      </div>
    </Card>
  );
}


