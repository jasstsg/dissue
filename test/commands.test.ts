import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType, InteractionResponseType } from 'discord-api-types/v10';
import type { APIModalSubmissionComponent } from 'discord-api-types/v10';
import { buildFeedbackModal, buildHelpResponse, handleSyncLabelsCommand, handleFeedbackModalSubmit, fieldValue } from '../src/commands.js';
import type { Env } from '../src/env.js';
import type { GuildConfig } from '../src/guildConfig.js';
import {
    createFakeKV,
    testGitHubAppPrivateKey,
    makeGuildCommandInteraction,
    makeModalSubmitInteraction,
    makeExecutionContext,
} from './testHelpers.js';

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

test('buildHelpResponse mentions /sync-labels', () => {
    const response = buildHelpResponse();
    assert.ok(response.data?.content?.includes('/sync-labels'));
});

function labelRow(customId: string, value: string): APIModalSubmissionComponent {
    return {
        type: ComponentType.Label,
        component: { type: ComponentType.TextInput, custom_id: customId, value },
    };
}

function selectRow(customId: string, values: string[]): APIModalSubmissionComponent {
    return {
        type: ComponentType.Label,
        component: { type: ComponentType.StringSelect, custom_id: customId, values },
    };
}

test('fieldValue reads a text input\'s value', () => {
    const rows = [labelRow('foo', 'bar'), labelRow('baz', 'qux')];
    assert.equal(fieldValue(rows, 'baz'), 'qux');
});

test('fieldValue reads a select\'s first selected value', () => {
    const rows = [selectRow('feedbackType', ['discord:bug'])];
    assert.equal(fieldValue(rows, 'feedbackType'), 'discord:bug');
});

test('fieldValue returns an empty string when the custom_id is not present', () => {
    assert.equal(fieldValue([labelRow('foo', 'bar')], 'missing'), '');
});

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

function mockDiscordAndGitHub(t: import('node:test').TestContext, options: {
    createIssueResponses: Array<{ status: number; body: unknown }>;
    labels?: { name: string }[];
}) {
    const editedMessages: unknown[] = [];
    const followups: unknown[] = [];
    let issueCallCount = 0;

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const method = init?.method ?? 'GET';

        if (url.includes('/access_tokens')) {
            return new Response(JSON.stringify({ token: 'fake-token' }), { status: 200 });
        }
        if (url.includes('/labels') && method === 'GET') {
            return new Response(JSON.stringify(options.labels ?? []), { status: 200 });
        }
        if (url.includes('/issues') && method === 'POST') {
            const attempt = options.createIssueResponses[issueCallCount] ?? options.createIssueResponses.at(-1)!;
            issueCallCount++;
            return new Response(JSON.stringify(attempt.body), { status: attempt.status });
        }
        if (url.includes('/webhooks/') && url.endsWith('/messages/@original') && method === 'PATCH') {
            editedMessages.push(JSON.parse(init!.body as string));
            return new Response(null, { status: 200 });
        }
        if (url.includes('/webhooks/') && method === 'POST') {
            followups.push(JSON.parse(init!.body as string));
            return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    return { editedMessages, followups };
}

test('handleFeedbackModalSubmit creates an issue with the selected label and reports success', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    });
    const env = makeEnv(kv);
    const { editedMessages, followups } = mockDiscordAndGitHub(t, {
        createIssueResponses: [
            { status: 201, body: { number: 42, title: 'Bug title', html_url: 'https://github.com/jasstsg/dissue/issues/42' } },
        ],
    });

    const interaction = makeModalSubmitInteraction({
        guildId: 'guild-1',
        components: [
            labelRow('feedbackTitle', 'Bug title'),
            labelRow('feedbackDescription', 'Bug description'),
            selectRow('feedbackType', ['discord:bug']),
        ],
    });

    const { ctx, flush } = makeExecutionContext();
    await handleFeedbackModalSubmit(interaction, env, ctx);
    await flush();

    assert.equal(editedMessages.length, 1);
    assert.match((editedMessages[0] as { content: string }).content, /submitted/i);
    assert.equal(followups.length, 1);
    assert.match((followups[0] as { content: string }).content, /#42/);
});

test('handleFeedbackModalSubmit resyncs labels and retries once on a stale label', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    });
    const env = makeEnv(kv);
    const { followups } = mockDiscordAndGitHub(t, {
        createIssueResponses: [
            { status: 422, body: { message: 'Validation Failed' } },
            { status: 201, body: { number: 7, title: 'x', html_url: 'https://github.com/jasstsg/dissue/issues/7' } },
        ],
        labels: [{ name: 'discord:bug' }],
    });

    const interaction = makeModalSubmitInteraction({
        guildId: 'guild-1',
        components: [
            labelRow('feedbackTitle', 'T'),
            labelRow('feedbackDescription', 'D'),
            selectRow('feedbackType', ['discord:bug']),
        ],
    });

    const { ctx, flush } = makeExecutionContext();
    await handleFeedbackModalSubmit(interaction, env, ctx);
    await flush();

    assert.equal(followups.length, 1);
    assert.match((followups[0] as { content: string }).content, /#7/);
});

test('handleFeedbackModalSubmit reports a clear error when the label is still gone after resync', async (t) => {
    const kv = kvWithGuildConfig('guild-1', {
        installationId: '123', owner: 'jasstsg', repo: 'dissue',
        labels: [{ name: 'discord:bug', displayName: 'bug' }],
    });
    const env = makeEnv(kv);
    const { editedMessages } = mockDiscordAndGitHub(t, {
        createIssueResponses: [
            { status: 422, body: { message: 'Validation Failed' } },
            { status: 422, body: { message: 'Validation Failed' } },
        ],
        labels: [],
    });

    const interaction = makeModalSubmitInteraction({
        guildId: 'guild-1',
        components: [
            labelRow('feedbackTitle', 'T'),
            labelRow('feedbackDescription', 'D'),
            selectRow('feedbackType', ['discord:bug']),
        ],
    });

    const { ctx, flush } = makeExecutionContext();
    await handleFeedbackModalSubmit(interaction, env, ctx);
    await flush();

    assert.equal(editedMessages.length, 1);
    assert.match((editedMessages[0] as { content: string }).content, /no longer exists/);
});
