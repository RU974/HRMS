<?php

namespace App\Console\Commands;

use App\Models\ChatMessage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Chat attachments used to be written to the public disk, where anyone who
 * learns a file's URL can fetch it without logging in. New attachments go to
 * the private disk and are only served through the authorised download
 * endpoint; this moves the older ones across.
 */
class SecureChatAttachments extends Command
{
    protected $signature = 'chat:secure-attachments {--dry-run : List what would move without changing anything}';

    protected $description = 'Move existing chat attachments from the public disk to the private disk';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $public = Storage::disk('public');
        $private = Storage::disk('local');

        $moved = 0;
        $skipped = 0;
        $missing = 0;

        ChatMessage::withTrashed()
            ->withoutGlobalScopes()
            ->whereNotNull('attachment_path')
            ->orderBy('id')
            ->chunkById(200, function ($messages) use ($public, $private, $dryRun, &$moved, &$skipped, &$missing): void {
                foreach ($messages as $message) {
                    $path = $message->attachment_path;

                    if ($private->exists($path)) {
                        $skipped++;
                        // Already private. Remove any leftover public copy.
                        if (!$dryRun && $public->exists($path)) {
                            $public->delete($path);
                        }
                        continue;
                    }

                    if (!$public->exists($path)) {
                        $missing++;
                        $this->warn("Message #{$message->id}: file not found at {$path}");
                        continue;
                    }

                    $this->line(($dryRun ? '[dry-run] would move ' : 'Moving ') . $path);

                    if ($dryRun) {
                        $moved++;
                        continue;
                    }

                    $stream = $public->readStream($path);
                    if ($stream === null || !$private->writeStream($path, $stream)) {
                        $this->error("Message #{$message->id}: could not copy {$path}");
                        continue;
                    }
                    if (is_resource($stream)) {
                        fclose($stream);
                    }

                    // Only remove the public copy once the private one is confirmed.
                    if ($private->exists($path)) {
                        $public->delete($path);
                        $moved++;
                    }
                }
            });

        $verb = $dryRun ? 'Would move' : 'Moved';
        $this->info("{$verb} {$moved}; already private {$skipped}; missing {$missing}.");

        return self::SUCCESS;
    }
}
