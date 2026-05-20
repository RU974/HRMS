<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmployeeDocument extends Model
{
    protected $fillable = [
        'employee_id',
        'title',
        'type',
        'file_path',
        'visibility',
        'expiry_date',
        'notes',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function versions(): HasMany
    {
        return $this->hasMany(EmployeeDocumentVersion::class);
    }
}
