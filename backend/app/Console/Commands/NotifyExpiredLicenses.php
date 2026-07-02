<?php

namespace App\Console\Commands;

use App\Models\License;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class NotifyExpiredLicenses extends Command
{
    protected $signature   = 'licenses:notify-expired';
    protected $description = 'Send a one-time email to licensees whose license has just expired (within the last 24 hours).';

    public function handle(): int
    {
        $support  = config('licenses.support_email');
        $notified = 0;

        // Licenses that expired in the past 24 hours and haven't been notified yet.
        $licenses = License::query()
            ->active()
            ->where('status', 'expired')
            ->whereNotNull('expires_at')
            ->where('expires_at', '>=', now()->subDay())
            ->get();

        foreach ($licenses as $license) {
            $notifiedThresholds = $license->notified_thresholds ?? [];

            if (in_array('expired', $notifiedThresholds, true)) {
                continue;
            }

            $body = <<<TEXT
                Dear {$license->licensee_name},

                Your HRMS {$license->edition} license (key: {$license->license_key}) expired on {$license->expires_at->format('F j, Y')}.

                Access to licensed modules is currently restricted. To restore full access, please renew your license as soon as possible.

                If you need assistance, contact us at {$support}.

                Thank you,
                The HRMS Licensing Team
                TEXT;

            try {
                Mail::raw(
                    $body,
                    fn ($msg) => $msg
                        ->to($license->licensee_email)
                        ->subject('Your HRMS License Has Expired — Renew Now to Restore Access')
                );

                $notifiedThresholds[]         = 'expired';
                $license->notified_thresholds = $notifiedThresholds;
                $license->save();

                $notified++;
            } catch (\Throwable $e) {
                $this->warn("Failed to notify {$license->licensee_email}: {$e->getMessage()}");
            }
        }

        $this->info("Sent {$notified} expiry notification(s).");

        return self::SUCCESS;
    }
}
