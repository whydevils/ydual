// Unit tests for pure functions — no browser required.
// Extracts functions from source files and tests them with node:test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const contentSrc = readFileSync(`${__dir}/../src/content.js`, 'utf8');
const backgroundSrc = readFileSync(`${__dir}/../src/background.js`, 'utf8');

function extract(src, name) {
  // Matches 'const NAME = ...\n};' or 'function NAME ...\n}'  at top level
  const m = src.match(new RegExp(`((?:const ${name}[\\s\\S]+?^};|function ${name}[\\s\\S]+?^}))`, 'm'));
  if (!m) throw new Error(`Could not extract '${name}' from source`);
  return m[1];
}

// Load the functions we want to test into this scope
eval([
  extract(backgroundSrc, 'DEEPL_LANG_MAP'),
  extract(backgroundSrc, 'toDeepLLang'),
  extract(contentSrc, 'parseTimestamp'),
  extract(contentSrc, 'isChinese'),
  extract(contentSrc, 'isKorean'),
  extract(contentSrc, 'isChineseLang'),
  extract(contentSrc, 'isKoreanLang'),
].join('\n'));

// ── toDeepLLang ───────────────────────────────────────────────────────────────

test('toDeepLLang: known codes', () => {
  assert.equal(toDeepLLang('en'), 'EN-US');
  assert.equal(toDeepLLang('de'), 'DE');
  assert.equal(toDeepLLang('ja'), 'JA');
  assert.equal(toDeepLLang('ko'), 'KO');
  assert.equal(toDeepLLang('zh'), 'ZH');
  assert.equal(toDeepLLang('zh-tw'), 'ZH-HANT');
  assert.equal(toDeepLLang('ru'), 'RU');
});

test('toDeepLLang: case-insensitive', () => {
  assert.equal(toDeepLLang('EN'), 'EN-US');
  assert.equal(toDeepLLang('De'), 'DE');
});

test('toDeepLLang: unknown code returns null', () => {
  assert.equal(toDeepLLang('xyz'), null);
  assert.equal(toDeepLLang(''), null);
  assert.equal(toDeepLLang('hi'), null); // Hindi not in DeepL map
});

// ── parseTimestamp ────────────────────────────────────────────────────────────

test('parseTimestamp: HH:MM:SS.mmm', () => {
  assert.equal(parseTimestamp('00:01:30.500'), 90.5);
  assert.equal(parseTimestamp('01:00:00.000'), 3600);
  assert.equal(parseTimestamp('00:00:00.000'), 0);
});

test('parseTimestamp: MM:SS.mmm (two parts)', () => {
  assert.equal(parseTimestamp('01:30.5'), 90.5);
  assert.equal(parseTimestamp('00:05.0'), 5);
});

test('parseTimestamp: TTML ticks (integer followed by t)', () => {
  assert.ok(Math.abs(parseTimestamp('28365416667t') - 2836.5416667) < 0.0001);
  assert.equal(parseTimestamp('10000000t'), 1);
  assert.equal(parseTimestamp('0t'), 0);
});

test('parseTimestamp: plain seconds', () => {
  assert.equal(parseTimestamp('5.5'), 5.5);
  assert.equal(parseTimestamp('0'), 0);
});

test('parseTimestamp: empty / falsy', () => {
  assert.equal(parseTimestamp(''), 0);
  assert.equal(parseTimestamp(null), 0);
});

// ── isChinese / isChineseLang ─────────────────────────────────────────────────

test('isChinese: detects Han script', () => {
  assert.equal(isChinese('你好世界'), true);
  assert.equal(isChinese('日本語'), true);
  assert.equal(isChinese('Hello'), false);
  assert.equal(isChinese('안녕하세요'), false);
  assert.equal(isChinese(''), false);
});

test('isChineseLang: BCP-47 codes', () => {
  assert.equal(isChineseLang('zh'), true);
  assert.equal(isChineseLang('zh-cn'), true);
  assert.equal(isChineseLang('zh-tw'), true);
  assert.equal(isChineseLang('zh-hant'), true);
  assert.equal(isChineseLang('ZH'), true);
  assert.equal(isChineseLang('ko'), false);
  assert.equal(isChineseLang('en'), false);
  assert.equal(isChineseLang(''), false);
  assert.equal(isChineseLang(null), false);
});

// ── isKorean / isKoreanLang ───────────────────────────────────────────────────

test('isKorean: detects Hangul script', () => {
  assert.equal(isKorean('안녕하세요'), true);
  assert.equal(isKorean('한국어'), true);
  assert.equal(isKorean('Hello'), false);
  assert.equal(isKorean('你好'), false);
  assert.equal(isKorean(''), false);
});

test('isKoreanLang: BCP-47 codes', () => {
  assert.equal(isKoreanLang('ko'), true);
  assert.equal(isKoreanLang('ko-kr'), true);
  assert.equal(isKoreanLang('KO'), true);
  assert.equal(isKoreanLang('zh'), false);
  assert.equal(isKoreanLang('en'), false);
  assert.equal(isKoreanLang(''), false);
  assert.equal(isKoreanLang(null), false);
});
