import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { getEmployeesPage, type Employee } from "@/services/employee-service";
import {
  createEmployeeDocument,
  deleteEmployeeDocument,
  downloadEmployeeDocument,
  listEmployeeDocuments,
  previewEmployeeDocument,
  updateEmployeeDocument,
  type EmployeeDocumentItem,
} from "@/services/hr-management-service";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "@/components/notifications/toast";

const documentCategories = ["CNIC", "Contract", "Certificate", "ID", "Other"] as const;
const visibilityOptions = [
  { value: "hr_only", label: "HR only" },
  { value: "manager_only", label: "Managers" },
  { value: "employee_self", label: "Employee" },
] as const;

type DocumentCategory = (typeof documentCategories)[number];
type VisibilityOption = (typeof visibilityOptions)[number]["value"];

type DocumentForm = {
  employee_id: number;
  title: string;
  type: DocumentCategory | "";
  visibility: VisibilityOption;
  expiry_date: string;
  notes: string;
  file: File | null;
};

function groupDocumentsByEmployee(documents: EmployeeDocumentItem[]) {
  const grouped = new Map<number, { employeeName: string; items: EmployeeDocumentItem[] }>();

  for (const document of documents) {
    const employeeId = document.employee?.id ?? document.employee_id;
    const employeeName = document.employee?.name ?? `Employee #${document.employee_id}`;
    const existing = grouped.get(employeeId);
    if (existing) {
      existing.items.push(document);
    } else {
      grouped.set(employeeId, { employeeName, items: [document] });
    }
  }

  return Array.from(grouped.values());
}

