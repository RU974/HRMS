<?php

namespace App\Console\Commands;

use App\Models\License;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class NotifyExpiringLicenses extends Command
{
    protected $signature   = 'licenses:notify-expiring';
    protected $description = 'Send email notifications to licensees whose licenses expire in 30, 14, 7, or 1 day(s).';

    public function handle(): int
    {
        $thresholds = [30, 14, 7, 1];
        $notified   = 0;
        $support    = config('licenses.support_email');

        foreach ($thresholds as $days) {
            $licenses = License::query()
                ->active()
                ->where('status', 'active')
                ->whereNotNull('expires_at')
                ->whereDate('expires_at', now()->addDays($days)->toDateString())
                ->get();

            foreach ($licenses as $license) {
                $key      = "expiry_{$days}";
                $notifiedThresholds = $license->notified_thresholds ?? [];

                if (in_array($key, $notifiedThresholds, true)) {
                    continue;
                }

                $expiryDate = $license->expires_at->format('F j, Y');
                $body       = <<<TEXT
                    Dear {$license->licensee_name},

                    This is a reminder that your HRMS {$license->edition} license (key: {$license->license_key}) will expire in {$days} day(s) on {$expiryDate}.

                    To avoid any service interruption, please renew your license before the expiry date.

                    If you need assistance, please contact us at {$support}.

                    Thank you,
                    The HRMS Licensing Team
                    TEXT;

                try {
                    Mail::raw(
                        $body,
                        fn ($msg) => $msg
                            ->to($license->licensee_email)
                            ->subject("Action Required: Your HRMS License Expires in {$days} Day(s)")
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

        $this->info("Sent {$notified} expiry notification(s).");

        return self::SUCCESS;
    }
}
