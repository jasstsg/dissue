import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType, InteractionResponseType } from 'discord-api-types/v10';
import { buildFeedbackModal } from '../../src/commands/feedback.js';
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

test('buildFeedbackModal tells the user to run /setup when no repo is connected', async () => {
    const env = makeEnv(createFakeKV());
    const response = await buildFeedbackModal(makeGuildCommandInteraction(), env);
    assert.equal(response.type, InteractionResponseType.ChannelMessageWithSource);
    if (response.type !== InteractionResponseType.ChannelMessageWithSource) return;
    assert.ok(response.data?.content?.includes('/setup'));
});

test('buildFeedbackModal omits the type field when there are no synced labels', async () => {
    const env = makeEnv(kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue', labels: [],
    }));
    const response = await buildFeedbackModal(makeGuildCommandInteraction({ guildId: 'guild-1' }), env);
    assert.equal(response.type, InteractionResponseType.Modal);
    if (response.type !== InteractionResponseType.Modal) return;

    const customIds = response.data.components
        .filter(c => c.type === ComponentType.Label)
        .map(c => c.component.custom_id);
    assert.deepEqual(customIds, ['feedbackTitle', 'feedbackDescription']);
});

test('buildFeedbackModal includes a type select built from synced labels', async () => {
    const env = makeEnv(kvWithGuildConfig('guild-1', {
        installationId: '123',
        owner: 'jasstsg',
        repo: 'dissue',
        labels: [
            { name: 'discord:bug', displayName: 'bug' },
            { name: 'discord:feature', displayName: 'feature' },
        ],
    }));
    const response = await buildFeedbackModal(makeGuildCommandInteraction({ guildId: 'guild-1' }), env);
    assert.equal(response.type, InteractionResponseType.Modal);
    if (response.type !== InteractionResponseType.Modal) return;

    const typeRow = response.data.components.find(
        c => c.type === ComponentType.Label && c.component.custom_id === 'feedbackType',
    );
    assert.ok(typeRow && typeRow.type === ComponentType.Label && typeRow.component.type === ComponentType.StringSelect);
    assert.deepEqual(typeRow.component.options, [
        { label: 'bug', value: 'discord:bug' },
        { label: 'feature', value: 'discord:feature' },
    ]);
});

test('buildFeedbackModal keeps every field within Discord\'s length limits', async () => {
    const env = makeEnv(kvWithGuildConfig('guild-1', {
        installationId: '123',
        owner: 'jasstsg',
        repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    }));
    const response = await buildFeedbackModal(makeGuildCommandInteraction({ guildId: 'guild-1' }), env);
    assert.equal(response.type, InteractionResponseType.Modal);
    if (response.type !== InteractionResponseType.Modal) return;
    assert.ok(response.data.title.length <= 45, 'modal title must be <= 45 chars');

    for (const row of response.data.components) {
        if (row.type !== ComponentType.Label) continue;
        assert.ok(row.label.length <= 45, `label "${row.label}" exceeds 45 chars`);

        if (row.component.type === ComponentType.TextInput && row.component.placeholder) {
            assert.ok(
                row.component.placeholder.length <= 100,
                `placeholder for "${row.component.custom_id}" is ${row.component.placeholder.length} chars, ` +
                'exceeding Discord\'s 100 char limit (this is exactly the bug that broke /feedback before)',
            );
        }

        if (row.component.type === ComponentType.StringSelect) {
            for (const option of row.component.options) {
                assert.ok(option.label.length <= 100, `select option label "${option.label}" exceeds 100 chars`);
                assert.ok(option.value.length <= 100, `select option value "${option.value}" exceeds 100 chars`);
            }
        }
    }
});
