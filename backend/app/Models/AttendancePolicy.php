<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendancePolicy extends Model
{
    protected $fillable = [
        'name',
        'late_after_time',
        'allow_manual_status_override',
    ];
}
