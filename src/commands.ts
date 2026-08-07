import { ComponentType, TextInputStyle, InteractionResponseType, MessageFlags } from 'discord-api-types/v10';
import type {
    APIChatInputApplicationCommandGuildInteraction,
    APIModalSubmitGuildInteraction,
    APIInteractionResponse,
    APIInteractionResponseChannelMessageWithSource,
    APIModalInteractionResponse,
    APIModalInteractionResponseCallbackComponent,
    APIModalSubmissionComponent,
} from 'discord-api-types/v10';
import { editOriginalResponse, sendFollowupMessage, isGuildAdmin } from './discord.js';
import { createIssue, GitHubValidationError } from './github.js';
import { getGuildConfig, syncLabels, LABEL_PREFIX, type GuildConfig } from './guildConfig.js';
import type { Env } from './env.js';

export function buildHelpResponse(): APIInteractionResponseChannelMessageWithSource {
    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
            content: [
                '**Dissue** connects this server to a GitHub repo for reporting bugs and feature ideas.',
                '',
                '`/setup` — (admin only) connect this server to a GitHub repo. Only needs to be run once.',
                '`/sync-labels` — (admin only) re-pull feedback type options from GitHub labels ' +
                `prefixed \`${LABEL_PREFIX}\` (e.g. \`${LABEL_PREFIX}bug\`). Run this after adding/renaming labels.`,
                '`/feedback` — open a form to submit a bug report or feature idea as a GitHub issue.',
                '`/help` — show this message.',
            ].join('\n'),
            flags: MessageFlags.Ephemeral,
        },
    };
}

export async function handleSetupCommand(
    interaction: APIChatInputApplicationCommandGuildInteraction,
    env: Env,
    ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
    if (!isGuildAdmin(interaction)) {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: 'Only server admins can run /setup.',
                flags: MessageFlags.Ephemeral,
            },
        };
    }

    const state = crypto.randomUUID();
    ctx.waitUntil(env.GUILD_CONFIG.put(`state:${state}`, interaction.guild_id, { expirationTtl: 600 }));

    const installUrl = `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new?state=${state}`;

    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
            content: `Connect this server's GitHub repo by installing the app here (link expires in 10 minutes):\n${installUrl}`,
            flags: MessageFlags.Ephemeral,
        },
    };
}

function syncLabelsSummary(config: GuildConfig): string {
    if (config.labels.length === 0) {
        return `No labels prefixed \`${LABEL_PREFIX}\` were found in ${config.owner}/${config.repo}. ` +
            `Add labels like \`${LABEL_PREFIX}bug\` or \`${LABEL_PREFIX}feature\` in GitHub, then run /sync-labels again.`;
    }
    const names = config.labels.map(label => label.displayName).join(', ');
    return `Synced ${config.labels.length} feedback type${config.labels.length === 1 ? '' : 's'} from ` +
        `${config.owner}/${config.repo}: ${names}`;
}

export async function handleSyncLabelsCommand(
    interaction: APIChatInputApplicationCommandGuildInteraction,
    env: Env,
): Promise<APIInteractionResponseChannelMessageWithSource> {
    if (!isGuildAdmin(interaction)) {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: 'Only server admins can run /sync-labels.',
                flags: MessageFlags.Ephemeral,
            },
        };
    }

    const config = await getGuildConfig(env, interaction.guild_id);
    if (!config) {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: "This server hasn't connected a GitHub repo yet. Run /setup first.",
                flags: MessageFlags.Ephemeral,
            },
        };
    }

    const labels = await syncLabels(env, interaction.guild_id, config);

    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
            content: syncLabelsSummary({ ...config, labels }),
            flags: MessageFlags.Ephemeral,
        },
    };
}

