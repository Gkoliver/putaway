<?php
declare(strict_types=1);

// Copy to config.php (gitignored). On cPanel: db host is always localhost;
// dbname/user match the MySQL® Databases entries (e.g. cpaneluser_putaway).

return [
    'db_dsn' => 'mysql:host=localhost;dbname=putaway;charset=utf8mb4',
    'db_user' => 'putaway',
    'db_pass' => '',
    'app_url' => 'https://put-away.com', // must be https:// in production (Secure cookies)
    'mail_from' => 'noreply@put-away.com', // cPanel mailbox on put-away.com
    'openai_api_key' => '', // server-side only; required for Talk voice/extract/suggest
    'session_ttl_seconds' => 60 * 60 * 24 * 30,
];
