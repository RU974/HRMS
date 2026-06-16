<?php

namespace App\Console\Commands;

use App\Http\Controllers\AnnouncementController;
use Illuminate\Console\Command;

class PublishScheduledAnnouncements extends Command
{
    protected $signature = 'announcements:publish-scheduled';
    protected $description = 'Publish announcements whose scheduled publish time has arrived.';

    public function handle(AnnouncementController $controller): int
    {
        $published = $controller->publishDueScheduled();

        $this->info("Published {$published} scheduled announcement(s).");

        return self::SUCCESS;
    }
}
