<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ChatMessage extends Model
{
    use HasCompany, SoftDeletes;

    protected $fillable = [
        'company_id',
        'conversation_id',
        'sender_id',
        'receiver_id',
        'message',
        'is_read',
        'attachment_path',
        'attachment_name',
        'attachment_mime',
        'attachment_size',
        'edited_at',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'edited_at' => 'datetime',
        'attachment_size' => 'integer',
    ];

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'receiver_id');
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }

    public function hasAttachment(): bool
    {
        return !empty($this->attachment_path);
    }

    /**
     * Deleted messages stay in the thread as a "message deleted" placeholder,
     * so never leak their body or attachment metadata through the API.
     */
    public function toArray(): array
    {
        $data = parent::toArray();

        if ($this->trashed()) {
            $data['message'] = '';
            $data['attachment_path'] = null;
            $data['attachment_name'] = null;
            $data['attachment_mime'] = null;
            $data['attachment_size'] = null;
        }

        return $data;
    }
}
