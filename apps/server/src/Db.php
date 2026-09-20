<?php
declare(strict_types=1);

namespace Putaway;

use PDO;

final class Db
{
    private static ?PDO $pdo = null;

    private function __construct()
    {
    }

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            /** @var array{db_dsn: string, db_user: string, db_pass: string} $config */
            $config = require __DIR__ . '/../config/config.php';
            self::$pdo = new PDO(
                $config['db_dsn'],
                $config['db_user'],
                $config['db_pass'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ],
            );
        }

        return self::$pdo;
    }
}
