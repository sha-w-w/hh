'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isControlCommand } = require('../src/control');

const cfg = { guildId: '111111111111111111', developerId: '811100216052547594' };
const msg = (over = {}) => ({
  author: { id: cfg.developerId, bot: false },
  guild: { id: cfg.guildId },
  content: '+control',
  ...over,
});

test('developer in the configured guild can trigger +control', () => {
  assert.strictEqual(isControlCommand(msg(), cfg), true);
});
test('other users cannot trigger it', () => {
  assert.strictEqual(isControlCommand(msg({ author: { id: '222222222222222222', bot: false } }), cfg), false);
});
test('it is refused outside the configured guild', () => {
  assert.strictEqual(isControlCommand(msg({ guild: { id: '999999999999999999' } }), cfg), false);
});
test('it is refused in DMs', () => {
  assert.strictEqual(isControlCommand(msg({ guild: null }), cfg), false);
});
test('only the exact text triggers it', () => {
  assert.strictEqual(isControlCommand(msg({ content: '+control now' }), cfg), false);
  assert.strictEqual(isControlCommand(msg({ content: '  +control  ' }), cfg), true);
});
