import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleGitHubCallback } from '../../src/github/installCallback.js';
import { createFakeKV, testGitHubAppPrivateKey } from '../testHelpers.js';
import type { Env } from '../../src/env.js';

function makeEnv(kv: KVNamespace): Env {
    return {
        GUILD_CONFIG: kv,
        DISCORD_PUBLIC_KEY: 'unused',
        DISCORD_APPLICATION_ID: 'unused',
        GITHUB_APP_ID: 'unused',
        GITHUB_APP_SLUG: 'unused',
        GITHUB_APP_PRIVATE_KEY: testGitHubAppPrivateKey(),
    };
}

function mockGitHub(
    t: import('node:test').TestContext,
    repositories: { name: string; owner: { login: string } }[],
    labels: { name: string }[] = [],
) {
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('/access_tokens')) {
            return new Response(JSON.stringify({ token: 'fake-token' }), { status: 200 });
        }
        if (url.includes('/installation/repositories')) {
            return new Response(JSON.stringify({ repositories }), { status: 200 });
        }
        if (url.includes('/labels')) {
            return new Response(JSON.stringify(labels), { status: 200 });
        }
        throw new Error(`Unexpected fetch to ${url}`);
    });
}

test('rejects a callback missing required query params', async () => {
    const env = makeEnv(createFakeKV());
    const response = await handleGitHubCallback(new Request('https://example.com/github/callback'), env);
    assert.equal(response.status, 400);
});

test('rejects a callback with an unknown or expired state token', async () => {
    const env = makeEnv(createFakeKV());
    const url = 'https://example.com/github/callback?installation_id=123&setup_action=install&state=nope';
    const response = await handleGitHubCallback(new Request(url), env);
    assert.equal(response.status, 400);
    assert.match(await response.text(), /expired/i);
});

test('rejects an installation granted access to more than one repository', async (t) => {
    const kv = createFakeKV({ 'state:abc': 'guild-1' });
    mockGitHub(t, [
        { name: 'repo-a', owner: { login: 'org' } },
        { name: 'repo-b', owner: { login: 'org' } },
    ]);

    const url = 'https://example.com/github/callback?installation_id=123&setup_action=install&state=abc';
    const response = await handleGitHubCallback(new Request(url), makeEnv(kv));
    assert.equal(response.status, 400);
    assert.match(await response.text(), /more than one repository/i);
});

test('stores the guild config and confirms on a single-repo installation', async (t) => {
    const kv = createFakeKV({ 'state:abc': 'guild-1' });
    mockGitHub(t, [{ name: 'dissue', owner: { login: 'jasstsg' } }], [{ name: 'discord:bug' }, { name: 'unrelated-label' }]);

    const url = 'https://example.com/github/callback?installation_id=123&setup_action=install&state=abc';
    const response = await handleGitHubCallback(new Request(url), makeEnv(kv));
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /jasstsg\/dissue/);
    assert.match(text, /bug/);

    const stored = await kv.get('guild:guild-1');
    assert.equal(stored, JSON.stringify({
        installationId: '123',
        owner: 'jasstsg',
        repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    }));
});
