<?php

namespace App\Console\Commands;

use App\Models\License;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class NotifyTrialExpiring extends Command
{
    protected $signature   = 'licenses:notify-trial-expiring';
    protected $description = 'Send email warnings when a trial license is 7, 3, or 1 day(s) from expiring.';

    public function handle(): int
    {
        $trialDays  = (int) config('licenses.trial_days', 14);
        $thresholds = [7, 3, 1];
        $notified   = 0;
        $support    = config('licenses.support_email');

        foreach ($thresholds as $remaining) {
            // A trial license expires at issued_at + trialDays.
            // "N days remaining" means the license was issued exactly (trialDays - remaining) days ago.
            $daysElapsed = $trialDays - $remaining;

            $licenses = License::query()
                ->active()
                ->where('status', 'trial')
                ->whereNull('activated_at')
                ->whereDate('issued_at', now()->subDays($daysElapsed)->toDateString())
                ->get();

            foreach ($licenses as $license) {
                $key                = "trial_{$remaining}";
                $notifiedThresholds = $license->notified_thresholds ?? [];

                if (in_array($key, $notifiedThresholds, true)) {
                    continue;
                }

                $expiryDate = $license->issued_at->copy()->addDays($trialDays)->format('F j, Y');
                $body       = <<<TEXT
                    Dear {$license->licensee_name},

                    Your HRMS {$license->edition} free trial (key: {$license->license_key}) will expire in {$remaining} day(s) on {$expiryDate}.

                    To continue using HRMS without interruption, please activate your license before the trial ends. If you haven't received a license key, contact us at {$support} and we'll set you up right away.

                    Thank you,
                    The HRMS Licensing Team
                    TEXT;

                try {
                    Mail::raw(
                        $body,
                        fn ($msg) => $msg
                            ->to($license->licensee_email)
                            ->subject("Your HRMS Trial Expires in {$remaining} Day(s) — Activate Now")
                    );

                    $notifiedThresholds[] = $key;
                    $license->notified_thresholds = $notifiedThresholds;
                    $license->save();

                    $notified++;
                } catch (\Throwable $e) {
                    $this->warn("Failed to notify {$license->licensee_email}: {$e->getMessage()}");
                }
            }
        }

        $this->info("Sent {$notified} trial expiry warning(s).");

        return self::SUCCESS;
    }
}
