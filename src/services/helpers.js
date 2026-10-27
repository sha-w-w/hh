'use strict';

// Shared utilities: input sanitization, output truncation, PII redaction,
// per-key async locks, and audit watermarks.

const LIMITS = { embedDesc: 4096, embedField: 1024, embedTotal: 6000, content: 2000, fieldCount: 25 };

function clip(str, max) {
  const s = String(str ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Strips @everyone / @here so user-submitted text cannot ping the whole server.
function neutralizeMentions(str) {
  return String(str ?? '').replace(/@(everyone|here)/gi, '@\u200b$1');
}

function cleanText(str, max = 1000) {
  return clip(neutralizeMentions(String(str ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()), max);
}

// Redacts emails, IPv4 addresses and card-like digit runs from transcript text.
function redactPII(str) {
  return String(str ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email redacted]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip redacted]')
    .replace(/\b(?:\d[ -]?){13,16}\b/g, '[card redacted]');
}

// Per-key mutex for in-process serialization of multi-step operations.
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  locks.set(key, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function watermark(staffId) {
  return `staff:${staffId}`;
}

function daysAgo(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

module.exports = { LIMITS, clip, cleanText, neutralizeMentions, redactPII, withLock, watermark, daysAgo };
