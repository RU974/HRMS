<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CompanyCurrencyRate extends Model
{
    protected $fillable = ['company_id', 'currency', 'rate'];

    protected $casts = ['rate' => 'float'];
}
