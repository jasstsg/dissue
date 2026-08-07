import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createFakeKV } from './testHelpers.js';
import type { Env } from '../src/env.js';

function makeEnv(): Env {
    return {
        GUILD_CONFIG: createFakeKV(),
        DISCORD_PUBLIC_KEY: 'test-public-key',
        DISCORD_APPLICATION_ID: 'test-app-id',
        GITHUB_APP_ID: 'test-github-app-id',
        GITHUB_APP_SLUG: 'test-slug',
        GITHUB_APP_PRIVATE_KEY: 'test-private-key',
    };
}

const fakeCtx = { waitUntil: () => {} } as unknown as ExecutionContext;

test('returns 404 for unknown routes', async () => {
    const response = await worker.fetch(new Request('https://example.com/nonsense'), makeEnv(), fakeCtx);
    assert.equal(response.status, 404);
});

test('rejects /interactions requests missing Discord signature headers', async () => {
    const response = await worker.fetch(
        new Request('https://example.com/interactions', { method: 'POST', body: '{}' }),
        makeEnv(),
        fakeCtx,
    );
    assert.equal(response.status, 401);
});
