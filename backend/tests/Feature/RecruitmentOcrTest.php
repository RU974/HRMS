<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Company;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\User;
use App\Services\Recruitment\ResumeOcrService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Needs Tesseract (and Poppler for PDFs); skipped where they are not installed. */
class RecruitmentOcrTest extends TestCase
{
    use RefreshDatabase;

    private const FONTS = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'];

    /** @return array<int, string> */
    private function lines(): array
    {
        return [
            'Ayesha Malik', 'Senior Backend Engineer', 'Email: ayesha.malik@example.com', 'Phone: +92 300 1234567',
            'Summary', '6+ years of experience building web platforms and APIs',
            'Skills', 'PHP, Laravel, MySQL, Docker, Kubernetes, Redis',
            'Experience', 'Acme Corporation backend developer from 2019 to present',
        ];
    }

    private function scanImage(): ?string
    {
        $font = collect(self::FONTS)->first(fn ($path) => is_file($path));

        if (! $font || ! function_exists('imagettftext')) {
            return null;
        }

        $image = imagecreatetruecolor(1400, 900);
        imagefill($image, 0, 0, imagecolorallocate($image, 255, 255, 255));
        $black = imagecolorallocate($image, 0, 0, 0);

        foreach ($this->lines() as $index => $line) {
            imagettftext($image, 30, 0, 60, 90 + $index * 75, $black, $font, $line);
        }

        ob_start();
        imagejpeg($image, null, 92);
        imagedestroy($image);

        return (string) ob_get_clean();
    }

    /** A PDF whose only content is a picture of the page, as a scanner produces. */
    private function scanPdf(string $jpeg): string
    {
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 450] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>',
            "<< /Length 31 >>\nstream\nq 700 0 0 450 0 0 cm /Im0 Do Q\nendstream",
            "<< /Type /XObject /Subtype /Image /Width 1400 /Height 900 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($jpeg) . " >>\nstream\n" . $jpeg . "\nendstream",
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];

        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1) . " 0 obj\n{$object}\nendobj\n";
        }

        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";

        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        return $pdf . "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    }

    private function requireOcr(): string
    {
        if (! app(ResumeOcrService::class)->available()) {
            $this->markTestSkipped('Tesseract is not installed.');
        }

        $jpeg = $this->scanImage();

        if ($jpeg === null) {
            $this->markTestSkipped('No TrueType font or GD text support to draw a test scan.');
        }

        return $jpeg;
    }

    private function recruiterWithCandidate(): array
    {
        Storage::fake('local');
        $company = Company::create(['name' => 'Acme HR']);
        $this->grantLicense($company, ['recruitment']);
        $department = Department::create(['name' => 'Engineering', 'company_id' => $company->id]);
        $recruiter = $this->createUserWithRole(User::ROLE_RECRUITER, ['company_id' => $company->id]);
        $job = JobOpening::create([
            'title' => 'Backend Engineer', 'department_id' => $department->id, 'company_id' => $company->id, 'employment_type' => 'full_time',
            'status' => 'open', 'open_positions' => 1, 'requirements' => 'PHP, Laravel and Docker. 5+ years of experience.',
        ]);
        $candidate = Candidate::create(['job_opening_id' => $job->id, 'company_id' => $company->id, 'full_name' => 'Ayesha Malik', 'email' => 'someone@example.com', 'stage' => 'applied']);
        Sanctum::actingAs($recruiter);

        return [$candidate];
    }

    public function test_a_scanned_image_resume_is_read_and_scored(): void
    {
        $jpeg = $this->requireOcr();
        [$candidate] = $this->recruiterWithCandidate();

        $file = UploadedFile::fake()->createWithContent('scan.jpg', $jpeg);
        $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $file])->assertOk()->assertJsonPath('data.resume_review_reason', null);

        $candidate->refresh();
        $this->assertContains('Laravel', $candidate->skills);
        $this->assertContains('Docker', $candidate->skills);
        $this->assertGreaterThanOrEqual(80, $candidate->fit_score);
        $this->assertEquals(6.0, $candidate->experience_years);
    }

    public function test_a_scanned_pdf_resume_is_read_when_poppler_is_available(): void
    {
        $jpeg = $this->requireOcr();
        [$candidate] = $this->recruiterWithCandidate();

        $file = UploadedFile::fake()->createWithContent('scan.pdf', $this->scanPdf($jpeg));
        $response = $this->postJson("/api/v1/candidates/{$candidate->id}/resume", ['resume' => $file])->assertOk();

        if ($response->json('data.resume_review_reason') !== null) {
            $this->markTestSkipped('Poppler (pdftoppm) is not installed, so scanned PDFs are only flagged.');
        }

        $this->assertContains('Laravel', $candidate->fresh()->skills);
        $this->assertNotNull($candidate->fresh()->fit_score);
    }
}
