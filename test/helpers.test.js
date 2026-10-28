'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanText, redactPII, clip, neutralizeMentions } = require('../src/services/helpers');

test('mentions are neutralized', () => {
  assert.ok(!cleanText('hi @everyone').includes('@everyone'));
  assert.ok(!neutralizeMentions('@here now').includes('@here'));
});
test('PII is redacted', () => {
  const out = redactPII('mail me at a.b@example.com from 10.0.0.1');
  assert.ok(!out.includes('example.com') && !out.includes('10.0.0.1'));
});
test('clip respects max length', () => {
  assert.strictEqual(clip('abcdef', 4).length, 4);
});
