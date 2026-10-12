<?php

namespace App\Http\Controllers\Recruitment;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Recruitment\Concerns\EnsuresCompanyIsolation;
use App\Models\RecruitmentEmailTemplate;
use Illuminate\Http\Request;

/**
 * Saved candidate emails. Subject and body may use {{name}}, {{first_name}}, {{job}} and {{company}},
 * which are filled in per candidate when the email is sent.
 */
class EmailTemplateController extends Controller
{
    use EnsuresCompanyIsolation;

    public const STARTERS = [
        [
            'name' => 'Application received',
            'subject' => 'We received your application for {{job}}',
            'body' => "Hello {{first_name}},\n\nThank you for applying for {{job}} at {{company}}. We have received your application and our team will review it shortly. We will be in touch about next steps.\n\nKind regards,\nThe {{company}} hiring team",
        ],
        [
            'name' => 'Invitation to interview',
            'subject' => 'Interview invitation: {{job}}',
            'body' => "Hello {{first_name}},\n\nThank you for your interest in {{job}} at {{company}}. We would like to invite you to an interview. Please reply with the days and times that suit you and we will confirm the details.\n\nKind regards,\nThe {{company}} hiring team",
        ],
        [
            'name' => 'Request for documents',
            'subject' => 'Documents needed for your {{job}} application',
            'body' => "Hello {{first_name}},\n\nTo move your application for {{job}} forward, we need a few documents from you. Please upload them from your private candidate page or reply to this email.\n\nKind regards,\nThe {{company}} hiring team",
        ],
        [
            'name' => 'Not moving forward',
            'subject' => 'Update on your application for {{job}}',
            'body' => "Hello {{first_name}},\n\nThank you for the time you put into applying for {{job}} at {{company}}. After careful consideration we will not be moving forward with your application at this time. We appreciate your interest and wish you every success.\n\nKind regards,\nThe {{company}} hiring team",
        ],
        [
            'name' => 'Keep in touch',
            'subject' => 'Staying in touch about future roles',
            'body' => "Hello {{first_name}},\n\nYou made a strong impression when you applied for {{job}}. We would like to stay in touch about future openings at {{company}}. Please let us know if you are happy for us to keep your details on file.\n\nKind regards,\nThe {{company}} hiring team",
        ],
    ];

    private function rules(): array
    {
        return [
            'name' => 'required|string|max:120',
            'subject' => 'required|string|max:200',
            'body' => 'required|string|max:5000',
        ];
    }

    public function index(Request $request)
    {
        $this->authorizePermission($request, 'recruitment:view');

        return $this->ok(RecruitmentEmailTemplate::query()->orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $template = RecruitmentEmailTemplate::create($request->validate($this->rules()) + [
            'company_id' => $request->user()?->company_id,
            'created_by' => $request->user()?->id,
        ]);

        return $this->ok($template, 'Template saved', 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $template = $this->resolveTenantModel(RecruitmentEmailTemplate::class, $id);
        $template->update($request->validate($this->rules()));

        return $this->ok($template, 'Template updated');
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit', 'recruitment:delete']);

        $this->resolveTenantModel(RecruitmentEmailTemplate::class, $id)->delete();

        return $this->ok(null, 'Template deleted');
    }

    /** Add the ready-made templates the company does not have yet (matched by name). */
    public function addStarters(Request $request)
    {
        $this->authorizeAnyPermission($request, ['recruitment:create', 'recruitment:edit']);

        $existing = RecruitmentEmailTemplate::query()->pluck('name')->map(fn ($name) => mb_strtolower($name))->all();

        foreach (self::STARTERS as $starter) {
            if (! in_array(mb_strtolower($starter['name']), $existing, true)) {
                RecruitmentEmailTemplate::create($starter + [
                    'company_id' => $request->user()?->company_id,
                    'created_by' => $request->user()?->id,
                ]);
            }
        }

        return $this->ok(RecruitmentEmailTemplate::query()->orderBy('name')->get(), 'Starter templates added', 201);
    }
}
