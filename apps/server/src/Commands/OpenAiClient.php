<?php
declare(strict_types=1);

namespace Putaway\Commands;

use Closure;
use CURLFile;
use RuntimeException;

final class OpenAiClient
{
    private const BASE_URL = 'https://api.openai.com/v1';
    private readonly Closure $transport;

    /**
     * @param null|callable(string, string, list<string>, array<string, mixed>): array<string, mixed> $transport
     */
    public function __construct(
        private readonly string $apiKey,
        ?callable $transport = null,
    ) {
        $this->transport = $transport === null
            ? Closure::fromCallable([$this, 'curlTransport'])
            : Closure::fromCallable($transport);
    }

    /** @return array<string, mixed> */
    public function extract(string $transcript): array
    {
        $response = $this->request('/chat/completions', [
            'model' => 'gpt-4o-mini',
            'messages' => [
                ['role' => 'system', 'content' => $this->extractPrompt()],
                ['role' => 'user', 'content' => $transcript],
            ],
            'response_format' => [
                'type' => 'json_schema',
                'json_schema' => [
                    'name' => 'inventory_command',
                    'strict' => true,
                    'schema' => [
                        'type' => 'object',
                        'properties' => [
                            'intent' => [
                                'type' => 'string',
                                'enum' => ['put_away', 'take_out', 'find', 'find_usual'],
                            ],
                            'itemText' => ['type' => ['string', 'null']],
                            'quantity' => ['type' => ['integer', 'null'], 'minimum' => 1],
                            'locationPath' => [
                                'type' => ['array', 'null'],
                                'items' => ['type' => 'string'],
                            ],
                            'items' => [
                                'type' => ['array', 'null'],
                                'items' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'itemText' => ['type' => 'string'],
                                        'quantity' => [
                                            'type' => ['integer', 'null'],
                                            'minimum' => 1,
                                        ],
                                    ],
                                    'required' => ['itemText', 'quantity'],
                                    'additionalProperties' => false,
                                ],
                            ],
                        ],
                        'required' => [
                            'intent', 'itemText', 'quantity', 'locationPath', 'items',
                        ],
                        'additionalProperties' => false,
                    ],
                ],
            ],
        ]);
        $payload = $this->choiceJson($response);
        $result = ['intent' => $payload['intent'] ?? null];
        foreach (['itemText', 'quantity', 'locationPath'] as $field) {
            if (($payload[$field] ?? null) !== null) {
                $result[$field] = $payload[$field];
            }
        }
        if (is_array($payload['items'] ?? null)) {
            $result['items'] = array_map(static function (mixed $line): mixed {
                if (!is_array($line)) {
                    return $line;
                }
                if (($line['quantity'] ?? null) === null) {
                    unset($line['quantity']);
                }
                return $line;
            }, $payload['items']);
        }
        return $result;
    }

    /**
     * @param list<array{itemId: string, name: string}> $catalog
     * @return list<array{itemId: string, name: string}>
     */
    public function suggestItems(string $spoken, array $catalog): array
    {
        if ($catalog === []) {
            return [];
        }
        $response = $this->request('/chat/completions', [
            'model' => 'gpt-4o-mini',
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'Map the spoken item to catalog entries. Return only catalog IDs.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode(compact('spoken', 'catalog'), JSON_THROW_ON_ERROR),
                ],
            ],
            'response_format' => [
                'type' => 'json_schema',
                'json_schema' => [
                    'name' => 'item_suggestions',
                    'strict' => true,
                    'schema' => [
                        'type' => 'object',
                        'properties' => [
                            'itemIds' => ['type' => 'array', 'items' => ['type' => 'string']],
                        ],
                        'required' => ['itemIds'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
        ]);
        $ids = $this->choiceJson($response)['itemIds'] ?? [];
        if (!is_array($ids)) {
            return [];
        }
        $byId = array_column($catalog, null, 'itemId');
        $result = [];
        foreach (array_slice($ids, 0, 5) as $id) {
            if (is_string($id) && isset($byId[$id]) && !isset($result[$id])) {
                $result[$id] = $byId[$id];
            }
        }
        return array_values($result);
    }

    public function transcribe(string $path, string $mimeType, string $name): string
    {
        $response = $this->request('/audio/transcriptions', [
            'model' => 'whisper-1',
            'file' => ['path' => $path, 'mimeType' => $mimeType, 'name' => $name],
        ]);
        if (!is_string($response['text'] ?? null)) {
            throw new RuntimeException('OpenAI transcription returned no text');
        }
        return $response['text'];
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function request(string $path, array $payload): array
    {
        return ($this->transport)(
            'POST',
            self::BASE_URL . $path,
            ['Authorization: Bearer ' . $this->apiKey],
            $payload,
        );
    }

    /** @param array<string, mixed> $response @return array<string, mixed> */
    private function choiceJson(array $response): array
    {
        $content = $response['choices'][0]['message']['content'] ?? null;
        if (!is_string($content) || $content === '') {
            throw new RuntimeException('OpenAI returned no content');
        }
        $decoded = json_decode($content, true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new RuntimeException('OpenAI returned invalid content');
        }
        return $decoded;
    }

    /**
     * @param list<string> $headers
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function curlTransport(string $method, string $url, array $headers, array $payload): array
    {
        $isAudio = str_ends_with($url, '/audio/transcriptions');
        if ($isAudio) {
            $file = $payload['file'] ?? null;
            if (!is_array($file)) {
                throw new RuntimeException('Audio file is required');
            }
            $body = [
                'model' => $payload['model'],
                'file' => new CURLFile(
                    (string) $file['path'],
                    (string) $file['mimeType'],
                    (string) $file['name'],
                ),
            ];
        } else {
            $body = json_encode($payload, JSON_THROW_ON_ERROR);
            $headers[] = 'Content-Type: application/json';
        }
        $curl = curl_init($url);
        if ($curl === false) {
            throw new RuntimeException('Could not initialize OpenAI request');
        }
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $raw = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if (!is_string($raw) || $status < 200 || $status >= 300) {
            throw new RuntimeException('OpenAI request failed: ' . ($error ?: $status));
        }
        $decoded = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new RuntimeException('OpenAI returned invalid JSON');
        }
        return $decoded;
    }

    private function extractPrompt(): string
    {
        return 'Extract a household inventory command. For multiple products at one location, '
            . 'use put_away with items. Location paths must be outermost to innermost.';
    }
}
