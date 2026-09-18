<?php

namespace App\Http\Controllers;

use App\Services\Orbit\OrbitService;
use Illuminate\Http\Request;
use RuntimeException;

class OrbitController extends Controller
{
    public function __construct(private readonly OrbitService $orbit)
    {
    }

    public function chat(Request $request)
    {
        $validated = $request->validate([
            'messages' => 'required|array|min:1|max:20',
            'messages.*.role' => 'required|in:user,assistant',
            'messages.*.content' => 'required|string|max:2000',
        ]);

        $messages = array_map(
            fn (array $m) => ['role' => $m['role'], 'content' => $m['content']],
            $validated['messages'],
        );

        // The Messages API requires the conversation to start with, and end on, a user turn.
        if ($messages[0]['role'] !== 'user' || end($messages)['role'] !== 'user') {
            return $this->fail('Conversation must start and end with a user message.', 422);
        }

        try {
            return $this->ok($this->orbit->chat($request->user(), $messages));
        } catch (RuntimeException $e) {
            return $this->fail($e->getMessage(), 503);
        }
    }
}
