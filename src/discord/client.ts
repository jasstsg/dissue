import { verifyKey } from 'discord-interactions';
import { InteractionResponseType, MessageFlags } from 'discord-api-types/v10';
import type {
    APIInteraction,
    APIInteractionResponse,
    APIInteractionResponseCallbackData,
    APIInteractionResponseChannelMessageWithSource,
} from 'discord-api-types/v10';
import type { Env } from '../env.js';

const WEBHOOK_ENDPOINT = `https://discord.com/api/v10/webhooks`;

export async function verifyDiscordRequest(
    request: Request,
    env: Env,
): Promise<{ isValid: false } | { isValid: true; interaction: APIInteraction }> {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    if (!signature || !timestamp) {
        return { isValid: false };
    }

    const isValid = await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
    if (!isValid) {
        return { isValid: false };
    }

    return { isValid: true, interaction: JSON.parse(body) };
}

export function json(data: APIInteractionResponse): Response {
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
    });
}

// Edits the deferred reply once the async GitHub work finishes.
export async function editOriginalResponse(
    applicationId: string,
    interactionToken: string,
    payload: APIInteractionResponseCallbackData,
): Promise<void> {
    const url = `${WEBHOOK_ENDPOINT}/${applicationId}/${interactionToken}/messages/@original`;
    await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

// Sends a new message alongside the original deferred reply. Visibility
// (ephemeral or not) is independent of the original response's flags, so
// this is how a private "thinking" ack can still be followed by a public
// result visible to the whole channel.
export async function sendFollowupMessage(
    applicationId: string,
    interactionToken: string,
    payload: APIInteractionResponseCallbackData,
): Promise<void> {
    const url = `${WEBHOOK_ENDPOINT}/${applicationId}/${interactionToken}`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export function ephemeralReply(content: string): APIInteractionResponseChannelMessageWithSource {
    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content, flags: MessageFlags.Ephemeral },
    };
}
