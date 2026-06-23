<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BiometricDeviceUser extends Model
{
    protected $fillable = [
        'device_id',
        'device_user_id',
        'name',
        'company_id',
    ];

    public function device()
    {
        return $this->belongsTo(BiometricDevice::class, 'device_id');
    }
}
