import { SortableTh, useTableSort } from "@/components/tables/use-table-sort";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { EmployeeDeviceMapping } from "@/services/biometric-device-service";

const inputClass = "h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

export interface EmployeeMappingRow {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  device_user_id: string;
  card_number: string;
  mapping_id?: number;
}

export interface EmployeeMappingTableProps {
  rows: EmployeeMappingRow[];
  onChange: (employeeId: number, field: "device_user_id" | "card_number", value: string) => void;
  onSave: (row: EmployeeMappingRow) => void;
  onDelete?: (mappingId: number) => void;
  savingEmployeeId?: number | null;
}

export function EmployeeMappingTable({ rows: mappingRows, onChange, onSave, onDelete, savingEmployeeId }: EmployeeMappingTableProps) {
  const { sorted: rows, sort, toggle: toggleSort } = useTableSort(mappingRows, "employee_name");
  return (
    <div className="overflow-x-auto">
      <table className="rtable w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
            <SortableTh label="Employee" sortKey="employee_name" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
            <SortableTh label="Employee Code" sortKey="employee_code" sort={sort} onSort={toggleSort} className="py-2 pr-4" />
            <th className="py-2 pr-4">Device User ID</th>
            <th className="py-2 pr-4">Card Number</th>
            <th className="py-2 pr-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employee_id} className="border-b border-[var(--border)] last:border-0">
              <td className="py-2 pr-4 font-medium" data-label="Employee">{row.employee_name}</td>
              <td className="py-2 pr-4 text-[var(--muted)]" data-label="Employee Code">{row.employee_code}</td>
              <td className="py-2 pr-4" data-label="Device User ID">
                <FormInput
                  className={inputClass}
                  value={row.device_user_id}
                  onChange={(e) => onChange(row.employee_id, "device_user_id", e.target.value)}
                  placeholder="e.g. 1042"
                />
              </td>
              <td className="py-2 pr-4" data-label="Card Number">
                <FormInput
                  className={inputClass}
                  value={row.card_number}
                  onChange={(e) => onChange(row.employee_id, "card_number", e.target.value)}
                  placeholder="Optional"
                />
              </td>
              <td className="py-2 pr-4 text-right" data-label="Actions">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onSave(row)}
                    disabled={savingEmployeeId === row.employee_id || !row.device_user_id}
                  >
                    {savingEmployeeId === row.employee_id ? "Saving..." : "Save"}
                  </Button>
                  {row.mapping_id && onDelete && (
                    <Button variant="ghost" onClick={() => onDelete(row.mapping_id!)}>Remove</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
