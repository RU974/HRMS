<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            'Super Admin',
            'Company Admin',
            'HR Manager',
            'HR Executive',
            'Payroll Manager',
            'Attendance Manager',
            'Recruiter',
            'Department Manager',
            'IT Support',
            'Employee',
        ];

        foreach ($roles as $roleName) {
            $lookup = ['name' => $roleName];
            if (Schema::hasColumn('roles', 'company_id')) {
                $lookup['company_id'] = null;
            }

            $values = ['description' => $roleName . ' role'];
            if (Schema::hasColumn('roles', 'display_name')) {
                $values['display_name'] = $roleName;
            }

            Role::updateOrCreate($lookup, $values);
        }

        // Super Admin gets all permissions
        $super = Role::where('name', 'Super Admin')->first();
        if ($super) {
            try {
                $all = Permission::pluck('id')->all();
                $all = array_values(array_filter(array_map('intval', $all), function ($id) {
                    return $id > 0;
                }));
                if (!empty($all)) {
                    $super->permissions()->sync($all);
                }
            } catch (\Throwable $e) {
                // ignore if permissions table schema differs
            }
        }
    }
}
