<?php

namespace App\Services;

use App\Models\Branch;

class BranchService
{
    public function create(array $data): Branch
    {
        return Branch::create($data);
    }

    public function update(Branch $branch, array $data): Branch
    {
        $branch->update($data);
        return $branch->fresh();
    }
}
