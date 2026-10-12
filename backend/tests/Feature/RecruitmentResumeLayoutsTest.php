<?php

namespace Tests\Feature;

use App\Services\Recruitment\ResumeParserService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Resume layouts that are not the tidy "name, then details" CV. */
class RecruitmentResumeLayoutsTest extends TestCase
{
    private function parse(string $text): array
    {
        return app(ResumeParserService::class)->parseText($text);
    }

    private function filler(): string
    {
        return str_repeat('Responsible for delivering reliable projects together with colleagues across several departments. ', 3);
    }

    public function test_a_labelled_name_wins_over_whatever_is_on_top(): void
    {
        $parsed = $this->parse("CURRICULUM VITAE\nPersonal Details\nFull Name: Bilal Ahmed\nContact: 0300-1234567\nbilal@example.com\n");

        $this->assertSame('Bilal Ahmed', $parsed['name']);
        $this->assertSame('high', $parsed['confidence']['name']);
    }

    public function test_a_name_followed_by_a_job_title_on_the_same_line_is_read(): void
    {
        $this->assertSame('Sara Khan', $this->parse("SARA KHAN | Senior Accountant\nsara@example.com\n+92 300 1112223")['name']);
        $this->assertSame('Omar Farooq', $this->parse("Omar Farooq – Product Manager\nomar@example.com")['name']);
        $this->assertSame('Linh Tran', $this->parse("Linh Tran, Data Analyst\nlinh@example.com")['name']);
    }

    public function test_names_with_particles_initials_and_hyphens_are_kept(): void
    {
        $this->assertSame('Abdul bin Rashid', $this->parse("ABDUL BIN RASHID\nabdul@example.com")['name']);
        $this->assertSame('Maria de la Cruz', $this->parse("Maria de la Cruz\nmaria@example.com")['name']);
        $this->assertSame('A. Malik', $this->parse("A. Malik\namalik@example.com")['name']);
        $this->assertSame("Mary-Ann O'Neil", $this->parse("Mary-Ann O'Neil\nmary@example.com")['name']);
    }

    public function test_job_titles_and_section_headings_are_not_taken_for_names(): void
    {
        $parsed = $this->parse("Professional Summary\nSenior Backend Engineer\nWork History\nsomeone.real@example.com");

        $this->assertNotContains($parsed['name'], ['Professional Summary', 'Senior Backend Engineer', 'Work History']);
        // The only evidence left is the email address, so it is offered as a low-confidence guess.
        $this->assertSame('Someone Real', $parsed['name']);
        $this->assertSame('low', $parsed['confidence']['name']);
    }

    public function test_a_guessed_or_missing_name_flags_the_resume_for_a_person(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'cv') . '.txt';
        file_put_contents($path, "Email: sana.iqbal@example.com\nSkills: Excel, Payroll\n" . $this->filler());

        $parsed = app(ResumeParserService::class)->parseFile($path, 'txt');
        @unlink($path);

