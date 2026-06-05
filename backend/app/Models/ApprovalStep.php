<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApprovalStep extends Model
{
    use HasFactory;

    protected $fillable = ['workflow_id','step_order','approver_type','approver_identifier','conditions'];

    protected $casts = ['conditions' => 'array'];

    public function workflow()
    {
        return $this->belongsTo(Workflow::class);
    }
}
