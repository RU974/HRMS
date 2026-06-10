import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormField } from "@/components/common/form-field";
import { FormInput } from "@/components/forms/form-input";
import { Modal } from "@/components/modals/modal";
import { PageHeader } from "@/components/page-header/page-header";
import { Button } from "@/components/ui/button";
import { getEmployeesPage, type Employee } from "@/services/employee-service";
import {
  LeaveItem,
  LeaveTypeItem,
  createLeave,
  createLeaveType,
  deleteLeave,
  deleteLeaveType,
  listLeaveTypes,
  listLeaves,
  updateLeave,
  updateLeaveType,
} from "@/services/hr-management-service";
import { useAuthStore } from "@/store/auth-store";

type LeaveForm = {
  employee_id: number;
  type: string;
  from_date: string;
  to_date: string;
  status: LeaveItem["status"];
};

type LeaveTypeForm = {
  name: string;
  default_days: number;
  is_paid: boolean;
};

type LeaveTab = "my-requests" | "pending-approvals" | "all-requests" | "leave-types";

const leaveStatusOptions: Array<{ value: LeaveItem["status"]; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function LeavesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasApproveLeaves = useAuthStore((state) => state.hasPermission("leaves:approve"));
  const hasViewLeaves = useAuthStore((state) => state.hasPermission("leaves:view"));
  const canRequestOwnLeave = useAuthStore((state) => state.hasPermission("leaves:view"));
  const canManageLeaves = useAuthStore((state) => state.hasPermission("leaves:manage_settings"));
  const canManageTypes = canManageLeaves || useAuthStore((state) => state.hasPermission("settings:manage_settings"));

  const currentEmployeeId = user?.employee?.id ?? 0;
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeaveTab>(
    hasApproveLeaves
      ? "pending-approvals"
      : hasViewLeaves
        ? "all-requests"
        : canRequestOwnLeave
          ? "my-requests"
          : canManageTypes
            ? "leave-types"
            : "my-requests"
  );
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveItem | null>(null);
  const [editingType, setEditingType] = useState<LeaveTypeItem | null>(null);
  const [form, setForm] = useState<LeaveForm>({ employee_id: currentEmployeeId, type: "", from_date: "", to_date: "", status: "pending" });
  const [typeForm, setTypeForm] = useState<LeaveTypeForm>({ name: "", default_days: 0, is_paid: true });
  const [rejectModal, setRejectModal] = useState<LeaveItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const leaveFilters = useMemo(() => {
    const filters: { employee_id?: number; status?: LeaveItem["status"] } = {};
    if (activeTab === "my-requests" && currentEmployeeId) {
      filters.employee_id = currentEmployeeId;
    }
    if (activeTab === "pending-approvals") {
      filters.status = "pending";
    }
    return filters;
  }, [activeTab, currentEmployeeId]);

  const leaveQuery = useQuery({ queryKey: ["hr", "leaves", leaveFilters], queryFn: () => listLeaves(leaveFilters) });
  const employeesQuery = useQuery({ queryKey: ["hr", "leave-employees"], queryFn: async () => (await getEmployeesPage({ per_page: 50 })).data ?? [], enabled: hasApproveLeaves || canManageLeaves });
  const leaveTypesQuery = useQuery({ queryKey: ["hr", "leave-types"], queryFn: listLeaveTypes });

  const leaveTypeOptions = useMemo(
    () => (leaveTypesQuery.data ?? []).map((type) => ({ value: type.name, label: type.name })),
    [leaveTypesQuery.data],
  );

  const employeeNameMap = useMemo(
    () => new Map((leaveQuery.data?.data ?? []).map((leave) => [leave.employee?.id ?? leave.employee_id, leave.employee?.name ?? `#${leave.employee_id}`])),
    [leaveQuery.data?.data],
  );

  const leaveTypeName = (leave: LeaveItem) => leaveTypesQuery.data?.find((type) => type.name === leave.type)?.name ?? leave.type;

  const leaveTypesVisible = canManageTypes;
  const leaveTabs = [
    { key: "my-requests" as const, label: "My Requests", visible: canRequestOwnLeave || hasViewLeaves || hasApproveLeaves },
    { key: "pending-approvals" as const, label: "Pending Approvals", visible: hasApproveLeaves },
    { key: "all-requests" as const, label: "All Requests", visible: hasViewLeaves || hasApproveLeaves },
    { key: "leave-types" as const, label: "Leave Types", visible: leaveTypesVisible },
  ];

  const availableTabs = leaveTabs.filter((tabItem) => tabItem.visible);

  const createLeaveMutation = useMutation({
    mutationFn: async () => createLeave(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
      setLeaveModalOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateLeaveMutation = useMutation({
    mutationFn: async () => {
      if (!editingLeave) {
        throw new Error("No leave selected to update.");
      }
      return updateLeave(editingLeave.id, {
        type: form.type,
        from_date: form.from_date,
        to_date: form.to_date,
        status: form.status,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
      setLeaveModalOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLeave,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const leaveStatusMutation = useMutation({
    mutationFn: async ({ leave, status }: { leave: LeaveItem; status: LeaveItem["status"] }) => updateLeave(leave.id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const createTypeMutation = useMutation({
    mutationFn: async () => createLeaveType(typeForm),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
      setTypeModalOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateTypeMutation = useMutation({
    mutationFn: async () => {
      if (!editingType) {
        throw new Error("No leave type selected to update.");
      }
      return updateLeaveType(editingType.id, typeForm);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
      setTypeModalOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: deleteLeaveType,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "leave-types"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const openLeaveModal = (leave?: LeaveItem) => {
    setEditingLeave(leave ?? null);
    setForm({
      employee_id: leave?.employee_id ?? currentEmployeeId,
      type: leave?.type ?? "",
      from_date: leave?.from_date.slice(0, 10) ?? "",
      to_date: leave?.to_date.slice(0, 10) ?? "",
      status: leave?.status ?? "pending",
    });
    setLeaveModalOpen(true);
  };

  const openTypeModal = (leaveType?: LeaveTypeItem) => {
    setEditingType(leaveType ?? null);
    setTypeForm({
      name: leaveType?.name ?? "",
      default_days: leaveType?.default_days ?? 0,
      is_paid: leaveType?.is_paid ?? true,
    });
    setTypeModalOpen(true);
  };

  const handleLeaveSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (editingLeave) {
      await updateLeaveMutation.mutateAsync();
      return;
    }

    await createLeaveMutation.mutateAsync();
  };

  const handleTypeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (editingType) {
      await updateTypeMutation.mutateAsync();
      return;
    }

    await createTypeMutation.mutateAsync();
  };

  const canSelectEmployee = hasApproveLeaves || canManageLeaves;
  const isOwnRequestOnly = canRequestOwnLeave && !hasApproveLeaves && !canManageLeaves;

  const leaveItems = leaveQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Leaves" subtitle="Manage leave requests, approvals, and leave types." />

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {availableTabs.map((tabItem) => (
              <Button
                key={tabItem.key}
                variant={tabItem.key === activeTab ? "primary" : "outline"}
                onClick={() => setActiveTab(tabItem.key)}
              >
                {tabItem.label}
              </Button>
            ))}
          </div>
          {(canRequestOwnLeave || hasApproveLeaves || canManageLeaves) && activeTab !== "leave-types" && (
            <Button onClick={() => openLeaveModal()}>
              New Leave
            </Button>
          )}
        </div>

        {activeTab === "leave-types" ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => openTypeModal()}>New Leave Type</Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                  <th className="p-3">Type</th>
                  <th className="p-3">Default Days</th>
                  <th className="p-3">Paid</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(leaveTypesQuery.data ?? []).map((leaveType) => (
                  <tr key={leaveType.id} className="border-b border-[var(--border)]/60">
                    <td className="p-3">{leaveType.name}</td>
                    <td className="p-3">{leaveType.default_days}</td>
                    <td className="p-3">{leaveType.is_paid ? "Yes" : "No"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => openTypeModal(leaveType)}>Edit</Button>
                        <Button variant="outline" onClick={() => void deleteTypeMutation.mutateAsync(leaveType.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                    <th className="p-3">Employee</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">From</th>
                    <th className="p-3">To</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveItems.map((item) => {
                    const isOwnLeave = item.employee_id === currentEmployeeId;
                    const canDelete = item.status === "pending" && (hasApproveLeaves || isOwnLeave);
                    const canApprove = hasApproveLeaves && item.status === "pending";
                    const canEdit = hasApproveLeaves;

                    return (
                      <tr key={item.id} className="border-b border-[var(--border)]/60">
                        <td className="p-3">{employeeNameMap.get(item.employee_id)}</td>
                        <td className="p-3">{leaveTypeName(item)}</td>
                        <td className="p-3">{item.from_date.slice(0, 10)}</td>
                        <td className="p-3">{item.to_date.slice(0, 10)}</td>
                        <td className="p-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            item.status === "approved"  ? "bg-emerald-50 text-emerald-700" :
                            item.status === "pending"   ? "bg-amber-50 text-amber-700"   :
                            item.status === "rejected"  ? "bg-red-50 text-red-700"       :
                            "bg-gray-50 text-gray-600"
                          }`}>{item.status}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end flex-wrap gap-2">
                            {canApprove && (
                              <>
                                <Button
                                  variant="outline"
                                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => void leaveStatusMutation.mutateAsync({ leave: item, status: "approved" })}
                                >
                                  ✓ Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  className="border-red-200 text-red-600 hover:bg-red-50"
                                  onClick={() => { setRejectModal(item); setRejectReason(""); }}
                                >
                                  ✕ Reject
                                </Button>
                              </>
                            )}
                            {canEdit && (
                              <Button variant="outline" onClick={() => openLeaveModal(item)}>
                                Edit
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="outline" onClick={() => void deleteMutation.mutateAsync(item.id)}>
                                {isOwnLeave ? "Cancel" : "Delete"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {leaveModalOpen && (
        <Modal title={editingLeave ? "Review Leave" : "Request Leave"} onClose={() => setLeaveModalOpen(false)}>
          <form className="space-y-3" onSubmit={handleLeaveSubmit}>
            {(canSelectEmployee || !isOwnRequestOnly) && (
              <FormField label="Employee">
                <select
                  disabled={!canSelectEmployee}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.employee_id}
                  onChange={(e) => setForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}
                >
                  <option value={0}>Select employee</option>
                  {(employeesQuery.data ?? []).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField label="Type">
              {leaveTypeOptions.length > 0 ? (
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="">Select leave type</option>
                  {leaveTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <FormInput value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} />
              )}
            </FormField>

            <FormField label="From">
              <FormInput type="date" value={form.from_date} onChange={(e) => setForm((p) => ({ ...p, from_date: e.target.value }))} />
            </FormField>

            <FormField label="To">
              <FormInput type="date" value={form.to_date} onChange={(e) => setForm((p) => ({ ...p, to_date: e.target.value }))} />
            </FormField>

            {hasApproveLeaves && (
              <FormField label="Status">
                <select
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as LeaveItem["status"] }))}
                >
                  {leaveStatusOptions.map((statusOption) => (
                    <option key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="flex justify-end">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {typeModalOpen && (
        <Modal title={editingType ? "Edit Leave Type" : "New Leave Type"} onClose={() => setTypeModalOpen(false)}>
          <form className="space-y-3" onSubmit={handleTypeSubmit}>
            <FormField label="Name">
              <FormInput value={typeForm.name} onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))} />
            </FormField>

            <FormField label="Default Days">
              <FormInput
                type="number"
                min={0}
                value={typeForm.default_days}
                onChange={(e) => setTypeForm((p) => ({ ...p, default_days: Number(e.target.value) }))}
              />
            </FormField>

            <FormField label="Paid">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={typeForm.is_paid}
                  onChange={(e) => setTypeForm((p) => ({ ...p, is_paid: e.target.checked }))}
                />
                Paid leave type
              </label>
            </FormField>

            <div className="flex justify-end">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {rejectModal && (
        <Modal title="Reject Leave Request" onClose={() => setRejectModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              You are rejecting the leave request from{" "}
              <span className="font-medium text-[var(--text)]">
                {employeeNameMap?.get(rejectModal.employee_id) ?? `Employee #${rejectModal.employee_id}`}
              </span>{" "}
              ({rejectModal.from_date?.slice(0, 10)} → {rejectModal.to_date?.slice(0, 10)}).
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Reason for rejection</label>
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a brief reason (optional but recommended)..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
              <Button
                className="border-red-200 bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  await leaveStatusMutation.mutateAsync({ leave: rejectModal, status: "rejected" });
                  setRejectModal(null);
                  setRejectReason("");
                }}
              >
                Confirm rejection
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}