export function EmployeeDocumentsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const canManageDocuments = useAuthStore((state) => state.hasPermission("documents:edit"));
  const canViewEmployees = useAuthStore((state) => state.hasPermission("employees:view"));

  const currentEmployeeId = user?.employee?.id ?? 0;
  const [error, setError] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<EmployeeDocumentItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState<number>(0);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("");
  const [form, setForm] = useState<DocumentForm>({
    employee_id: currentEmployeeId,
    title: "",
    type: "",
    visibility: "hr_only",
    expiry_date: "",
    notes: "",
    file: null,
  });

  const showEmployeeFilter = canManageDocuments || canViewEmployees;

  const queryFilters = useMemo(
    () => ({
      employee_id: showEmployeeFilter ? (employeeFilter || undefined) : currentEmployeeId || undefined,
    }),
    [employeeFilter, currentEmployeeId, showEmployeeFilter],
  );

  const documentsQuery = useQuery({
    queryKey: ["hr", "employee-documents", queryFilters],
    queryFn: () => listEmployeeDocuments(queryFilters),
  });

  const employeesQuery = useQuery({
    queryKey: ["hr", "employee-documents-employees"],
    queryFn: async () => (await getEmployeesPage({ per_page: 50 })).data ?? [],
    enabled: showEmployeeFilter,
  });

  const filteredDocuments = useMemo(
    () => (documentsQuery.data?.data ?? []).filter((document) => {
      if (typeFilter && document.type !== typeFilter) {
        return false;
      }
      if (visibilityFilter && document.visibility !== visibilityFilter) {
        return false;
      }
      return true;
    }),
    [documentsQuery.data?.data, typeFilter, visibilityFilter],
  );

  const groupedDocuments = useMemo(() => groupDocumentsByEmployee(filteredDocuments), [filteredDocuments]);

  const openModal = (document?: EmployeeDocumentItem) => {
    const payload: DocumentForm = document
      ? {
          employee_id: document.employee_id,
          title: document.title,
          type: (document.type && documentCategories.includes(document.type as DocumentCategory) ? document.type : "") as DocumentCategory | "",
          visibility: document.visibility,
          expiry_date: document.expiry_date ? document.expiry_date.slice(0, 10) : "",
          notes: document.notes ?? "",
          file: null,
        }
      : {
          employee_id: currentEmployeeId,
          title: "",
          type: "",
          visibility: "hr_only",
          expiry_date: "",
          notes: "",
          file: null,
        };

    setActiveDocument(document ?? null);
    setForm(payload);
    setModalOpen(true);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setForm((state) => ({ ...state, file }));
  };

  const createMutation = useMutation({
    mutationFn: (payload: FormData) => createEmployeeDocument(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "employee-documents"] });
      toast.success("Document uploaded", "Employee document saved successfully.");
      setModalOpen(false);
    },
    onError: (error: Error) => { toast.error("Upload failed", error.message); setError(error.message); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FormData }) => updateEmployeeDocument(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "employee-documents"] });
      toast.success("Document updated", "Employee document updated successfully.");
      setModalOpen(false);
    },
    onError: (error: Error) => { toast.error("Update failed", error.message); setError(error.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmployeeDocument,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "employee-documents"] });
      toast.success("Deleted", "Document removed successfully.");
    },
    onError: (error: Error) => { toast.error("Delete failed", error.message); setError(error.message); },
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const payload = new FormData();
    payload.append("employee_id", String(form.employee_id));
    payload.append("title", form.title);
    payload.append("type", form.type);
    payload.append("visibility", form.visibility);
    if (form.expiry_date) {
      payload.append("expiry_date", form.expiry_date);
    }
    if (form.notes) {
      payload.append("notes", form.notes);
    }
    if (form.file) {
      payload.append("file", form.file);
    }

    if (activeDocument) {
      await updateMutation.mutateAsync({ id: activeDocument.id, payload });
      return;
    }

    await createMutation.mutateAsync(payload);
  };

  const renderGroup = (group: { employeeName: string; items: EmployeeDocumentItem[] }) => (
    <section key={group.employeeName} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{group.employeeName}</h2>
          <p className="text-sm text-[var(--muted)]">{group.items.length} document{group.items.length === 1 ? "" : "s"}</p>
        </div>
        {canManageDocuments && (
          <Button onClick={() => openModal()}>
            Upload document
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="p-3">Title</th>
              <th className="p-3">Category</th>
              <th className="p-3">Visibility</th>
              <th className="p-3">Expiry</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((document) => (
              <tr key={document.id} className="border-b border-[var(--border)]/60">
                <td className="p-3">{document.title}</td>
                <td className="p-3">{document.type ?? "Unspecified"}</td>
                <td className="p-3">{visibilityOptions.find((item) => item.value === document.visibility)?.label ?? document.visibility}</td>
                <td className="p-3">{document.expiry_date ? document.expiry_date.slice(0, 10) : "—"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => void previewEmployeeDocument(document.id)}>
                      Preview
                    </Button>
                    <Button variant="outline" onClick={() => void downloadEmployeeDocument(document.id)}>
                      Download
                    </Button>
                    {canManageDocuments && (
                      <>
                        <Button variant="outline" onClick={() => openModal(document)}>
                          Edit
                        </Button>
                        <Button variant="outline" onClick={() => void deleteMutation.mutateAsync(document.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  if (!canManageDocuments && currentEmployeeId === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employee Documents" subtitle="View documents attached to your employee profile." />
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-sm text-[var(--muted)]">No employee profile is linked to your account. Contact HR to access document records.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Employee Documents" subtitle="Upload, tag, and browse documents for employees." />

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="grid gap-4 md:grid-cols-3">
          {showEmployeeFilter && (
            <FormField label="Employee">
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(Number(event.target.value))}
              >
                <option value={0}>All employees</option>
                {(employeesQuery.data ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Category">
            <select
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All categories</option>
              {documentCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Visibility">
            <select
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
            >
              <option value="">All visibility</option>
              {visibilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {canManageDocuments && (
          <div className="mt-4 flex justify-end">
            <Button onClick={() => openModal()}>Upload document</Button>
          </div>
        )}
      </section>

      {groupedDocuments.length > 0 ? groupedDocuments.map(renderGroup) : (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
          {documentsQuery.isLoading ? "Loading documents..." : "No documents found for the selected filters."}
        </section>
      )}

      {modalOpen && (
        <Modal title={activeDocument ? "Edit document" : "Upload document"} onClose={() => setModalOpen(false)}>
          <form className="space-y-3" onSubmit={handleSubmit}>
            {canManageDocuments && (
              <FormField label="Employee">
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.employee_id}
                  onChange={(event) => setForm((state) => ({ ...state, employee_id: Number(event.target.value) }))}
                >
                  {(employeesQuery.data ?? []).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField label="Title">
              <FormInput value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} />
            </FormField>

            <FormField label="Category">
              <select
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                value={form.type}
                onChange={(event) => setForm((state) => ({ ...state, type: event.target.value as DocumentCategory | "" }))}
              >
                <option value="">Select category</option>
                {documentCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </FormField>

            {canManageDocuments && (
              <FormField label="Visibility">
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.visibility}
                  onChange={(event) => setForm((state) => ({ ...state, visibility: event.target.value as VisibilityOption }))}
                >
                  {visibilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Expiry date">
                <FormInput
                  type="date"
                  value={form.expiry_date}
                  onChange={(event) => setForm((state) => ({ ...state, expiry_date: event.target.value }))}
                />
              </FormField>
              <FormField label="File">
                <input type="file" className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm" onChange={handleFileChange} />
                {activeDocument?.file_path && !form.file && (
                  <p className="mt-2 text-xs text-[var(--muted)]">Leave blank to keep the current file.</p>
                )}
              </FormField>
            </div>

            <FormField label="Notes">
              <textarea
                rows={4}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.notes}
                onChange={(event) => setForm((state) => ({ ...state, notes: event.target.value }))}
              />
            </FormField>

            <div className="flex justify-end gap-3">
              <Button type="submit">{activeDocument ? "Save changes" : "Upload document"}</Button>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}