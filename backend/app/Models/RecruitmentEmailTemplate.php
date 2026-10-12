<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;

class RecruitmentEmailTemplate extends Model
{
    use HasCompany;

    protected $fillable = ['company_id', 'name', 'subject', 'body', 'created_by'];
}
