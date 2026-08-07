import { ComponentType, TextInputStyle, InteractionResponseType, MessageFlags } from 'discord-api-types/v10';
import type {
    APIChatInputApplicationCommandGuildInteraction,
    APIModalSubmitGuildInteraction,
    APIInteractionResponse,
    APIModalInteractionResponse,
    APIModalSubmissionComponent,
} from 'discord-api-types/v10';
import { editOriginalResponse, sendFollowupMessage, isGuildAdmin } from './discord.js';
import { createIssue } from './github.js';
import type { Env } from './env.js';

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

export function buildFeedbackModal(): APIModalInteractionResponse {
    return {
        type: InteractionResponseType.Modal,
        data: {
            custom_id: 'feedbackReportModal',
            title: 'Submit feedback',
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [{
                        type: ComponentType.TextInput,
                        custom_id: 'feedbackTitle',
                        label: 'Issue Title / Summary',
                        style: TextInputStyle.Short,
                        placeholder: 'e.g., Login button crashing on mobile',
                        required: true,
                    }],
                },
                {
                    type: ComponentType.ActionRow,
                    components: [{
                        type: ComponentType.TextInput,
                        custom_id: 'feedbackDescription',
                        label: 'Detailed Description',
                        style: TextInputStyle.Paragraph,
                        placeholder: 'A feature idea, or a bug + steps to reproduce it (1. Open... 2. Click...)',
                        required: true,
                    }],
                },
            ],
        },
    };
}

function fieldValue(rows: APIModalSubmissionComponent[], customId: string): string {
    for (const row of rows) {
        if (row.type !== ComponentType.ActionRow) continue;
        for (const component of row.components) {
            if (component.custom_id === customId) return component.value;
        }
    }
    return '';
}

export async function handleFeedbackModalSubmit(
    interaction: APIModalSubmitGuildInteraction,
    env: Env,
    ctx: ExecutionContext,
): Promise<APIInteractionResponse> {
    const rows = interaction.data.components;
    const title = fieldValue(rows, 'feedbackTitle');
    const description = fieldValue(rows, 'feedbackDescription');
    const submitter = interaction.member.user.username;

    ctx.waitUntil((async () => {
        try {
            const guildConfigRaw = await env.GUILD_CONFIG.get(`guild:${interaction.guild_id}`);

            if (!guildConfigRaw) {
                await editOriginalResponse(env.DISCORD_APPLICATION_ID, interaction.token, {
                    content: "This server hasn't connected a GitHub repo yet. Ask an admin to run /setup first.",
                });
                return;
            }

            const { installationId, owner, repo } = JSON.parse(guildConfigRaw) as {
                installationId: string;
                owner: string;
                repo: string;
            };
            const githubBody = `Reported by @${submitter} via Discord\n\n# Description\n${description}`;

            const issue = await createIssue(env, {
                installationId,
                owner,
                repo,
                title,
                body: githubBody,
            });
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
