<?php

namespace App\Console\Commands;

use App\Services\Recruitment\CandidateRetentionService;
use Illuminate\Console\Command;

class ApplyRecruitmentRetention extends Command
{
    protected $signature = 'recruitment:apply-retention';

    protected $description = 'Let expired talent-pool entries lapse, warn about those about to, and erase old rejected candidates per each company\'s retention setting';

    public function handle(CandidateRetentionService $retention): int
    {
        $result = $retention->run();

        $this->info("Talent pool entries expired: {$result['pool_expired']}");
        $this->info("Talent pool entries about to expire (team warned): {$result['pool_warned']}");
        $this->info("Candidate records erased: {$result['erased']}");

        return self::SUCCESS;
    }
}
