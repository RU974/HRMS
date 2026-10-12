<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class JobQuestion extends Model
{
    use HasCompany;

    public const TYPES = ['text', 'textarea', 'number', 'yes_no', 'single_choice', 'multi_choice', 'date'];

    public const OPERATORS = ['eq', 'neq', 'gte', 'lte', 'in', 'not_in'];

    protected $fillable = ['company_id', 'job_opening_id', 'label', 'help_text', 'type', 'options', 'required', 'knockout', 'sort_order'];

    protected $casts = ['options' => 'array', 'knockout' => 'array', 'required' => 'boolean', 'sort_order' => 'integer'];
}
