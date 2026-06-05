<?php

namespace Tests\Unit;

use Tests\TestCase;
use App\Services\TaxCalculator;

class TaxCalculatorTest extends TestCase
{
    public function test_tax_brackets_calculation()
    {
        config(['payroll.tax_brackets' => [
            50000 => 0.0,
            100000 => 0.10,
            200000 => 0.15,
            PHP_INT_MAX => 0.20,
        ]]);

        $calc = new TaxCalculator();

        $this->assertEquals(0.0, $calc->calculate(40000.0));
        $this->assertEquals(2500.0, $calc->calculate(75000.0));
        $this->assertEquals(12500.0, $calc->calculate(150000.0));
        $this->assertEquals(40000.0, $calc->calculate(300000.0));
    }
}
