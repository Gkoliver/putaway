<?php
declare(strict_types=1);

namespace Putaway\Commands;

use Closure;
use Throwable;

final class Interpreter
{
    private const WORD_QUANTITIES = [
        'a' => 1, 'an' => 1, 'one' => 1, 'two' => 2, 'three' => 3, 'four' => 4,
        'five' => 5, 'six' => 6, 'seven' => 7, 'eight' => 8, 'nine' => 9,
        'ten' => 10, 'eleven' => 11, 'twelve' => 12,
    ];

    private readonly Closure $extract;

    /** @param callable(string): mixed $extract */
    public function __construct(callable $extract)
    {
        $this->extract = Closure::fromCallable($extract);
    }

    /** @return array<string, mixed> */
    public function interpret(string $transcript): array
    {
        $transcript = trim($transcript);
        if ($transcript === '') {
            return $this->error('empty_transcript', "I didn't catch that.");
        }

        $regex = $this->parseRegex($transcript);
        if ($regex !== null) {
            return $regex;
        }

        try {
            return $this->normalize(($this->extract)($transcript));
        } catch (Throwable) {
            return $this->error('voice_unavailable', 'Voice is unavailable — type it instead.');
        }
    }

    /** @return array<string, mixed>|null */
    private function parseRegex(string $transcript): ?array
    {
        if (preg_match('/where do we (?:normally )?store\s+(.+)$/i', $transcript, $match) === 1) {
            return $this->single('find_usual', $this->withoutArticle($match[1]), 1);
        }
        if (preg_match('/where (?:are|is)\s+(?:the\s+)?(.+)$/i', $transcript, $match) === 1) {
            return $this->single('find', trim($match[1]), 1);
        }
        if (preg_match(
            '/^(?:i(?:[\'’]ve| have)?\s+taken(?:\s+out)?|i took(?:\s+out)?|took(?:\s+out)?|take(?:\s+out)?)\s+(.+)$/i',
            $transcript,
            $match,
        ) === 1) {
            [$item, $quantity] = $this->itemAndQuantity($this->stripUnit($match[1]));
            return $this->single('take_out', $item, $quantity);
        }
        if (preg_match('/^(.+?)\s+((?:in|on)\s+(?:the\s+)?.+)$/i', $transcript, $match) === 1) {
            $rawItem = preg_replace(
                '/^(?:i(?:[\'’]m| am)?\s+)?(?:put(?:ting)?(?:\s+away)?)\s+/i',
                '',
                trim($match[1]),
            ) ?? trim($match[1]);
            [$item, $quantity] = $this->itemAndQuantity($rawItem);
            if ($item !== '') {
                return $this->single(
                    'put_away',
                    $item,
                    $quantity,
                    $this->locationPath($match[2]),
                );
            }
        }
        return null;
    }

    /** @return array<string, mixed> */
    private function normalize(mixed $raw): array
    {
        if (!is_array($raw) || !isset($raw['intent']) || !is_string($raw['intent'])) {
            return $this->followUp();
        }
        $intent = $raw['intent'];
        if (!in_array($intent, ['put_away', 'take_out', 'find', 'find_usual'], true)) {
            return $this->followUp();
        }

        $path = $this->stringList($raw['locationPath'] ?? null);
        $items = [];
        if (is_array($raw['items'] ?? null)) {
            foreach ($raw['items'] as $line) {
                if (!is_array($line) || !is_string($line['itemText'] ?? null)) {
                    continue;
                }
                $name = trim($line['itemText']);
                $quantity = $line['quantity'] ?? 1;
                if ($name !== '' && is_int($quantity) && $quantity > 0) {
                    $items[] = ['itemText' => $name, 'quantity' => $quantity];
                }
            }
        }
        if ($intent === 'put_away' && count($items) >= 2 && $path !== []) {
            return ['intent' => 'put_away_batch', 'locationPath' => $path, 'items' => $items];
        }

        if (!is_string($raw['itemText'] ?? null) || trim($raw['itemText']) === '') {
            return $this->followUp();
        }
        $quantity = $raw['quantity'] ?? 1;
        if (!is_int($quantity) || $quantity < 1) {
            $quantity = 1;
        }
        return $this->single($intent, trim($raw['itemText']), $quantity, $path ?: null);
    }

    /** @return array{0: string, 1: int} */
    private function itemAndQuantity(string $raw): array
    {
        $raw = trim($raw);
        $words = implode('|', array_keys(self::WORD_QUANTITIES));
        if (preg_match('/^(?:(\d{1,2})|(' . $words . '))\s+(?:of\s+)?(.+)$/i', $raw, $match) !== 1) {
            return [$raw, 1];
        }
        $quantity = $match[1] !== ''
            ? (int) $match[1]
            : self::WORD_QUANTITIES[strtolower($match[2])];
        return [trim($match[3]), max(1, $quantity)];
    }

    private function stripUnit(string $raw): string
    {
        $raw = preg_replace('/^the\s+/i', '', trim($raw)) ?? trim($raw);
        return preg_replace(
            '/^(?:a|an|\d+)\s+(?:rolls?|packs?|boxes?|bottles?|cans?|bags?|cases?)\s+of\s+/i',
            '',
            $raw,
        ) ?? $raw;
    }

    private function withoutArticle(string $raw): string
    {
        return trim(preg_replace('/^the\s+/i', '', trim($raw)) ?? trim($raw));
    }

    /** @return list<string> */
    private function locationPath(string $phrase): array
    {
        $phrase = preg_replace('/^(?:in|on)\s+/i', '', trim($phrase)) ?? trim($phrase);
        $parts = preg_split('/\s+(?:in|on)\s+/i', $phrase) ?: [];
        $parts = array_values(array_filter(array_map(
            fn (string $part): string => $this->withoutArticle($part),
            $parts,
        )));
        if (count($parts) <= 1) {
            return $parts;
        }
        preg_match_all('/\b(in|on)\b/i', $phrase, $matches);
        $prepositions = array_map('strtolower', $matches[1] ?? []);
        $on = array_search('on', $prepositions, true);
        $in = array_search('in', $prepositions, true);
        if ($on !== false && $in !== false && $on < $in) {
            return array_reverse($parts);
        }
        if ($in !== false && $on !== false && $in < $on) {
            return $parts;
        }
        return array_reverse($parts);
    }

    /** @return list<string> */
    private function stringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $result = [];
        foreach ($value as $entry) {
            if (is_string($entry) && trim($entry) !== '') {
                $result[] = trim($entry);
            }
        }
        return $result;
    }

    /** @param list<string>|null $locationPath @return array<string, mixed> */
    private function single(
        string $intent,
        string $itemText,
        int $quantity,
        ?array $locationPath = null,
    ): array {
        $command = compact('intent', 'itemText', 'quantity');
        if ($locationPath !== null) {
            $command['locationPath'] = $locationPath;
        }
        return $command;
    }

    /** @return array{type: 'follow_up', message: string} */
    private function followUp(): array
    {
        return ['type' => 'follow_up', 'message' => 'What item do you mean?'];
    }

    /** @return array{type: 'error', code: string, spoken: string} */
    private function error(string $code, string $spoken): array
    {
        return ['type' => 'error', 'code' => $code, 'spoken' => $spoken];
    }
}
