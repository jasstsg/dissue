// One-off script: registers this app's slash commands with Discord.
// Run manually after adding/changing a command: npx tsx index.ts
// The actual interaction handling lives in the Worker (src/worker.ts), not here.

import { SlashCommandBuilder, PermissionFlagsBits, REST, Routes } from 'discord.js';
import 'dotenv/config';

const commands = [
    new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Open a form to submit feedback to the connected GitHub repo.'),
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('[Admin only] Connect this server the GitHub repo you want to submit issues to.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
