<?php
declare(strict_types=1);

namespace Putaway\Auth;

use RuntimeException;

final class RateLimitExceeded extends RuntimeException
{
}
