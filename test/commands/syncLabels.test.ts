import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSyncLabelsCommand } from '../../src/commands/syncLabels.js';
import type { Env } from '../../src/env.js';
import type { GuildConfig } from '../../src/guildConfig.js';
import { createFakeKV, testGitHubAppPrivateKey, makeGuildCommandInteraction } from '../testHelpers.js';

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

function kvWithGuildConfig(guildId: string, config: GuildConfig): KVNamespace {
    return createFakeKV({ [`guild:${guildId}`]: JSON.stringify(config) });
}

test('handleSyncLabelsCommand rejects non-admins', async () => {
    const env = makeEnv(createFakeKV());
    const interaction = makeGuildCommandInteraction({ permissions: '0' });
    const response = await handleSyncLabelsCommand(interaction, env);
    assert.match(response.data!.content!, /admin/i);
});

test('handleSyncLabelsCommand tells the user to run /setup first when not connected', async () => {
    const env = makeEnv(createFakeKV());
    const response = await handleSyncLabelsCommand(makeGuildCommandInteraction(), env);
    assert.match(response.data!.content!, /\/setup/);
});

test('handleSyncLabelsCommand fetches, filters, and stores discord:-prefixed labels', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue', labels: [],
    });
    const env = makeEnv(kv);

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('/access_tokens')) {
            return new Response(JSON.stringify({ token: 'fake-token' }), { status: 200 });
        }
        if (url.includes('/labels')) {
            return new Response(JSON.stringify([
                { name: 'discord:bug' },
                { name: 'discord:feature' },
                { name: 'good first issue' }, // not prefixed — should be filtered out
            ]), { status: 200 });
        }
        throw new Error(`Unexpected fetch to ${url}`);
    });

    const response = await handleSyncLabelsCommand(makeGuildCommandInteraction({ guildId: 'guild-1' }), env);
    assert.match(response.data!.content!, /bug/);
    assert.match(response.data!.content!, /feature/);
    assert.doesNotMatch(response.data!.content!, /good first issue/);

    const stored = JSON.parse((await kv.get('guild:guild-1'))!) as GuildConfig;
    assert.deepEqual(stored.labels, [
        { name: 'discord:bug', displayName: 'bug' },
        { name: 'discord:feature', displayName: 'feature' },
    ]);
});
