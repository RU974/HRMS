<?php

namespace App\Models;

use App\Events\NotificationCreated;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationItem extends Model
{
    protected $table = 'notifications';

    protected $fillable = [
        'company_id',
        'title',
        'message',
        'type',
        'link',
        'is_read',
        'user_id',
        'created_by',
    ];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    protected static function booted(): void
    {
        // Push every new notification to its recipient live. A websocket server that is down
        // must never stop the notification from being saved, so failures are swallowed.
        static::created(function (self $item): void {
            if ($item->user_id) {
                rescue(
                    fn () => event(new NotificationCreated((int) $item->user_id, (int) $item->id, (string) $item->type, (string) $item->title, $item->link)),
                    null,
                    false
                );
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
