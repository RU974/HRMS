<?php

namespace App\Services\Recruitment;

use App\Models\Candidate;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Smalot\PdfParser\Parser as PdfParser;
use Throwable;

/**
 * Pulls contact details, skills and experience out of an uploaded CV. Parsing is best effort:
 * it never throws, and a CV that cannot be read simply yields an empty result.
 */
class ResumeParserService
{
    private const MAX_TEXT = 100000;

    /** Skills recognised anywhere in the text (canonical display name => lowercase match terms). */
    private const SKILLS = [
        'PHP', 'Laravel', 'Symfony', 'WordPress', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express.js',
        'jQuery', 'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap', 'Redux', 'GraphQL', 'REST', 'API', 'Python', 'Django', 'Flask', 'FastAPI',
        'Java', 'Spring Boot', 'Kotlin', 'Swift', 'Objective-C', 'Flutter', 'React Native', 'Dart', 'C#', 'C++', '.NET', 'ASP.NET', 'Golang', 'Rust',
        'Ruby', 'Rails', 'Scala', 'SQL', 'MySQL', 'PostgreSQL', 'SQLite', 'MongoDB', 'Redis', 'Elasticsearch', 'Oracle', 'SQL Server',
        'Firebase', 'AWS', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'CI/CD', 'GitHub Actions',
        'Git', 'GitHub', 'GitLab', 'Linux', 'Bash', 'Nginx', 'Apache', 'RabbitMQ', 'Kafka', 'Microservices', 'Agile', 'Scrum', 'Kanban', 'Jira',
        'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'NLP', 'Data Analysis', 'Data Science', 'Pandas', 'NumPy', 'Power BI',
        'Tableau', 'Excel', 'Looker', 'ETL', 'Data Warehousing', 'Spark', 'Hadoop', 'Airflow', 'Cybersecurity', 'Penetration Testing',
        'Networking', 'Selenium', 'Cypress', 'Jest', 'PHPUnit', 'Unit Testing', 'QA', 'Manual Testing', 'Automation Testing', 'Figma',
        'Adobe XD', 'Photoshop', 'Illustrator', 'InDesign', 'UI Design', 'UX Design', 'Wireframing', 'Prototyping', 'Video Editing',
        'Graphic Design', 'SEO', 'SEM', 'Google Analytics', 'Google Ads', 'Content Writing', 'Copywriting', 'Social Media', 'Email Marketing',
        'Digital Marketing', 'Brand Management', 'Market Research', 'Public Relations', 'Sales', 'B2B', 'B2C', 'Lead Generation',
        'Negotiation', 'Customer Service', 'Customer Support', 'Account Management', 'CRM', 'Salesforce', 'HubSpot', 'Zendesk',
        'Project Management', 'Product Management', 'Stakeholder Management', 'Business Analysis', 'Requirements Gathering', 'Risk Management',
        'Change Management', 'Operations Management', 'Supply Chain', 'Logistics', 'Procurement', 'Inventory Management', 'Budgeting',
        'Forecasting', 'Financial Reporting', 'Financial Analysis', 'Accounting', 'Bookkeeping', 'Accounts Payable', 'Accounts Receivable',
        'Auditing', 'Taxation', 'Payroll', 'QuickBooks', 'SAP', 'Tally', 'IFRS', 'Recruitment', 'Talent Acquisition', 'Sourcing',
        'Onboarding', 'Employee Relations', 'Performance Management', 'Training and Development', 'Compensation and Benefits', 'HRIS',
        'Labor Law', 'Leadership', 'Team Management', 'Communication', 'Problem Solving', 'Time Management', 'Teamwork', 'Presentation',
        'Microsoft Office', 'PowerPoint', 'Outlook', 'Google Workspace', 'Mentoring', 'Compliance', 'Legal Research',
        'Contract Drafting', 'Nursing', 'Patient Care', 'Teaching', 'Curriculum Development',
    ];

    /** Skills that are also everyday words match only with this exact capitalisation. Acronyms always do. */
    private const CASE_SENSITIVE = ['Rust', 'Swift', 'Dart', 'Ruby', 'Spark', 'Excel', 'Oracle', 'Azure', 'Apache', 'Bash', 'Rails', 'Jest', 'Git', 'Flask', 'Sales', 'Sourcing'];

