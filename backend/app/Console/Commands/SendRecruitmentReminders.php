<?php

namespace App\Console\Commands;

use App\Models\Interview;
use App\Services\Recruitment\OfferService;
use App\Services\Recruitment\OnboardingService;
use App\Services\Recruitment\RecruitmentNotificationService;
use Illuminate\Console\Command;

class SendRecruitmentReminders extends Command
{
    protected $signature = 'recruitment:send-reminders';

    protected $description = 'Remind interviewers about missing scorecards, assignees about due onboarding tasks, and expire stale offers';

    public function handle(RecruitmentNotificationService $notifications, OnboardingService $onboarding, OfferService $offers): int
    {
        $interviews = Interview::query()
            ->withoutGlobalScopes()
            ->where('status', 'scheduled')
            ->whereNotNull('interviewer_id')
            ->whereNull('scorecard_reminded_at')
            ->get()
            ->filter(fn (Interview $interview) => $interview->endsAt() && $interview->endsAt()->isPast());

        foreach ($interviews as $interview) {
            $notifications->scorecardReminder($interview);
            $interview->forceFill(['scorecard_reminded_at' => now()])->save();
        }

        $this->info("Scorecard reminders sent: {$interviews->count()}");
        $this->info('Onboarding task reminders sent: ' . $onboarding->remindDueTasks());
        $this->info('Offers expired: ' . $offers->expireStale());

        return self::SUCCESS;
    }
}