export async function buildFeedbackModal(
    interaction: APIChatInputApplicationCommandGuildInteraction,
    env: Env,
): Promise<APIModalInteractionResponse | APIInteractionResponseChannelMessageWithSource> {
    const config = await getGuildConfig(env, interaction.guild_id);

    if (!config) {
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: "This server hasn't connected a GitHub repo yet. Ask an admin to run /setup first.",
                flags: MessageFlags.Ephemeral,
            },
        };
    }

    const components: APIModalInteractionResponseCallbackComponent[] = [
        {
            type: ComponentType.Label,
            label: 'Issue Title / Summary',
            component: {
                type: ComponentType.TextInput,
                custom_id: 'feedbackTitle',
                style: TextInputStyle.Short,
                placeholder: 'e.g., Login button crashing on mobile',
                required: true,
            },
        },
        {
            type: ComponentType.Label,
            label: 'Detailed Description',
            component: {
                type: ComponentType.TextInput,
                custom_id: 'feedbackDescription',
                style: TextInputStyle.Paragraph,
                placeholder: 'A feature idea, or a bug + steps to reproduce it (1. Open... 2. Click...)',
                required: true,
            },
        },
    ];

    if (config.labels.length > 0) {
        components.push({
            type: ComponentType.Label,
            label: 'Feedback Type',
            component: {
                type: ComponentType.StringSelect,
                custom_id: 'feedbackType',
                required: true,
                options: config.labels.map(label => ({ label: label.displayName, value: label.name })),
            },
        });
    }

    return {
        type: InteractionResponseType.Modal,
        data: {
            custom_id: 'feedbackReportModal',
            title: 'Submit feedback',
            components,
        },
    };
}

export function fieldValue(rows: APIModalSubmissionComponent[], customId: string): string {
    for (const row of rows) {
        if (row.type !== ComponentType.Label) continue;
        const component = row.component;
        if (component.custom_id !== customId) continue;
        if (component.type === ComponentType.TextInput) return component.value;
        if (component.type === ComponentType.StringSelect) return component.values[0] ?? '';
    }
    return '';
}

async function createIssueWithLabelRetry(
    env: Env,
    guildId: string,
    config: GuildConfig,
    options: { title: string; body: string; label?: string },
) {
    const { title, body, label } = options;
    const labels = label ? [label] : undefined;
    const base = { installationId: config.installationId, owner: config.owner, repo: config.repo, title, body };

    try {
        return await createIssue(env, { ...base, labels });
    } catch (error) {
        if (!(error instanceof GitHubValidationError) || !label) {
            throw error;
        }
        // The selected label may have been renamed/removed on GitHub since it was
        // last synced — refresh once and retry before giving up.
        await syncLabels(env, guildId, config);
        return createIssue(env, { ...base, labels });
    }
}

export async function handleFeedbackModalSubmit(
    interaction: APIModalSubmitGuildInteraction,
    env: Env,
    ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
    const rows = interaction.data.components;
    const title = fieldValue(rows, 'feedbackTitle');
    const description = fieldValue(rows, 'feedbackDescription');
    const selectedLabel = fieldValue(rows, 'feedbackType') || undefined;
    const submitter = interaction.member.user.username;

    ctx.waitUntil((async () => {
        try {
            const config = await getGuildConfig(env, interaction.guild_id);

            if (!config) {
                await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                    content: "This server hasn't connected a GitHub repo yet. Ask an admin to run /setup first.",
                });
                return;
            }

            const githubBody = `Reported by @${submitter} via Discord\n\n# Description\n${description}`;

            let issue;
            try {
                issue = await createIssueWithLabelRetry(env, interaction.guild_id, config, {
                    title,
                    body: githubBody,
                    label: selectedLabel,
                });
            } catch (error) {
                if (error instanceof GitHubValidationError) {
                    await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                        content: '❌ The feedback type you selected no longer exists. Please run /feedback again and pick a current option.',
                    });
                    return;
                }
                throw error;
            }

            await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: '✅ Submitted — posted below.',
            });
            await sendFollowupMessage(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: `📋 [#${issue.number} ${issue.title}](${issue.html_url})`,
            });
        } catch (error) {
            console.error('Failed to create GitHub issue:', error);
            await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: '❌ Failed to connect to GitHub. Please try again later.',
            });
        }
    })());

    return {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
    };
}
