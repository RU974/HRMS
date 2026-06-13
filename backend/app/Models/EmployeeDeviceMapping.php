<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EmployeeDeviceMapping extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'device_id',
        'device_user_id',
        'card_number',
        'company_id',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function device()
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }
}