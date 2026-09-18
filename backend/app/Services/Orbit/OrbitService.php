<?php

namespace App\Services\Orbit;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class OrbitService
{
    private const MAX_TOOL_ROUNDS = 5;

    public function isConfigured(): bool
    {
        return (string) config('services.anthropic.key') !== '';
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $history
     * @return array{reply: string, actions: array<int, array{label: string, path: string}>}
     */
    public function chat(User $user, array $history): array
    {
        if (!$this->isConfigured()) {
            throw new RuntimeException('Orbit is not configured yet. Ask your administrator to set ANTHROPIC_API_KEY.');
        }

        $tools = new OrbitTools($user);
        $system = $this->systemPrompt($user);
        $messages = $history;

        for ($round = 0; $round <= self::MAX_TOOL_ROUNDS; $round++) {
            $response = Http::withHeaders([
                'x-api-key' => config('services.anthropic.key'),
                'anthropic-version' => '2023-06-01',
            ])->timeout(45)->post(config('services.anthropic.url'), [
                'model' => config('services.anthropic.model'),
                'max_tokens' => 1024,
                'system' => $system,
                'tools' => $tools->definitions(),
                'messages' => $messages,
            ]);

            if ($response->failed()) {
                report(new RuntimeException('Orbit upstream error: ' . $response->status() . ' ' . $response->body()));
                throw new RuntimeException('Orbit is unavailable right now. Please try again shortly.');
            }

            $content = $response->json('content') ?? [];

            if ($response->json('stop_reason') !== 'tool_use') {
                $text = collect($content)->where('type', 'text')->pluck('text')->implode("\n");

                return ['reply' => trim($text) ?: "Sorry, I couldn't come up with an answer.", 'actions' => $tools->actions()];
            }

            $messages[] = ['role' => 'assistant', 'content' => $content];
            $results = [];
            foreach ($content as $block) {
                if (($block['type'] ?? '') !== 'tool_use') {
                    continue;
                }
                $input = is_array($block['input'] ?? null) ? $block['input'] : [];
                $results[] = [
                    'type' => 'tool_result',
                    'tool_use_id' => $block['id'],
                    'content' => json_encode($tools->run($block['name'], $input), JSON_UNESCAPED_UNICODE),
                ];
            }
            $messages[] = ['role' => 'user', 'content' => $results];
        }

        return ['reply' => 'That took too many steps. Could you try a simpler question?', 'actions' => $tools->actions()];
    }

    private function systemPrompt(User $user): string
    {
        $pages = collect((new OrbitPageCatalog())->forUser($user))
            ->map(fn ($p) => "- {$p['path']} — {$p['label']}: {$p['description']}")
            ->implode("\n");
        $today = now()->format('l, j F Y');

        return <<<PROMPT
You are Orbit, the built-in assistant of this HRMS (human resource management system). You help {$user->name} get work done faster: answering how-to questions, looking up their own HR data, and taking them to the right page.

Today is {$today}.

Rules:
- Be brief and friendly. Use short paragraphs or bullet lists; no headings.
- Use tools to fetch the user's real data instead of guessing. Never invent numbers, dates or records.
- You can only read the user's own data and company-wide public info. You cannot change anything; when the user wants to do something (apply for leave, raise a ticket, ...), explain the steps briefly and call navigate_to so they get a button to the right page.
- Only send the user to pages in the list below; these are the pages they have access to. If they ask for something outside it, say they don't have access and suggest contacting HR or an administrator.
- If something is unrelated to work or this HRMS, politely decline.

Pages available to this user:
{$pages}
PROMPT;
    }
}