        $this->assertSame('Sana Iqbal', $parsed['name']);
        $this->assertSame('name_unclear', $parsed['review_reason']);
    }

    public function test_alternative_spellings_of_skills_are_recognised(): void
    {
        $skills = $this->parse("Ali Raza\nTools: JS, ReactJS, NodeJS, Postgres, k8s, MS Excel, Amazon Web Services and RESTful services")['skills'];

        foreach (['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Kubernetes', 'Excel', 'AWS', 'REST'] as $expected) {
            $this->assertContains($expected, $skills, "{$expected} was not recognised");
        }
    }

    public function test_numeric_and_worded_date_ranges_count_as_experience(): void
    {
        $numeric = $this->parse("Ali Raza\nAcme Ltd 03/2019 - 06/2022");
        $this->assertEqualsWithDelta(3.3, $numeric['experience_years'], 0.1);
        $this->assertSame('medium', $numeric['confidence']['experience_years']);

        $worded = $this->parse("Ali Raza\nAcme Ltd March 2019 until June 2022");
        $this->assertEqualsWithDelta(3.3, $worded['experience_years'], 0.1);

        $stated = $this->parse("Ali Raza\nOver 8 years of professional experience");
        $this->assertEquals(8.0, $stated['experience_years']);
        $this->assertSame('high', $stated['confidence']['experience_years']);
    }

    public function test_every_field_reports_how_sure_it_is(): void
    {
        $parsed = $this->parse("Ayesha Malik\nEmail: ayesha@example.com\nPhone: +92 300 1234567\nSkills\nPHP, Laravel\n6+ years of experience");

        $this->assertSame(['name' => 'high', 'email' => 'high', 'phone' => 'medium', 'skills' => 'high', 'experience_years' => 'high'], $parsed['confidence']);
        $this->assertSame(['name' => null, 'email' => null, 'phone' => null, 'skills' => null, 'experience_years' => null], $this->parse('')['confidence']);
    }

    // ---- optional AI help -----------------------------------------------------------------

    private function enableAi(): void
    {
        config(['recruitment.ai.enabled' => true, 'recruitment.ai.api_key' => 'test-key']);
    }

    private function unreadableByPatterns(): string
    {
        // Real prose, but no name line, no labelled contact details and no dictionary skills.
        return "worked mostly with horses and farm equipment for many years\nmanaged seasonal staff and kept the books\n" . $this->filler();
    }

    private function parseFileWith(string $text): array
    {
        $path = tempnam(sys_get_temp_dir(), 'cv') . '.txt';
        file_put_contents($path, $text);
        $parsed = app(ResumeParserService::class)->parseFile($path, 'txt');
        @unlink($path);

        return $parsed;
    }

    public function test_ai_help_is_off_by_default_and_sends_nothing(): void
    {
        Http::fake();

        $parsed = $this->parseFileWith($this->unreadableByPatterns());

        Http::assertNothingSent();
        $this->assertSame('no_details', $parsed['review_reason']);
    }

    public function test_ai_fills_only_the_gaps_the_patterns_left(): void
    {
        $this->enableAi();
        Http::fake(['api.anthropic.com/*' => Http::response(['content' => [['type' => 'text', 'text' => 'Here you go: {"name": "Zainab Qureshi", "skills": ["Farm management", "Bookkeeping"], "experience_years": 12}']]])]);

        $parsed = $this->parseFileWith($this->unreadableByPatterns());

        $this->assertSame('Zainab Qureshi', $parsed['name']);
        $this->assertContains('Farm management', $parsed['skills']);
        $this->assertEquals(12.0, $parsed['experience_years']);
        $this->assertTrue($parsed['ai_assisted']);
        $this->assertSame('medium', $parsed['confidence']['name']);

        Http::assertSent(fn ($request) => $request->hasHeader('x-api-key', 'test-key')
            && str_contains($request['messages'][0]['content'], 'horses')
            && $request['model'] === 'claude-haiku-4-5-20251001');
    }

    public function test_ai_never_overrides_what_the_patterns_found_and_is_not_asked_when_nothing_is_missing(): void
    {
        $this->enableAi();
        Http::fake(['api.anthropic.com/*' => Http::response(['content' => [['type' => 'text', 'text' => '{"name": "Wrong Person", "skills": ["Nonsense"], "experience_years": 1}']]])]);

        $complete = $this->parseFileWith("Ayesha Malik\nEmail: ayesha@example.com\nSkills\nPHP, Laravel\n6+ years of experience\n" . $this->filler());
        Http::assertNothingSent();
        $this->assertSame('Ayesha Malik', $complete['name']);

        // Name and skills are missing, experience is stated: only the missing ones may change.
        $partial = $this->parseFileWith("Contact: someone@example.com\n8 years of experience in farming\n" . $this->filler());
        $this->assertEquals(8.0, $partial['experience_years']);
        $this->assertContains('Nonsense', $partial['skills']);
    }

    public function test_an_ai_failure_leaves_the_pattern_result_alone(): void
    {
        $this->enableAi();
        Http::fake(['api.anthropic.com/*' => Http::response('boom', 500)]);

        $parsed = $this->parseFileWith($this->unreadableByPatterns());

        $this->assertSame('no_details', $parsed['review_reason']);
        $this->assertArrayNotHasKey('ai_assisted', $parsed);

        Http::fake(['api.anthropic.com/*' => Http::response(['content' => [['type' => 'text', 'text' => 'not json at all']]])]);
        $this->assertSame('no_details', $this->parseFileWith($this->unreadableByPatterns())['review_reason']);
    }
}
