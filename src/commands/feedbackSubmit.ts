import { ComponentType, InteractionResponseType, MessageFlags } from 'discord-api-types/v10';
import type { APIModalSubmitGuildInteraction, APIInteractionResponse, APIModalSubmissionComponent } from 'discord-api-types/v10';
import { editOriginalResponse, sendFollowupMessage } from '../discord/client.js';
import { createIssue, GitHubValidationError } from '../github/client.js';
import { getGuildConfig, syncLabels, type GuildConfig } from '../guildConfig.js';
import type { Env } from '../env.js';

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
                        content: 'The feedback type you selected no longer exists. Please run /feedback again and pick a current option.',
                    });
                    return;
                }
                throw error;
            }

            await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: 'Feedback submitted.',
            });
            await sendFollowupMessage(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: `@${submitter} submitted feedback: [#${issue.number} ${issue.title}](${issue.html_url})`,
                flags: MessageFlags.SuppressEmbeds,
            });
        } catch (error) {
            console.error('Failed to create GitHub issue:', error);
            await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                content: 'Failed to connect to GitHub. Please try again later.',
            });
        }
    })());

    return {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral },
    };
}
