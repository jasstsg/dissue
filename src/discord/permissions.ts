const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

// Only needs the permissions bitfield, not a full interaction — keeps this
// trivially testable and decoupled from the (large) interaction type shape.
export function isGuildAdmin(interaction: { member: { permissions: string } }): boolean {
    const permissions = BigInt(interaction.member.permissions);
    return (permissions & ADMINISTRATOR) !== 0n || (permissions & MANAGE_GUILD) !== 0n;
}
