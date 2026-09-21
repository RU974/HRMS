<?php

namespace Tests\Feature;

use PHPUnit\Framework\TestCase;

/**
 * The browser subscribes to websocket events by exact name. Laravel broadcasts
 * an event under its class name (App\Events\CallSignalSent) unless the event
 * defines broadcastAs(), so a listener for ".call.signal" silently never fires
 * unless the backend declares that name. That mismatch once disabled every
 * realtime call feature without any error, so this test compares both sides.
 */
class RealtimeEventContractTest extends TestCase
{
    private const FRONTEND_CALL_EVENTS = __DIR__ . '/../../../build/src/lib/call-events.ts';
    private const FRONTEND_SRC = __DIR__ . '/../../../build/src';
    private const BACKEND_EVENTS = __DIR__ . '/../../app/Events';

    protected function setUp(): void
    {
        parent::setUp();

        if (!is_file(self::FRONTEND_CALL_EVENTS)) {
            $this->markTestSkipped('Frontend sources are not present next to the backend.');
        }
    }

    /** @return array<string, string> event name => class file */
    private function backendBroadcastNames(): array
    {
        $names = [];

        foreach (glob(self::BACKEND_EVENTS . '/*.php') as $file) {
            $source = file_get_contents($file);

            if (!str_contains($source, 'implements ShouldBroadcast')) {
                continue;
            }

            $this->assertMatchesRegularExpression(
                "/function broadcastAs\(\): string\s*\{\s*return '([^']+)';/",
                $source,
                basename($file) . ' is broadcast but has no broadcastAs(): the browser cannot listen for it by a stable name.'
            );

            preg_match("/function broadcastAs\(\): string\s*\{\s*return '([^']+)';/", $source, $m);
            $names[$m[1]] = basename($file);
        }

        return $names;
    }

    /** @return string[] */
    private function frontendCallEventNames(): array
    {
        $source = file_get_contents(self::FRONTEND_CALL_EVENTS);

        $this->assertSame(1, preg_match('/CALL_EVENT_NAMES[^=]*=\s*\[(.*?)\];/s', $source, $block), 'CALL_EVENT_NAMES not found');
        preg_match_all('/"([a-z_.]+)"/', $block[1], $matches);

        return $matches[1];
    }

    /** @return string[] chat event names the frontend listens for with a literal ".name" */
    private function frontendLiteralListeners(): array
    {
        $found = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(self::FRONTEND_SRC, \FilesystemIterator::SKIP_DOTS));

        foreach ($iterator as $file) {
            if (!preg_match('/\.(ts|tsx)$/', $file->getFilename()) || str_contains($file->getPathname(), DIRECTORY_SEPARATOR . 'test' . DIRECTORY_SEPARATOR)) {
                continue;
            }

            preg_match_all('/\.listen\(\s*"\.([a-z_]+(?:\.[a-z_]+)+)"/', file_get_contents($file->getPathname()), $m);
            array_push($found, ...$m[1]);
        }

        return array_values(array_unique($found));
    }

    public function test_every_broadcast_event_declares_a_stable_name(): void
    {
        $this->assertNotEmpty($this->backendBroadcastNames());
    }

    public function test_every_call_event_the_frontend_listens_for_is_broadcast_by_the_backend(): void
    {
        $backend = array_keys($this->backendBroadcastNames());

        foreach ($this->frontendCallEventNames() as $name) {
            $this->assertContains($name, $backend, "Frontend listens for '{$name}' but no backend event broadcasts it.");
        }
    }

    public function test_every_backend_call_event_is_handled_by_the_frontend(): void
    {
        $frontend = $this->frontendCallEventNames();

        foreach ($this->backendBroadcastNames() as $name => $file) {
            if (str_starts_with($file, 'Call')) {
                $this->assertContains($name, $frontend, "{$file} broadcasts '{$name}' but the frontend never listens for it.");
            }
        }
    }

    public function test_every_chat_event_the_frontend_listens_for_is_broadcast_by_the_backend(): void
    {
        $backend = array_keys($this->backendBroadcastNames());
        $listeners = array_filter($this->frontendLiteralListeners(), fn ($n) => str_starts_with($n, 'chat.'));

        $this->assertNotEmpty($listeners, 'Expected the chat UI to listen for chat.* events.');

        foreach ($listeners as $name) {
            $this->assertContains($name, $backend, "Frontend listens for '{$name}' but no backend event broadcasts it.");
        }
    }

    public function test_every_backend_chat_event_is_handled_by_the_frontend(): void
    {
        $listeners = $this->frontendLiteralListeners();

        foreach ($this->backendBroadcastNames() as $name => $file) {
            if (str_starts_with($file, 'Chat')) {
                $this->assertContains($name, $listeners, "{$file} broadcasts '{$name}' but the frontend never listens for it.");
            }
        }
    }
}
