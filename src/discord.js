import { verifyKey } from 'discord-interactions';

export async function verifyDiscordRequest(request, env) {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    const isValid = signature && timestamp &&
        await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

    if (!isValid) {
        return { isValid: false };
    }

    return { isValid: true, interaction: JSON.parse(body) };
}

export function json(data) {
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
    });
}

// Edits the deferred reply once the async GitHub work finishes.
export async function editOriginalResponse(applicationId, interactionToken, payload) {
    const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
    await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

const ADMINISTRATOR = 0x8;
const MANAGE_GUILD = 0x20;

export function isGuildAdmin(interaction) {
    const permissions = BigInt(interaction.member?.permissions ?? 0);
    return (permissions & BigInt(ADMINISTRATOR)) !== 0n || (permissions & BigInt(MANAGE_GUILD)) !== 0n;
}
