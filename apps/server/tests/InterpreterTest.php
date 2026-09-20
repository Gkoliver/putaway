<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;
use Putaway\Commands\Interpreter;

final class InterpreterTest extends TestCase
{
    public function test_parses_regex_commands_before_calling_openai(): void
    {
        $calls = 0;
        $interpreter = new Interpreter(function (string $transcript) use (&$calls): array {
            $calls++;
            return [];
        });

        self::assertSame([
            'intent' => 'put_away',
            'itemText' => 'paper towels',
            'quantity' => 2,
            'locationPath' => ['basement'],
        ], $interpreter->interpret("I'm putting two paper towels in the basement"));
        self::assertSame([
            'intent' => 'take_out',
            'itemText' => 'paper towels',
            'quantity' => 2,
        ], $interpreter->interpret('I took out two paper towels'));
        self::assertSame([
            'intent' => 'find',
            'itemText' => 'paper towels',
            'quantity' => 1,
        ], $interpreter->interpret('where are the paper towels'));
        self::assertSame([
            'intent' => 'find_usual',
            'itemText' => 'paper towels',
            'quantity' => 1,
        ], $interpreter->interpret('where do we normally store paper towels'));
        self::assertSame(0, $calls);
    }

    public function test_uses_openai_extract_for_batch_and_normalizes_it(): void
    {
        $interpreter = new Interpreter(static fn (string $transcript): array => [
            'intent' => 'put_away',
            'locationPath' => ['basement', 'shelves', 'bottom shelf'],
            'items' => [
                ['itemText' => 'dishwasher detergent'],
                ['itemText' => 'paper towels'],
                ['itemText' => 'dawn', 'quantity' => 2],
            ],
        ]);

        self::assertSame([
            'intent' => 'put_away_batch',
            'locationPath' => ['basement', 'shelves', 'bottom shelf'],
            'items' => [
                ['itemText' => 'dishwasher detergent', 'quantity' => 1],
                ['itemText' => 'paper towels', 'quantity' => 1],
                ['itemText' => 'dawn', 'quantity' => 2],
            ],
        ], $interpreter->interpret('A long ramble listing several products'));
    }

    public function test_returns_mobile_error_shapes_for_empty_or_failed_extract(): void
    {
        $interpreter = new Interpreter(static function (string $transcript): array {
            throw new RuntimeException('OpenAI unavailable');
        });

        self::assertSame([
            'type' => 'error',
            'code' => 'empty_transcript',
            'spoken' => "I didn't catch that.",
        ], $interpreter->interpret('  '));
        self::assertSame([
            'type' => 'error',
            'code' => 'voice_unavailable',
            'spoken' => 'Voice is unavailable — type it instead.',
        ], $interpreter->interpret('hello'));
    }
}
