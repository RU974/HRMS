import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "@/components/notifications/toast";
import { PageHeader } from "@/components/page-header/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-input";
import { useAuthStore } from "@/store/auth-store";
import { isSuperAdminRole } from "@/config/rbac";
import { listCompanies } from "@/services/settings-service";
import {
  createEmployee,
  getEmployee,
  updateEmployee,
  getEmployeeOptions,
  type Employee,
  BLOOD_GROUPS,
  type EmergencyContact,
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

const MAX_EMERGENCY_CONTACTS = 10;
const emptyContact = (): EmergencyContact => ({ name: "", relationship: "", phone: "", email: "" });

const employeeSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  phone: z.string().optional(),
  cnic: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  blood_group: z.string().optional(),
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
  commission_percentage: z
    .string()
    .optional()
    .refine(
      (v) => !v || (Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) >= 0 && Number.parseFloat(v) <= 100),
      "Enter a percentage between 0 and 100",
    ),
  username: z.string().optional(),
  password: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  company_id: z.string().optional(),
  status: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export function EmployeeFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const employeeId = id ? Number(id) : null;
  const isEdit = employeeId !== null && !Number.isNaN(employeeId);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([emptyContact()]);
  const [contactError, setContactError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = isSuperAdminRole(user);

  const {
    register,
    handleSubmit,
    watch,
    reset,
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
      blood_group: "",
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
      commission_percentage: "",
      username: "",
      password: "",
      role: "Employee",
      company_id: "",
      status: "active",
    },
  });

  const selectedCompanyId = watch("company_id");

  const companiesQuery = useQuery({
    queryKey: ["settings", "companies"],
    queryFn: listCompanies,
    enabled: isSuperAdmin,
    retry: false,
  });
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: listDepartments, retry: false });
  const designationsQuery = useQuery({ queryKey: ["designations"], queryFn: listDesignations, retry: false });
  const shiftsQuery = useQuery({ queryKey: ["shifts"], queryFn: listShifts, retry: false });
  const managersQuery = useQuery({ queryKey: ["employees", "managers"], queryFn: getEmployeeOptions, retry: false });

  const employeeQuery = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(employeeId as number),
    enabled: isEdit,
  });

  // Prefill the form with the saved employee data when editing.
  useEffect(() => {
    const employee = employeeQuery.data as
      | (Employee & { user?: { username?: string | null; roles?: { name: string }[] } | null; department_id?: number | null; designation_id?: number | null; emergency_contacts?: EmergencyContact[] | null })
      | undefined;
    if (!employee) return;
    const nameParts = (employee.name ?? "").split(" ");
    const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
    const date = (v?: string | null) => (v ? v.slice(0, 10) : "");
    reset({
      first_name: employee.first_name ?? nameParts[0] ?? "",
      last_name: employee.last_name ?? nameParts.slice(1).join(" "),
      email: employee.email ?? "",
      phone: str(employee.phone),
      cnic: str(employee.cnic),
      date_of_birth: date(employee.date_of_birth),
      gender: str(employee.gender),
      blood_group: str(employee.blood_group),
      address: str(employee.address),
      employee_number: str(employee.employee_number),
      department_id: str(employee.department_id),
      designation_id: str(employee.designation_id),
      joining_date: date(employee.joining_date),
      employment_type: str(employee.employment_type),
      shift_id: str(employee.shift_id ?? employee.shift?.id),
      manager_id: str(employee.manager_id ?? employee.manager?.id),
      basic_salary: str(employee.basic_salary),
      allowances: str(employee.allowances),
      commission_percentage: str(employee.commission_percentage),
      username: str(employee.user?.username),
      password: "",
      role: employee.user?.roles?.[0]?.name ?? "Employee",
      company_id: "",
      status: employee.status === "inactive" ? "inactive" : "active",
    });
    const existing = employee.emergency_contacts ?? [];
    setContacts(existing.length > 0 ? existing.map((c) => ({ ...c, email: c.email ?? "" })) : [emptyContact()]);
    setPreviewUrl(employee.profile_image ?? null);
  }, [employeeQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: (payload: FormData) => (isEdit ? updateEmployee(employeeId as number, payload) : createEmployee(payload)),
    onSuccess: async () => {
      if (isEdit) {
        await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
        await queryClient.invalidateQueries({ queryKey: ["employees"] });
        toast.success("Employee updated", "Employee details have been saved.");
        navigate(`/employees/${employeeId}`);
        return;
      }
      toast.success("Employee added", "New employee has been created successfully.");
      navigate("/employees");
    },
    onError: (e: Error) => toast.error("Failed to save", e.message),
  });

  const missingCompany = !isEdit && isSuperAdmin && !selectedCompanyId;

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setProfileImage(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  function updateContact(index: number, field: keyof EmergencyContact, value: string) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function onSubmit(values: EmployeeFormValues) {
    // Fully blank rows are ignored; partially filled rows must have name, relationship and phone.
    const filled = contacts
      .map((c) => ({
        name: c.name.trim(),
        relationship: c.relationship.trim(),
        phone: c.phone.trim(),
        email: (c.email ?? "").trim(),
      }))
      .filter((c) => c.name || c.relationship || c.phone || c.email);

    if (filled.some((c) => !c.name || !c.relationship || !c.phone)) {
      setContactError("Each emergency contact needs a name, relationship, and phone number.");
      return;
    }
    setContactError(null);

    const payload = new FormData();
    const name = [values.first_name.trim(), values.last_name.trim()].filter(Boolean).join(" ");
    const basicSalary = Number.parseFloat(values.basic_salary);
    const allowances = Number.parseFloat(values.allowances || "0");

    if (name) {
      payload.append("name", name);
    }

    const accountFields = ["company_id"];
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined) return;
      if (isEdit) {
        // Company is fixed after creation; a blank password means "keep current".
        if (accountFields.includes(key)) return;
        if (key === "password" && value === "") return;
        payload.append(key, value);
      } else if (value !== "") {
        payload.append(key, value);
      }
    });

    payload.append(
      "salary",
      String((Number.isFinite(basicSalary) ? basicSalary : 0) + (Number.isFinite(allowances) ? allowances : 0)),
    );

    if (isEdit || filled.length > 0) {
      // Always sent when editing so contacts can be removed.
      payload.append(
        "emergency_contacts",
        JSON.stringify(filled.map(({ email, ...rest }) => (email ? { ...rest, email } : rest))),
      );
    }

    if (profileImage) {
      payload.append("profile_image", profileImage);
    }

    if (isEdit) payload.append("_method", "PUT");

    mutation.mutate(payload);
  }

  const departmentOptions = departmentsQuery.data ?? [];
  const designationOptions = designationsQuery.data ?? [];
  const shiftOptions = shiftsQuery.data ?? [];
  const managerOptions = managersQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? "Edit Employee" : "New Employee"}
        subtitle={isEdit ? "Update employee profile, company, and salary details." : "Capture employee profile, company, salary, and account details."}
      />
      {isEdit && employeeQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading employee...</p>}
      {isEdit && employeeQuery.error instanceof Error && (
        <p className="text-sm text-red-500">{employeeQuery.error.message}</p>
      )}
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Blood Group</label>
              <select className={inputClass} {...register("blood_group")}>
                <option value="">Select blood group</option>
                {BLOOD_GROUPS.map((group) => (
                  <option key={group} value={group}>{group}</option>
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
              <h2 className="text-xl font-semibold">Emergency Contacts</h2>
              <p className="text-sm text-[var(--muted)]">People to reach in case of an emergency. Optional.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={contacts.length >= MAX_EMERGENCY_CONTACTS}
              onClick={() => setContacts((prev) => [...prev, emptyContact()])}
            >
              + Add Contact
            </Button>
          </div>
          <div className="space-y-4">
            {contacts.map((contact, index) => (
              <div key={index} className="rounded-xl border border-[var(--border)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Contact {index + 1}</span>
                  {contacts.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => setContacts((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <FormInput value={contact.name} onChange={(e) => updateContact(index, "name", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Relationship</label>
                    <FormInput
                      placeholder="e.g. Spouse, Father, Sibling"
                      value={contact.relationship}
                      onChange={(e) => updateContact(index, "relationship", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <FormInput value={contact.phone} onChange={(e) => updateContact(index, "phone", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email (optional)</label>
                    <FormInput
                      type="email"
                      value={contact.email ?? ""}
                      onChange={(e) => updateContact(index, "email", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {contactError && <p className="text-xs text-red-500">{contactError}</p>}
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
            {isSuperAdmin && !isEdit && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Company</label>
                <select className={inputClass} {...register("company_id")}>
                  <option value="">Select company</option>
                  {(companiesQuery.data ?? []).map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                <p className="text-xs text-[var(--muted)]">As Super Admin, you must choose which company this employee belongs to.</p>
              </div>
            )}
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
            {isEdit && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <select className={inputClass} {...register("status")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Commission (%)</label>
              <FormInput type="number" step="0.01" min="0" max="100" placeholder="e.g. 5" {...register("commission_percentage")} />
              {errors.commission_percentage && <p className="text-xs text-red-500">{errors.commission_percentage.message}</p>}
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
              {isEdit && <p className="text-xs text-[var(--muted)]">Leave blank to keep the current password.</p>}
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
          <Button type="submit" disabled={mutation.isPending || missingCompany}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Employee"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/employees/${employeeId}` : "/employees")}>Cancel</Button>
          {missingCompany && (
            <p className="text-sm text-red-500">Please select a company before creating this employee.</p>
          )}
          {mutation.error instanceof Error && (
            <p className="text-sm text-red-500">{mutation.error.message}</p>
          )}
        </div>
      </form>
    </div>
  );
}
