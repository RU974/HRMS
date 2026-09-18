<?php

namespace App\Models;

use App\Models\Concerns\HasCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Ticket extends Model
{
    use HasUuids, HasCompany, SoftDeletes;

    protected $fillable = [
        'company_id',
        'created_by',
        'assigned_to',
        'department_id',
        'category',
        'priority',
        'status',
        'title',
        'description',
        'resolved_at',
        'closed_at',
        'closed_by',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(TicketComment::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(TicketAttachment::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(TicketActivity::class)->orderBy('created_at');
    }

    /**
     * Eloquent snake_cases relation names for array/JSON output, which makes
     * the createdBy/assignedTo relations collide with the created_by/
     * assigned_to foreign key columns and silently overwrite the scalar id
     * with the relation object. Restore both: the scalar id stays under the
     * snake_case key, the relation object is exposed under its own
     * camelCase key — matching what every API consumer (frontend TicketUser
     * types) already expects.
     */
    public function toArray(): array
    {
        $array = parent::toArray();

        if ($this->relationLoaded('createdBy')) {
            $array['created_by'] = $this->getAttribute('created_by');
            $array['createdBy'] = $this->getRelation('createdBy')?->toArray();
        }

        if ($this->relationLoaded('assignedTo')) {
            $array['assigned_to'] = $this->getAttribute('assigned_to');
            $array['assignedTo'] = $this->getRelation('assignedTo')?->toArray();
        }

        return $array;
    }
}