    private const NAME_STOP_WORDS = [
        'resume', 'curriculum', 'vitae', 'cv', 'profile', 'summary', 'objective', 'experience', 'education', 'skills', 'email', 'phone',
        'address', 'contact', 'page', 'mobile', 'linkedin', 'github', 'references', 'about', 'career', 'professional', 'personal',
        'details', 'information', 'work', 'history', 'engineer', 'developer', 'manager', 'designer', 'analyst', 'specialist',
    ];

    // ---- public API ------------------------------------------------------------

    /**
     * @return array{name: ?string, email: ?string, phone: ?string, skills: array<int, string>, experience_years: ?float, text: string}
     */
    public function parseFile(string $path, string $extension): array
    {
        $text = $this->extractText($path, $extension);
        $reason = null;

        if (! $this->looksReadable($text)) {
            // Scanned or image-only files carry no text layer. Try the optional OCR command, if one is configured.
            $ocr = app(ResumeOcrService::class)->read($path, $extension);

            if ($this->looksReadable($ocr)) {
                $text = $ocr;
            } else {
                $reason = $this->unreadableReason($extension, $text);
            }
        }

        $parsed = $this->parseText($text);

        // Optional second opinion for layouts the patterns could not follow; it only fills gaps.
        if ($reason === null && app(ResumeAiExtractor::class)->shouldHelp($parsed)) {
            $parsed = app(ResumeAiExtractor::class)->fill($parsed);
        }

        // Readable text that still yields no contact details or skills is more likely a layout the
        // parser cannot follow than a real resume with nothing in it, so a person should look.
        if ($reason === null && ! $parsed['email'] && ! $parsed['phone'] && ! $parsed['skills']) {
            $reason = 'no_details';
        }

        // Details were found but the name is a guess or missing, which is what staff rely on most.
        if ($reason === null && in_array($parsed['confidence']['name'] ?? null, [null, 'low'], true)) {
            $reason = 'name_unclear';
        }

        $parsed['review_reason'] = $reason;

        return $parsed;
    }

    /** A resume has to have at least a few real words before its text is trusted. */
    private function looksReadable(string $text): bool
    {
        return preg_match_all('/\p{L}{2,}/u', $text) >= 25;
    }

