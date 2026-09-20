<?php
declare(strict_types=1);

namespace Putaway\Commands;

use Putaway\Auth\AuthService;
use Putaway\Http\Request;
use Putaway\Http\Response;
use Throwable;

final class CommandController
{
    public function __construct(
        private readonly CommandHandler $handler,
        private readonly Interpreter $interpreter,
        private readonly OpenAiClient $openAi,
        private readonly AuthService $auth,
    ) {
    }

    public function submit(Request $request): Response
    {
        $userId = $this->auth->userIdForBearer($request->bearerToken());
        if ($userId === null) {
            return Response::json([
                'type' => 'error',
                'code' => 'forbidden',
                'spoken' => 'Sign in required.',
            ], 401);
        }

        $json = $request->json();
        $householdId = $this->inputString($json, $request, 'householdId');
        $clientCommandId = $this->inputString($json, $request, 'clientCommandId');
        if ($householdId === null || $clientCommandId === null) {
            return Response::json($this->notCaught(), 400);
        }
        $preflight = $this->handler->preflight($userId, $householdId, $clientCommandId);
        if ($preflight !== null) {
            return Response::json($preflight);
        }

        $command = $json['command'] ?? null;
        if (!is_array($command)) {
            $transcript = is_string($json['transcript'] ?? null)
                ? $json['transcript']
                : $request->bodyParam('transcript');
            $audio = $request->uploadedFile('audio');
            if ($audio !== null) {
                if ($audio['error'] !== UPLOAD_ERR_OK) {
                    return Response::json($this->voiceUnavailable());
                }
                try {
                    $transcript = $this->openAi->transcribe(
                        $audio['tmp_name'],
                        $audio['type'] ?: 'application/octet-stream',
                        $audio['name'] ?: 'audio',
                    );
                } catch (Throwable) {
                    return Response::json($this->voiceUnavailable());
                }
            }
            if ($transcript === null) {
                return Response::json($this->notCaught(), 400);
            }
            $interpreted = $this->interpreter->interpret($transcript);
            if (($interpreted['type'] ?? null) === 'error') {
                return Response::json($interpreted);
            }
            if (($interpreted['type'] ?? null) === 'follow_up') {
                return Response::json([
                    'type' => 'clarification',
                    'spoken' => $interpreted['message'],
                    'clarification' => $interpreted,
                ]);
            }
            $command = $interpreted;
        }

        return Response::json(
            $this->handler->handle($userId, $householdId, $clientCommandId, $command),
        );
    }

    /** @param array<string, mixed> $json */
    private function inputString(array $json, Request $request, string $key): ?string
    {
        $value = is_string($json[$key] ?? null) ? $json[$key] : $request->bodyParam($key);
        if ($value === null || trim($value) === '') {
            return null;
        }
        return trim($value);
    }

    /** @return array{type: 'error', code: 'voice_unavailable', spoken: string} */
    private function voiceUnavailable(): array
    {
        return [
            'type' => 'error',
            'code' => 'voice_unavailable',
            'spoken' => 'Voice is unavailable — type it instead.',
        ];
    }

    /** @return array{type: 'error', code: 'not_caught', spoken: string} */
    private function notCaught(): array
    {
        return ['type' => 'error', 'code' => 'not_caught', 'spoken' => "I didn't catch that."];
    }
}
