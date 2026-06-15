<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaxBracket extends Model
{
    protected $fillable = [
        'company_id',
        'name',
        'min_income',
        'max_income',
        'rate',
        'sort_order',
    ];

    protected $casts = [
        'min_income'  => 'float',
        'max_income'  => 'float',
        'rate'        => 'float',
        'sort_order'  => 'integer',
    ];
}
