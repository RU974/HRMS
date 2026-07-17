import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import {
  createEmployee,
  getEmployees,
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

const employeeSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  phone: z.string().optional(),
  cnic: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  employee_number: z.string().optional(),
  department_id: z.string().min(1, "Department is required"),
  designation_id: z.string().optional(),
  joining_date: z.string().optional(),
  employment_type: z.string().optional(),
  shift_id: z.string().optional(),
  manager_id: z.string().optional(),
  basic_salary: z
    .string()
    .min(1, "Basic salary is required")
    .refine((v) => Number.isFinite(Number.parseFloat(v)), "Enter a valid amount"),
  allowances: z
    .string()
    .optional()
    .refine((v) => !v || Number.isFinite(Number.parseFloat(v)), "Enter a valid amount"),
  username: z.string().optional(),
  password: z.string().optional(),
  role: z.string().min(1, "Role is required"),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export function EmployeeFormPage() {
  const navigate = useNavigate();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
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
    },
  });

  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: listDepartments, retry: false });
  const designationsQuery = useQuery({ queryKey: ["designations"], queryFn: listDesignations, retry: false });
  const shiftsQuery = useQuery({ queryKey: ["shifts"], queryFn: listShifts, retry: false });
  const managersQuery = useQuery({ queryKey: ["employees", "managers"], queryFn: () => getEmployees(), retry: false });

  const mutation = useMutation({
    mutationFn: (payload: FormData) => createEmployee(payload),
    onSuccess: () => { toast.success("Employee added", "New employee has been created successfully."); navigate("/employees"); },
    onError: (e: Error) => toast.error("Failed to save", e.message),
  });

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setProfileImage(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  function onSubmit(values: EmployeeFormValues) {
    const payload = new FormData();
    const name = [values.first_name.trim(), values.last_name.trim()].filter(Boolean).join(" ");
    const basicSalary = Number.parseFloat(values.basic_salary);
    const allowances = Number.parseFloat(values.allowances || "0");

    if (name) {
      payload.append("name", name);
    }

    Object.entries(values).forEach(([key, value]) => {
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

    mutation.mutate(payload);
  }

  const departmentOptions = departmentsQuery.data ?? [];
  const designationOptions = designationsQuery.data ?? [];
  const shiftOptions = shiftsQuery.data ?? [];
  const managerOptions = managersQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="New Employee" subtitle="Capture employee profile, company, salary, and account details." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              <FormInput {...register("first_name")} />
              {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name</label>
              <FormInput {...register("last_name")} />
              {errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <FormInput type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <FormInput {...register("phone")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CNIC</label>
              <FormInput {...register("cnic")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <FormInput type="date" {...register("date_of_birth")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Gender</label>
              <select className={inputClass} {...register("gender")}>
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
                {...register("address")}
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
              <FormInput {...register("employee_number")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <select className={inputClass} {...register("department_id")}>
                <option value="">Select department</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
              {errors.department_id && <p className="text-xs text-red-500">{errors.department_id.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Designation</label>
              <select className={inputClass} {...register("designation_id")}>
                <option value="">Select designation</option>
                {designationOptions.map((designation) => (
                  <option key={designation.id} value={designation.id}>{designation.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Joining Date</label>
              <FormInput type="date" {...register("joining_date")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Employment Type</label>
              <select className={inputClass} {...register("employment_type")}>
                <option value="">Select employment type</option>
                {employmentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Shift</label>
              <select className={inputClass} {...register("shift_id")}>
                <option value="">Select shift</option>
                {shiftOptions.map((shift) => (
                  <option key={shift.id} value={shift.id}>{shift.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Manager</label>
              <select className={inputClass} {...register("manager_id")}>
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
              <FormInput type="number" step="0.01" {...register("basic_salary")} />
              {errors.basic_salary && <p className="text-xs text-red-500">{errors.basic_salary.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Allowances</label>
              <FormInput type="number" step="0.01" {...register("allowances")} />
              {errors.allowances && <p className="text-xs text-red-500">{errors.allowances.message}</p>}
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
              <FormInput {...register("username")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <FormInput type="password" {...register("password")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Role</label>
              <select className={inputClass} {...register("role")}>
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Create Employee"}
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
