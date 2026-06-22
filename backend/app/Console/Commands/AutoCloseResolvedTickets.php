<?php

namespace App\Console\Commands;

use App\Models\Ticket;
use App\Services\TicketNotificationService;
use App\Services\TicketService;
use Illuminate\Console\Command;

class AutoCloseResolvedTickets extends Command
{
    protected $signature   = 'tickets:auto-close';
    protected $description = 'Close tickets that have been in resolved status for more than 7 days';

    public function handle(TicketService $ticketService, TicketNotificationService $notificationService): int
    {
        $tickets = Ticket::withoutGlobalScopes()
            ->where('status', 'resolved')
            ->whereNotNull('resolved_at')
            ->where('resolved_at', '<', now()->subDays(7))
            ->get();

        $count = 0;

        foreach ($tickets as $ticket) {
            $ticketService->changeStatus($ticket, 'closed');
            $notificationService->notifyAutoClose($ticket);
            $count++;
        }

        $this->info("Auto-closed {$count} tickets");

        return self::SUCCESS;
    }
}
