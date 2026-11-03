// Сборка index.html для GitHub Pages из yield-forecast.html.
// yield-forecast.html написан для Claude-артефакта: обёртку (doctype, head, charset, viewport) там добавляет платформа.
// Здесь эта обёртка добавляется явно, чтобы страница одинаково открывалась на любом хостинге.
// Запуск: node collector/build-site.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'yield-forecast.html');
const OUT = path.join(ROOT, 'index.html');

const src = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '');
const cut = src.indexOf('</style>');
if (cut < 0) throw new Error('В yield-forecast.html не найден блок <style>');
const head = src.slice(0, cut + '</style>'.length).trim();
const body = src.slice(cut + '</style>'.length).trim();

// Тот же минимальный сброс стилей, что даёт платформа артефактов
const reset = `<style>
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>`;

const html = `<!doctype html>
<!-- Файл собран автоматически из yield-forecast.html командой: node collector/build-site.mjs. Правьте исходник, а не этот файл. -->
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Каким будет урожай: понятный прогноз по погоде этого лета и калькулятор урожая для своего огорода.">
${reset}
${head}
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Готово: ${path.relative(ROOT, OUT)} (${(html.length / 1024).toFixed(0)} КБ)`);
