<?php

return [
    /*
    | OCR for scanned CVs. Tesseract (plus Poppler's pdftoppm for PDFs) is used automatically when
    | installed. Override the locations here, or set a custom shell command containing {input}
    | that prints the recognised text on stdout (it then takes priority).
    */
    'ocr_command' => env('RECRUITMENT_OCR_COMMAND', ''),
    'tesseract_path' => env('RECRUITMENT_TESSERACT_PATH', ''),
    'pdftoppm_path' => env('RECRUITMENT_PDFTOPPM_PATH', ''),
    'ocr_language' => env('RECRUITMENT_OCR_LANGUAGE', 'eng'),
    'ocr_timeout' => (int) env('RECRUITMENT_OCR_TIMEOUT', 60),

    /*
    | Optional AI help for resumes the pattern-based parser cannot follow. OFF by default because it
    | sends the resume text to Anthropic's API. It only fills fields the patterns could not find.
    */
    'ai' => [
        'enabled' => (bool) env('RECRUITMENT_AI_PARSER', false),
        'api_key' => env('ANTHROPIC_API_KEY'),
        'model' => env('RECRUITMENT_AI_MODEL', 'claude-haiku-4-5-20251001'),
        'timeout' => (int) env('RECRUITMENT_AI_TIMEOUT', 20),
    ],
];
