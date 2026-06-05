<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

use App\Models\Approval;

class Workflow extends Model
{
    use HasFactory;

    protected $fillable = ['name','module','definition','company_id'];

    protected $casts = ['definition' => 'array'];

    public function steps()
    {
        return $this->hasMany(ApprovalStep::class);
    }

    public function approvals()
    {
        return $this->hasMany(Approval::class);
    }
}
