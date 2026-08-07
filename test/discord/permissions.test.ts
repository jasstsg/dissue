import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGuildAdmin } from '../../src/discord/permissions.js';

test('isGuildAdmin returns true for Administrator permission', () => {
    assert.equal(isGuildAdmin({ member: { permissions: String(0x8) } }), true);
});

test('isGuildAdmin returns true for Manage Guild permission', () => {
    assert.equal(isGuildAdmin({ member: { permissions: String(0x20) } }), true);
});

test('isGuildAdmin returns true when the bit is set among unrelated permissions', () => {
    assert.equal(isGuildAdmin({ member: { permissions: String(0x8 | 0x800) } }), true);
});

test('isGuildAdmin returns false when neither bit is set', () => {
    assert.equal(isGuildAdmin({ member: { permissions: String(0x800) } }), false);
});

test('isGuildAdmin returns false with no permissions at all', () => {
    assert.equal(isGuildAdmin({ member: { permissions: '0' } }), false);
});
