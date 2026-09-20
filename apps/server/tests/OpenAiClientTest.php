<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Commands\OpenAiClient;

final class OpenAiClientTest extends TestCase
{
    public function test_extract_and_suggest_use_injected_http_transport(): void
    {
        $requests = [];
        $client = new OpenAiClient('test-key', static function (
            string $method,
            string $url,
            array $headers,
            array $payload,
        ) use (&$requests): array {
            $requests[] = compact('method', 'url', 'headers', 'payload');
            if (($payload['response_format']['json_schema']['name'] ?? null) === 'item_suggestions') {
                return ['choices' => [[
                    'message' => ['content' => '{"itemIds":["paper","not-in-catalog"]}'],
                ]]];
            }
            return ['choices' => [[
                'message' => ['content' => json_encode([
                    'intent' => 'find',
                    'itemText' => 'paper towels',
                    'quantity' => null,
                    'locationPath' => null,
                    'items' => null,
                ], JSON_THROW_ON_ERROR)],
            ]]];
        });

        self::assertSame([
            'intent' => 'find',
            'itemText' => 'paper towels',
        ], $client->extract('where are the paper towels'));
        self::assertSame([
            ['itemId' => 'paper', 'name' => 'Paper Towels'],
        ], $client->suggestItems('kitchen roll', [
            ['itemId' => 'paper', 'name' => 'Paper Towels'],
        ]));
        self::assertCount(2, $requests);
        self::assertStringContainsString('/chat/completions', $requests[0]['url']);
        self::assertContains('Authorization: Bearer test-key', $requests[0]['headers']);
    }

    public function test_transcribe_uses_audio_endpoint(): void
    {
        $client = new OpenAiClient('test-key', static function (
            string $method,
            string $url,
            array $headers,
            array $payload,
        ): array {
            self::assertStringContainsString('/audio/transcriptions', $url);
            self::assertSame('whisper-1', $payload['model']);
            self::assertSame('/tmp/clip.m4a', $payload['file']['path']);
            return ['text' => 'put hats in the cabinet'];
        });

        self::assertSame(
            'put hats in the cabinet',
            $client->transcribe('/tmp/clip.m4a', 'audio/mp4', 'clip.m4a'),
        );
    }
}
