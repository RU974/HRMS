<?php

// Builds a throwaway database for the recruitment browser check in build/e2e (see e2e/README.md).
// Run from anywhere with DB_DATABASE=hrms_scratch2 set. It never touches any other database.
$backend = dirname(__DIR__, 2);
chdir($backend);
require $backend . '/vendor/autoload.php';

$name = getenv('DB_DATABASE');
if ($name !== 'hrms_scratch2') {
    exit("Refusing to run: DB_DATABASE must be hrms_scratch2\n");
}

$pdo = new PDO('mysql:host=127.0.0.1;port=3306', 'root', '');
$pdo->exec("DROP DATABASE IF EXISTS `$name`");
$pdo->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$app = require $backend . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Candidate;
use App\Models\CandidateMessage;
use App\Models\Company;
use App\Models\Department;
use App\Models\Interview;
use App\Models\JobOpening;
use App\Models\License;
use App\Models\Offer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

Artisan::call('migrate:fresh', ['--force' => true]);
foreach ([Database\Seeders\PermissionSeeder::class, Database\Seeders\RoleSeeder::class, Database\Seeders\RolePermissionSeeder::class] as $seeder) {
    (new $seeder)->run();
}

$company = Company::create(['name' => 'Acme HR', 'careers_slug' => 'acme', 'careers_enabled' => true]);
License::create([
    'company_id' => $company->id, 'license_key' => License::generateKey(), 'product' => 'HRMS', 'edition' => 'enterprise',
    'licensee_name' => 'Acme HR', 'licensee_email' => 'license@example.test', 'status' => 'active', 'activated_at' => now(),
    'is_active' => true, 'features' => ['recruitment', 'approvals', 'communication'],
]);
$department = Department::create(['name' => 'Engineering', 'company_id' => $company->id]);

$user = User::create(['name' => 'Rita Recruiter', 'email' => 'recruiter@acme.test', 'password' => Hash::make('Password123!'), 'company_id' => $company->id]);
$user->syncRoles([Role::where('name', User::ROLE_RECRUITER)->whereNull('company_id')->firstOrFail()]);
$user->forceFill(['email_verified_at' => now()])->save();

$jobA = JobOpening::create([
    'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $company->id, 'employment_type' => 'full_time',
    'status' => 'open', 'open_positions' => 3, 'is_public' => true, 'recruiter_id' => $user->id,
    'requirements' => 'Must know PHP, Laravel and Docker. 5+ years of experience.', 'salary_max' => 100000, 'salary_currency' => 'PKR',
]);
$jobB = JobOpening::create([
    'title' => 'Platform Engineer', 'department_id' => $department->id, 'company_id' => $company->id, 'employment_type' => 'full_time',
    'status' => 'open', 'open_positions' => 1, 'is_public' => true, 'recruiter_id' => $user->id,
]);

$fit = app(App\Services\Recruitment\FitScoringService::class);
for ($i = 1; $i <= 30; $i++) {
    $skills = $i % 3 === 0 ? ['PHP', 'Laravel', 'Docker'] : ($i % 3 === 1 ? ['PHP'] : ['Excel']);
    $c = Candidate::create([
        'job_opening_id' => $jobA->id, 'company_id' => $company->id, 'full_name' => sprintf('Applicant %02d', $i),
        'email' => "applicant{$i}@example.test", 'stage' => 'applied', 'applied_at' => now()->toDateString(),
        'skills' => $skills, 'resume_text' => 'resume', 'experience_years' => $i % 8,
    ]);
    $fit->rescore($c);
}

$dupA = Candidate::create(['job_opening_id' => $jobA->id, 'company_id' => $company->id, 'full_name' => 'Dana Twin', 'email' => 'dana@example.test', 'phone' => '0300 5550001', 'stage' => 'screening', 'applied_at' => now()->toDateString()]);
$dupB = Candidate::create(['job_opening_id' => $jobB->id, 'company_id' => $company->id, 'full_name' => 'Dana Twin', 'email' => 'dana@example.test', 'stage' => 'applied', 'applied_at' => now()->toDateString(), 'tags' => ['second-job']]);

$portal = Candidate::create(['job_opening_id' => $jobA->id, 'company_id' => $company->id, 'full_name' => 'Portal Person', 'email' => 'portal@example.test', 'stage' => 'offer', 'applied_at' => now()->toDateString()]);
$interview = Interview::create(['candidate_id' => $portal->id, 'company_id' => $company->id, 'interviewer_name' => 'Panel', 'interview_type' => 'technical', 'scheduled_at' => now()->addDays(4)->setTime(11, 0), 'duration_minutes' => 60, 'status' => 'scheduled']);
Offer::create(['company_id' => $company->id, 'candidate_id' => $portal->id, 'created_by' => $user->id, 'salary' => 120000, 'currency' => 'PKR', 'status' => 'sent', 'sent_at' => now(), 'terms' => 'Three-month probation.']);

$pool = Candidate::create(['job_opening_id' => $jobB->id, 'company_id' => $company->id, 'full_name' => 'Pool Paula', 'email' => 'paula@example.test', 'stage' => 'rejected', 'rejection_reason' => 'Close call', 'talent_pool' => 'silver_medalist', 'pool_consent' => 'unconfirmed', 'talent_pool_expires_at' => now()->addMonths(12), 'applied_at' => now()->toDateString(), 'skills' => ['PHP', 'Laravel', 'Docker'], 'resume_text' => 'resume', 'experience_years' => 7]);

$links = app(App\Services\Recruitment\CandidatePortalService::class);
$tokens = [
    'portal' => $links->issueLink($portal)['token'],
    'pool' => $links->issueLink($pool)['token'],
];
CandidateMessage::create(['company_id' => $company->id, 'candidate_id' => $dupA->id, 'direction' => 'candidate', 'body' => 'Hello, is the role remote?']);

$out = getenv('E2E_DATA') ?: sys_get_temp_dir() . '/hrms-e2e/recruitment-seed.json';
@mkdir(dirname($out), 0777, true);
file_put_contents($out, json_encode(['tokens' => $tokens, 'dupA' => $dupA->id, 'dupB' => $dupB->id, 'portalId' => $portal->id, 'poolId' => $pool->id, 'jobA' => $jobA->id, 'interviewId' => $interview->id]));
echo "scratch ready: $out\n";
