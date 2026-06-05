<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Approval extends Model
{
    use HasFactory;

    protected $fillable = ['module','module_id','workflow_id','current_step_id','status','requested_by','company_id','metadata'];

    protected $casts = ['metadata' => 'array'];

    public function workflow()
    {
        return $this->belongsTo(Workflow::class);
    }

    public function currentStep()
    {
        return $this->belongsTo(ApprovalStep::class, 'current_step_id');
    }
}
