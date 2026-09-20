<?php
declare(strict_types=1);

namespace Putaway\Web;

function escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrfInput(string $token): string
{
    return '<input type="hidden" name="_csrf" value="' . escape($token) . '">';
}

function csrfCookie(string $token): string
{
    return 'putaway_csrf=' . rawurlencode($token) . '; Path=/; HttpOnly; Secure; SameSite=Lax';
}

function layout(string $title, string $content, bool $signedIn = false): string
{
    $navigation = $signedIn
        ? '<nav><a href="/inventory">Inventory</a><a href="/places">Places</a></nav>'
        : '';

    return '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>' . escape($title) . ' · Putaway</title>
<style>
:root{font-family:system-ui,sans-serif;color:#17211b;background:#f4f7f4}
*{box-sizing:border-box}body{margin:0}header,main{max-width:960px;margin:auto;padding:1rem}
header{display:flex;justify-content:space-between;align-items:center}nav{display:flex;gap:1rem}
a{color:#17633a}section,.card{background:#fff;border:1px solid #dbe4dc;border-radius:.75rem;padding:1rem;margin-bottom:1rem}
form{display:flex;gap:.65rem;align-items:end;flex-wrap:wrap}label{display:grid;gap:.25rem;flex:1;min-width:10rem}
input,select,button{font:inherit;padding:.6rem;border:1px solid #a9b7ac;border-radius:.45rem}
button{background:#17633a;color:white;border-color:#17633a;cursor:pointer}.muted{color:#637168}
.notice{padding:.75rem;background:#e6f4ea;border-radius:.5rem}.error{background:#fde8e8;color:#842323}
.grid{display:grid;gap:.75rem}.place{margin-left:calc(var(--depth) * 1.25rem)}
@media(max-width:600px){header{align-items:flex-start}form>*{width:100%}}
</style>
</head>
<body><header><strong><a href="/">Putaway</a></strong>' . $navigation . '</header>
<main><h1>' . escape($title) . '</h1>' . $content . '</main></body></html>';
}
