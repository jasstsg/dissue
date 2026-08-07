import type { APIInteractionResponseChannelMessageWithSource } from 'discord-api-types/v10';
import { ephemeralReply } from '../discord/client.js';
import { LABEL_PREFIX } from '../guildConfig.js';

export function buildHelpResponse(): APIInteractionResponseChannelMessageWithSource {
    return ephemeralReply([
        '**Dissue** connects this server to a GitHub repo for reporting bugs and feature ideas.',
        '',
        '`/setup` — (admin only) connect this server to a GitHub repo. Only needs to be run once.',
        '`/sync-labels` — (admin only) re-pull feedback type options from GitHub labels ' +
        `prefixed \`${LABEL_PREFIX}\` (e.g. \`${LABEL_PREFIX}bug\`). Run this after adding/renaming labels.`,
        '`/feedback` — open a form to submit a bug report or feature idea as a GitHub issue.',
        '`/help` — show this message.',
    ].join('\n'));
}
