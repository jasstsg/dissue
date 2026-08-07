import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGuildConfig } from '../src/guildConfig.js';
import type { Env } from '../src/env.js';
import { createFakeKV } from './testHelpers.js';

function makeEnv(kv: KVNamespace): Env {
    return {
        GUILD_CONFIG: kv,
        DISCORD_PUBLIC_KEY: 'unused',
        DISCORD_APPLICATION_ID: 'unused',
        GITHUB_APP_ID: 'unused',
        GITHUB_APP_SLUG: 'unused',
        GITHUB_APP_PRIVATE_KEY: 'unused',
    };
}

test('getGuildConfig returns null when nothing is stored', async () => {
    const env = makeEnv(createFakeKV());
    assert.equal(await getGuildConfig(env, 'guild-1'), null);
});

test('getGuildConfig normalizes labels to [] for configs stored before that field existed', async () => {
    // Exactly the shape /setup stored before the labels feature shipped —
    // this crashed buildFeedbackModal in production until this was fixed.
    const kv = createFakeKV({
        'guild:guild-1': JSON.stringify({ installationId: '123', owner: 'jasstsg', repo: 'dissue' }),
    });
    const config = await getGuildConfig(makeEnv(kv), 'guild-1');
    assert.deepEqual(config?.labels, []);
});
