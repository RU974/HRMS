<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class CandidateAnswer extends Model
{
    use HasCompany;

    protected $fillable = ['company_id', 'candidate_id', 'job_question_id', 'question', 'type', 'answer', 'knocked_out'];

    protected $casts = ['answer' => 'array', 'knocked_out' => 'boolean'];
}
