<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class PipelineStage extends Model
{
    use HasCompany;

    /** The built-in stages a custom stage can belong to. hired and rejected are fixed end points. */
    public const CATEGORIES = ['applied', 'screening', 'interview', 'offer'];

    protected $fillable = ['company_id', 'job_opening_id', 'name', 'category', 'sort_order', 'is_skippable'];

    protected $casts = ['is_skippable' => 'boolean', 'sort_order' => 'integer'];
}
