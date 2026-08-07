import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHelpResponse } from '../../src/commands/help.js';

test('buildHelpResponse mentions /sync-labels', () => {
    const response = buildHelpResponse();
    assert.ok(response.data?.content?.includes('/sync-labels'));
});
