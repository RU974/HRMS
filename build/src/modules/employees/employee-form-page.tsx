import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import {
  createEmployee,
  getEmployees,
  type Employee,
} from "@/services/employee-service";
import {
  listDepartments,
  listDesignations,
  listShifts,
} from "@/services/hr-management-service";

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const employmentTypeOptions = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "intern", label: "Intern" },
];

const roleOptions = [
  { value: "Employee", label: "Employee" },
  { value: "Department Manager", label: "Department Manager" },
  { value: "Payroll Manager", label: "Payroll Manager" },
  { value: "Attendance Manager", label: "Attendance Manager" },
  { value: "HR Manager", label: "HR Manager" },
  { value: "HR Executive", label: "HR Executive" },
];

const inputClass = "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm";

export function EmployeeFormPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    cnic: "",
    date_of_birth: "",
    gender: "",
    address: "",
    employee_number: "",
    department_id: "",
    designation_id: "",
    joining_date: "",
    employment_type: "",
    shift_id: "",
    manager_id: "",
    basic_salary: "",
    allowances: "",
    username: "",
    password: "",
    role: "Employee",
  });

  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: listDepartments, retry: false });
  const designationsQuery = useQuery({ queryKey: ["designations"], queryFn: listDesignations, retry: false });
  const shiftsQuery = useQuery({ queryKey: ["shifts"], queryFn: listShifts, retry: false });
  const managersQuery = useQuery({ queryKey: ["employees", "managers"], queryFn: () => getEmployees(), retry: false });

  const mutation = useMutation({
    mutationFn: (payload: FormData) => createEmployee(payload),
    onSuccess: () => navigate("/employees"),
  });

  function handleChange<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setProfileImage(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = new FormData();
      const name = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" ");
      const basicSalary = Number.parseFloat(form.basic_salary);
      const allowances = Number.parseFloat(form.allowances || "0");

      if (name) {
        payload.append("name", name);
      }

      Object.entries(form).forEach(([key, value]) => {
        if (value !== "") {
          payload.append(key, value);
        }
      });

      payload.append(
        "salary",
        String((Number.isFinite(basicSalary) ? basicSalary : 0) + (Number.isFinite(allowances) ? allowances : 0)),
      );

      if (profileImage) {
        payload.append("profile_image", profileImage);
      }

      await mutation.mutateAsync(payload);
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  }

  const departmentOptions = departmentsQuery.data ?? [];
  const designationOptions = designationsQuery.data ?? [];
  const shiftOptions = shiftsQuery.data ?? [];
  const managerOptions = managersQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="New Employee" subtitle="Capture employee profile, company, salary, and account details." />
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Personal Information</h2>
              <p className="text-sm text-[var(--muted)]">Basic contact and demographic details.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name</label>
              <FormInput value={form.first_name} onChange={(event) => handleChange("first_name", event.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name</label>
              <FormInput value={form.last_name} onChange={(event) => handleChange("last_name", event.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <FormInput type="email" value={form.email} onChange={(event) => handleChange("email", event.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <FormInput value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CNIC</label>
              <FormInput value={form.cnic} onChange={(event) => handleChange("cnic", event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <FormInput type="date" value={form.date_of_birth} onChange={(event) => handleChange("date_of_birth", event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Gender</label>
              <select className={inputClass} value={form.gender} onChange={(event) => handleChange("gender", event.target.value)}>
                <option value="">Select gender</option>
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <textarea
                className="h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                value={form.address}
                onChange={(event) => handleChange("address", event.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Company Information</h2>
              <p className="text-sm text-[var(--muted)]">Employment and reporting details.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Employee ID</label>
              <FormInput value={form.employee_number} onChange={(event) => handleChange("employee_number", event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <select className={inputClass} value={form.department_id} onChange={(event) => handleChange("department_id", event.target.value)} required>
                <option value="">Select department</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Designation</label>
              <select className={inputClass} value={form.designation_id} onChange={(event) => handleChange("designation_id", event.target.value)}>
                <option value="">Select designation</option>
                {designationOptions.map((designation) => (
                  <option key={designation.id} value={designation.id}>{designation.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Joining Date</label>
              <FormInput type="date" value={form.joining_date} onChange={(event) => handleChange("joining_date", event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Employment Type</label>
              <select className={inputClass} value={form.employment_type} onChange={(event) => handleChange("employment_type", event.target.value)}>
                <option value="">Select employment type</option>
                {employmentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift</label>
              <select className={inputClass} value={form.shift_id} onChange={(event) => handleChange("shift_id", event.target.value)}>
                <option value="">Select shift</option>
                {shiftOptions.map((shift) => (
                  <option key={shift.id} value={shift.id}>{shift.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Manager</label>
              <select className={inputClass} value={form.manager_id} onChange={(event) => handleChange("manager_id", event.target.value)}>
                <option value="">Select manager</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>{manager.name}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Salary Information</h2>
              <p className="text-sm text-[var(--muted)]">Salary details used for payroll calculations.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Basic Salary</label>
              <FormInput type="number" step="0.01" value={form.basic_salary} onChange={(event) => handleChange("basic_salary", event.target.value)} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Allowances</label>
              <FormInput type="number" step="0.01" value={form.allowances} onChange={(event) => handleChange("allowances", event.target.value)} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Account Information</h2>
              <p className="text-sm text-[var(--muted)]">Employee user login credentials and role.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username</label>
              <FormInput value={form.username} onChange={(event) => handleChange("username", event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <FormInput type="password" value={form.password} onChange={(event) => handleChange("password", event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Role</label>
              <select className={inputClass} value={form.role} onChange={(event) => handleChange("role", event.target.value)}>
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Profile</h2>
              <p className="text-sm text-[var(--muted)]">Upload a profile image for the employee.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 items-start">
            <div className="space-y-2">
              <label className="text-sm font-medium">Profile Image</label>
              <input type="file" accept="image/*" onChange={handleImageChange} className={inputClass} />
            </div>
            {previewUrl && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <img src={previewUrl} alt="Profile preview" className="h-32 w-32 rounded-full object-cover" />
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={submitting || mutation.isPending}>
            {submitting || mutation.isPending ? "Saving..." : "Create Employee"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/employees")}>Cancel</Button>
          {mutation.error instanceof Error && (
            <p className="text-sm text-red-500">{mutation.error.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}
