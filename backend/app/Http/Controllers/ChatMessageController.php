<?php

namespace App\Http\Controllers;

use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\Request;

class ChatMessageController extends Controller
{
    public function users()
    {
        return $this->ok(
            User::query()
                ->select(['id', 'name', 'email'])
                ->orderBy('name')
                ->get()
        );
    }

    public function index(Request $request)
    {
        $query = ChatMessage::query()->with(['sender:id,name,email', 'receiver:id,name,email']);

        if ($request->filled('q')) {
            $search = trim((string) $request->query('q'));
            $query->where('message', 'like', "%{$search}%");
        }

        if ($request->filled('sender_id')) {
            $query->where('sender_id', (int) $request->query('sender_id'));
        }

        if ($request->filled('receiver_id')) {
            $query->where('receiver_id', (int) $request->query('receiver_id'));
        }

        return $this->ok($query->latest()->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'receiver_id' => 'required|exists:users,id',
            'message' => 'required|string|max:5000',
        ]);

        $message = ChatMessage::create([
            'sender_id' => $request->user()->id,
            'receiver_id' => $validated['receiver_id'],
            'message' => $validated['message'],
            'is_read' => false,
        ]);

        return $this->ok($message->load(['sender:id,name,email', 'receiver:id,name,email']), 'Message sent successfully', 201);
    }

    public function show($id)
    {
        return $this->ok(ChatMessage::with(['sender:id,name,email', 'receiver:id,name,email'])->findOrFail($id));
    }

    public function update(Request $request, $id)
    {
        $message = ChatMessage::findOrFail($id);
        $validated = $request->validate([
            'message' => 'sometimes|string|max:5000',
            'is_read' => 'sometimes|boolean',
        ]);

        $message->update($validated);
        return $this->ok($message->load(['sender:id,name,email', 'receiver:id,name,email']), 'Message updated successfully');
    }

    public function destroy($id)
    {
        ChatMessage::findOrFail($id)->delete();
        return $this->ok(null, 'Message deleted successfully');
    }
}