    private function unreadableReason(string $extension, string $text): string
    {
        if (trim($text) === '') {
            return in_array(strtolower($extension), ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'], true) ? 'no_text_layer' : 'unreadable';
        }

        return 'little_text';
    }

    /** @return array{name: ?string, email: ?string, phone: ?string, skills: array<int, string>, experience_years: ?float, text: string} */
    public function parseText(string $text): array
    {
        $text = $this->clean($text);

        $email = $this->findEmail($text);
        [$name, $nameConfidence] = $this->detectName($text, $email);
        [$experience, $experienceConfidence] = $this->detectExperience($text);
        $phone = $this->findPhone($text);
        $skills = $this->findSkills($text);

        return [
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'skills' => $skills,
            'experience_years' => $experience,
            // How sure each field is: high (read from a label or a clear pattern), medium (inferred),
            // low (a guess), or null when nothing was found. Recruiters see the low ones.
            'confidence' => [
                'name' => $name ? $nameConfidence : null,
                'email' => $email ? 'high' : null,
                'phone' => $phone ? 'medium' : null,
                'skills' => $skills ? 'high' : null,
                'experience_years' => $experience !== null ? $experienceConfidence : null,
            ],
            'text' => $text,
        ];
    }

    /**
     * Store the parse result on the candidate. Contact details only fill gaps; they never
     * overwrite what a recruiter has entered.
     */
    public function apply(Candidate $candidate, array $parsed): Candidate
    {
        $attributes = [
            'resume_text' => $parsed['text'] !== '' ? $parsed['text'] : null,
            'resume_parsed' => [
                'name' => $parsed['name'],
                'email' => $parsed['email'],
                'phone' => $parsed['phone'],
                'confidence' => $parsed['confidence'] ?? null,
                'ai_assisted' => $parsed['ai_assisted'] ?? false,
                'parsed_at' => now()->toIso8601String(),
            ],
            'skills' => $parsed['skills'] ?: null,
            'experience_years' => $parsed['experience_years'],
            'resume_review_reason' => $parsed['review_reason'] ?? null,
        ];

        if (! filled($candidate->phone) && filled($parsed['phone'])) {
            $attributes['phone'] = $parsed['phone'];
        }

        $candidate->update($attributes);

        try {
            app(FitScoringService::class)->rescore($candidate);
        } catch (Throwable $exception) {
            report($exception);
        }

        return $candidate;
    }

    public function parseStored(Candidate $candidate): ?Candidate
    {
        $path = $candidate->resume_path;

        if (! $path || ! Storage::disk(ResumeStorageService::DISK)->exists($path)) {
            return null;
        }

        $absolute = Storage::disk(ResumeStorageService::DISK)->path($path);

        return $this->apply($candidate, $this->parseFile($absolute, pathinfo($path, PATHINFO_EXTENSION)));
    }

    // ---- text extraction -------------------------------------------------------

    public function extractText(string $path, string $extension): string
    {
        try {
            return match (strtolower($extension)) {
                'pdf' => $this->pdfText($path),
                'docx' => $this->docxText($path),
                'doc' => $this->legacyDocText($path),
                'txt' => (string) file_get_contents($path),
                default => '',
            };
        } catch (Throwable $exception) {
            Log::info('Resume text extraction failed: ' . $exception->getMessage());

            return '';
        }
    }

    private function pdfText(string $path): string
    {
        return (new PdfParser())->parseFile($path)->getText();
    }

    private function docxText(string $path): string
    {
        $xml = $this->readZipEntry($path, 'word/document.xml');

        if ($xml === null) {
            return '';
        }

        $xml = preg_replace('/<w:(?:tab|br)\b[^>]*\/>/', ' ', $xml) ?? $xml;
        $xml = preg_replace('/<\/w:p>/', "\n", $xml) ?? $xml;

        return html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /** Legacy .doc is a binary format; readable text runs are the most we can safely recover. */
    private function legacyDocText(string $path): string
    {
        $binary = (string) file_get_contents($path, false, null, 0, 4 * 1024 * 1024);

        // Word stores text either as 8-bit runs or as UTF-16LE runs, so both are collected.
        preg_match_all('/[\x20-\x7E]{6,}/', $binary, $ascii);
        preg_match_all('/(?:[\x20-\x7E]\x00){6,}/', $binary, $wide);

        $runs = array_merge($ascii[0] ?? [], array_map(fn (string $run) => str_replace("\x00", '', $run), $wide[0] ?? []));
        // Drop the OLE and font-table noise that is also printable ASCII.
        $runs = array_filter($runs, fn (string $run) => ! preg_match('/^(?:Root Entry|WordDocument|SummaryInformation|DocumentSummaryInformation|CompObj|Times New Roman|Arial|Calibri|Normal\.dotm?|Microsoft (?:Office )?Word)/i', $run));

        return implode("\n", array_unique($runs));
    }

    /**
     * Minimal ZIP reader so DOCX works without the PHP zip extension.
     */
    private function readZipEntry(string $path, string $entry): ?string
    {
        $data = (string) file_get_contents($path, false, null, 0, 20 * 1024 * 1024);
        $eocd = strrpos($data, "PK\x05\x06");

        if ($eocd === false || strlen($data) < $eocd + 22) {
            return null;
        }

        $directory = unpack('vdisk/vstart/ventries/vtotal/Vsize/Voffset', substr($data, $eocd + 4, 18));
        $position = $directory['offset'];

        for ($i = 0; $i < $directory['total']; $i++) {
            if (substr($data, $position, 4) !== "PK\x01\x02") {
                return null;
            }

            $header = unpack('vmethod/vtime/vdate/Vcrc/Vcompressed/Vsize/vnameLen/vextraLen/vcommentLen', substr($data, $position + 10, 26));
            $localOffset = unpack('V', substr($data, $position + 42, 4))[1];
            $name = substr($data, $position + 46, $header['nameLen']);
            $position += 46 + $header['nameLen'] + $header['extraLen'] + $header['commentLen'];

            if ($name !== $entry) {
                continue;
            }

            if (substr($data, $localOffset, 4) !== "PK\x03\x04") {
                return null;
            }

            $local = unpack('vnameLen/vextraLen', substr($data, $localOffset + 26, 4));
            $payload = substr($data, $localOffset + 30 + $local['nameLen'] + $local['extraLen'], $header['compressed']);

            if ($header['method'] === 0) {
                return $payload;
            }

            $inflated = $header['method'] === 8 ? @gzinflate($payload, 20 * 1024 * 1024) : false;

            return $inflated === false ? null : $inflated;
        }

        return null;
    }

    // ---- field detection -------------------------------------------------------

    private function clean(string $text): string
    {
        $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
        $text = preg_replace('/[^\P{C}\n\t]+/u', ' ', $text) ?? '';
        $text = preg_replace('/[ \t\x{00A0}]+/u', ' ', $text) ?? '';
        $text = preg_replace('/\s*\n\s*/', "\n", $text) ?? '';
        $text = trim($text);

        return mb_substr($text, 0, self::MAX_TEXT);
    }

    private function findEmail(string $text): ?string
    {
        if (preg_match('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $text, $match)) {
            return mb_strtolower(rtrim($match[0], '.'));
        }

        return null;
    }

    private function findPhone(string $text): ?string
    {
        $labelled = '/(?:phone|mobile|cell|tel|contact|whatsapp)[^\d+\n]{0,12}(\+?\d[\d\s().\-]{7,18}\d)/i';

        if (preg_match($labelled, $text, $match) && $this->plausiblePhone($match[1])) {
            return trim($match[1]);
        }

        if (preg_match_all('/(?<![\d\/])(\+?\(?\d[\d\s().\-]{7,18}\d)(?![\d\/])/', $text, $matches)) {
            foreach ($matches[1] as $candidate) {
                if ($this->plausiblePhone($candidate)) {
                    return trim($candidate);
                }
            }
        }

        return null;
    }

    private function plausiblePhone(string $value): bool
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        if (strlen($digits) < 9 || strlen($digits) > 15) {
            return false;
        }

        // Two years side by side ("2018 - 2022") are not a phone number.
        return ! preg_match('/^\s*(?:19|20)\d{2}\s*[\-–]\s*(?:19|20)\d{2}\s*$/u', $value);
    }

    /** Lower-case words that sit inside names ("Abdul bin Rashid", "Maria de la Cruz"). */
    private const NAME_PARTICLES = ['bin', 'binti', 'bint', 'ibn', 'al', 'el', 'de', 'del', 'della', 'di', 'da', 'dos', 'van', 'von', 'der', 'den', 'la', 'le', 'ul', 'ur', 'abu'];

    /** @return array{0: ?string, 1: string} the name and how sure we are of it */
    private function detectName(string $text, ?string $email): array
    {
        // 1. An explicit label is the most reliable signal.
        if (preg_match('/^\s*(?:full\s+|candidate\s+)?name\s*[:\-–]\s*(.+)$/imu', $text, $labelled)) {
            $name = $this->asName($labelled[1]);

            if ($name !== null) {
                return [$name, 'high'];
            }
        }

        // 2. A name at the top of the page, alone on its line or followed by a job title ("Ayesha Malik | Engineer").
        $lines = array_slice(array_values(array_filter(array_map('trim', explode("\n", $text)))), 0, 12);

        foreach ($lines as $index => $line) {
            foreach (preg_split('/\s*(?:\||•|·|–|—|\s-\s|\/|,)\s*/u', $line) ?: [] as $segment) {
                $name = $this->asName($segment);

                if ($name !== null) {
                    return [$name, $index < 3 ? 'high' : 'medium'];
                }
            }
        }

        // 3. Last resort: "ayesha.malik@example.com" suggests "Ayesha Malik". A guess, so low confidence.
        if ($email) {
            $local = preg_replace('/\+.*$/', '', explode('@', $email)[0]) ?? '';
            $parts = preg_split('/[._\-]+/', $local) ?: [];

            if (count($parts) >= 2 && count($parts) <= 3 && collect($parts)->every(fn ($part) => preg_match('/^\p{L}{2,}$/u', $part))) {
                return [mb_convert_case(implode(' ', $parts), MB_CASE_TITLE, 'UTF-8'), 'low'];
            }
        }

        return [null, 'low'];
    }

    /** The text as a person's name, or null when it does not look like one. */
    private function asName(string $candidate): ?string
    {
        $candidate = trim($candidate, " \t-–:*•·");

        if ($candidate === '' || preg_match('/[\d@:\/\\\\|]/', $candidate)) {
            return null;
        }

        $words = preg_split('/\s+/', $candidate) ?: [];
        $count = count(array_filter($words, fn ($word) => ! in_array(mb_strtolower($word), self::NAME_PARTICLES, true)));

        if ($count < 2 || $count > 4 || count($words) > 6) {
            return null;
        }

        foreach ($words as $word) {
            $isParticle = in_array(mb_strtolower($word), self::NAME_PARTICLES, true);
            $isInitial = (bool) preg_match('/^\p{Lu}\.?$/u', $word);

            if (! $isParticle && ! $isInitial && ! preg_match('/^\p{L}[\p{L}\'.\-]*$/u', $word)) {
                return null;
            }

            if (in_array(mb_strtolower(rtrim($word, '.')), self::NAME_STOP_WORDS, true)) {
                return null;
            }
        }

        $isUpper = mb_strtoupper($candidate) === $candidate;
        $isCapitalised = collect($words)->every(fn ($word) => in_array(mb_strtolower($word), self::NAME_PARTICLES, true) || mb_strtoupper(mb_substr($word, 0, 1)) === mb_substr($word, 0, 1));

        if (! $isUpper && ! $isCapitalised) {
            return null;
        }

        // Particles stay lower-case, everything else is Title Case ("Abdul bin Rashid", "Mary-Ann O'Neil").
        return collect($words)
            ->map(fn ($word) => in_array(mb_strtolower($word), self::NAME_PARTICLES, true) ? mb_strtolower($word) : $this->titleWord($word))
            ->implode(' ');
    }

    /** "ALI" and "ali" become "Ali"; "McDonald" and "O'Neil" are already right and stay as written. */
    private function titleWord(string $word): string
    {
        $isMixed = $word !== mb_strtoupper($word) && $word !== mb_strtolower($word);

        if ($isMixed) {
            return $word;
        }

        return preg_replace_callback("/(^|['’\\-])(\\p{L})/u", fn ($m) => $m[1] . mb_strtoupper($m[2]), mb_strtolower($word)) ?? $word;
    }

    /** Dictionary skills mentioned in any text (used to read a job's requirements the same way a CV is read). @return array<int, string> */
    public function skillsIn(string $text): array
    {
        return $this->findSkills($this->clean($text));
    }

    /** @return array<int, string> */
    private function findSkills(string $text): array
    {
        $found = [];

        foreach (self::SKILLS as $skill) {
            $exact = in_array($skill, self::CASE_SENSITIVE, true) || ! preg_match('/\p{Ll}/u', $skill);
            $pattern = '/(?<![\p{L}\p{N}+#.])' . preg_quote($skill, '/') . '(?![\p{L}\p{N}+#]|\.[\p{L}\p{N}])/u' . ($exact ? '' : 'i');

            if (preg_match($pattern, $text)) {
                $found[mb_strtolower($skill)] = $skill;
            }
        }

        // Whatever the CV lists under a "Skills" heading is kept even when it is not in the dictionary.
        if (preg_match('/^\s*(?:technical\s+|key\s+|core\s+)?skills[^\n]{0,20}\n((?:.+\n?){1,12})/imu', $text, $section)) {
            foreach (preg_split('/[,;•·▪●|\n]+/u', $section[1]) ?: [] as $token) {
                $token = trim($token, " \t-–:*");

                if ($token === '' || mb_strlen($token) > 30 || str_word_count($token) > 3 || preg_match('/(experience|education|project|summary|profile|languages?|references?)\b/i', $token)) {
                    continue;
                }

                $found[mb_strtolower($token)] ??= $token;
            }
        }

        // People write "JS", "k8s" or "Postgres" instead of the dictionary spelling.
        foreach (self::SKILL_ALIASES as $canonical => $aliases) {
            if (isset($found[mb_strtolower($canonical)])) {
                continue;
            }

            foreach ($aliases as $alias) {
                if (preg_match('/(?<![\p{L}\p{N}+#.])' . preg_quote($alias, '/') . '(?![\p{L}\p{N}+#]|\.[\p{L}\p{N}])/iu', $text)) {
                    $found[mb_strtolower($canonical)] = $canonical;
                    break;
                }
            }
        }

        return array_slice(array_values($found), 0, 40);
    }

    /** Alternative spellings that mean a dictionary skill. */
    private const SKILL_ALIASES = [
        'JavaScript' => ['JS', 'ECMAScript', 'ES6'],
        'TypeScript' => ['TS'],
        'React' => ['ReactJS', 'React.js'],
        'Vue' => ['VueJS', 'Vue.js'],
        'Angular' => ['AngularJS'],
        'Node.js' => ['NodeJS', 'Node'],
        'PostgreSQL' => ['Postgres', 'Postgre SQL'],
        'MongoDB' => ['Mongo'],
        'MySQL' => ['My SQL'],
        'Kubernetes' => ['k8s'],
        'AWS' => ['Amazon Web Services'],
        'Azure' => ['Microsoft Azure'],
        'Golang' => ['Go lang'],
        'Power BI' => ['PowerBI'],
        'Excel' => ['MS Excel', 'Microsoft Excel'],
        'Microsoft Office' => ['MS Office', 'Office 365', 'Microsoft 365'],
        'REST' => ['RESTful', 'REST APIs', 'REST API'],
        'CI/CD' => ['CI-CD', 'Continuous Integration'],
        'Machine Learning' => ['ML'],
        'UI Design' => ['UI/UX', 'User Interface Design'],
        'UX Design' => ['User Experience Design'],
        'Customer Service' => ['Customer Care'],
        'Project Management' => ['PMP'],
        'Accounting' => ['Accountancy'],
        'Social Media' => ['Social Media Marketing'],
    ];

    /** @return array{0: ?float, 1: string} */
    private function detectExperience(string $text): array
    {
        $stated = $this->statedExperience($text);

        if ($stated !== null) {
            return [$stated, 'high'];
        }

        $months = $this->monthsFromDateRanges($text);

        return $months > 0 ? [round(min($months, 50 * 12) / 12, 1), 'medium'] : [null, 'low'];
    }

    private function findExperienceYears(string $text): ?float
    {
        return $this->detectExperience($text)[0];
    }

    private function statedExperience(string $text): ?float
    {
        $explicit = [];

        if (preg_match_all('/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\b/i', $text, $matches, PREG_OFFSET_CAPTURE)) {
            foreach ($matches[1] as [$years, $offset]) {
                $around = mb_strtolower(substr($text, max(0, $offset - 60), 140));

                if (str_contains($around, 'experience') && (float) $years <= 50) {
                    $explicit[] = (float) $years;
                }
            }
        }

        return $explicit ? max($explicit) : null;
    }

    /** Sum the months covered by "Jan 2019 - Mar 2022" / "2018 - Present" ranges, counting overlaps once. */
    private function monthsFromDateRanges(string $text): int
    {
        $months = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
        $start = "(?:(?:{$months})\\.?,?\\s+|\\d{1,2}\\s*[\\/.]\\s*)?(?:19|20)\\d{2}";
        $pattern = "/({$start})\\s*(?:-|–|—|to|till|until)\\s*(present|current|now|ongoing|today|till date|till now|to date|date|{$start})/iu";

        if (! preg_match_all($pattern, $text, $matches, PREG_SET_ORDER)) {
            return 0;
        }

        $now = Carbon::now();
        $intervals = [];

        foreach ($matches as $match) {
            $start = $this->toMonthIndex($match[1], false);
            $end = preg_match('/^(present|current|now|ongoing|today|till date|till now|to date|date)$/i', $match[2])
                ? $now->year * 12 + $now->month - 1
                : $this->toMonthIndex($match[2], true);

            if ($start === null || $end === null || $end < $start || $end > $now->year * 12 + $now->month) {
                continue;
            }

            $intervals[] = [$start, $end];
        }

        usort($intervals, fn ($a, $b) => $a[0] <=> $b[0]);

        $total = 0;
        $currentEnd = null;

        foreach ($intervals as [$start, $end]) {
            if ($currentEnd === null || $start > $currentEnd) {
                $total += $end - $start;
                $currentEnd = $end;
            } elseif ($end > $currentEnd) {
                $total += $end - $currentEnd;
                $currentEnd = $end;
            }
        }

        return $total;
    }

    /** Month number since year 0. A bare year counts as January at the start, December at the end. */
    private function toMonthIndex(string $value, bool $isEnd): ?int
    {
        if (! preg_match('/((?:19|20)\d{2})/', $value, $year)) {
            return null;
        }

        $month = $isEnd ? 11 : 0;

        if (preg_match('/^\s*(\d{1,2})\s*[\/.]/', $value, $numeric) && (int) $numeric[1] >= 1 && (int) $numeric[1] <= 12) {
            $month = (int) $numeric[1] - 1;
        } elseif (preg_match('/^\s*([a-z]{3})/i', $value, $name)) {
            $parsed = array_search(strtolower($name[1]), ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], true);
            $month = $parsed === false ? $month : $parsed;
        }

        return (int) $year[1] * 12 + $month;
    }
}
