import { ComponentType, InteractionResponseType, TextInputStyle } from 'discord-api-types/v10';
import type {
    APIChatInputApplicationCommandGuildInteraction,
    APIInteractionResponseChannelMessageWithSource,
    APIModalInteractionResponse,
    APIModalInteractionResponseCallbackComponent,
    APISelectMenuOption,
} from 'discord-api-types/v10';
import { ephemeralReply } from '../discord/client.js';
import { getGuildConfig, type GuildConfig } from '../guildConfig.js';
import type { Env } from '../env.js';

export async function buildFeedbackModal(
    interaction: APIChatInputApplicationCommandGuildInteraction,
    env: Env,
): Promise<APIModalInteractionResponse | APIInteractionResponseChannelMessageWithSource> {
    const config = await getGuildConfig(env, interaction.guild_id);

    if (!config) {
        return ephemeralReply("This server hasn't connected a GitHub repo yet. Ask an admin to run /setup first.");
    }

    return feedbackModal(config);
}

function feedbackModal(config: GuildConfig): APIModalInteractionResponse {

    const components: APIModalInteractionResponseCallbackComponent[] = [];
    if (config.labels.length > 0) {
        components.push(
            new ModalField('feedbackType', 'Feedback Type')
                .asDropdown(config.labels.map(label => ({ label: label.displayName, value: label.name })))
        );
    }

    components.push(
        new ModalField('feedbackTitle', 'Title / Summary')
            .asSingleLine('e.g., Login button crashing on mobile')
    );

    components.push(
        new ModalField('feedbackDescription','Description')
            .asMultiLine('A feature idea, or a bug + steps to reproduce it (1. Open... 2. Click...)')
    );

    return {
        type: InteractionResponseType.Modal,
        data: {
            custom_id: 'feedbackReportModal',
            title: 'Submit feedback',
            components,
        },
    };
}


class ModalField {
    component: ModalComponent;

    constructor(id: string, label: string) {
        this.component = {
            type: ComponentType.Label,
            label: label,
            component: {
                custom_id: id,
                required: true
            }
        }
    }

    asSingleLine(placeholder: string): APIModalInteractionResponseCallbackComponent {
        this.component.component.type = ComponentType.TextInput;
        this.component.component.style = TextInputStyle.Short;
        this.component.component.placeholder = placeholder;

        return this.component as APIModalInteractionResponseCallbackComponent;
    }

    asMultiLine(placeholder: string): APIModalInteractionResponseCallbackComponent {
        this.component.component.type = ComponentType.TextInput;
        this.component.component.style = TextInputStyle.Paragraph;
        this.component.component.placeholder = placeholder;

        return this.component as APIModalInteractionResponseCallbackComponent;
    }

    asDropdown(options: APISelectMenuOption[]): APIModalInteractionResponseCallbackComponent {
        this.component.component.type = ComponentType.StringSelect;
        this.component.component.options = options;

        return this.component as APIModalInteractionResponseCallbackComponent;
    }
}

type ModalComponent = {
    type: ComponentType
    label: string
    component: {
        type?: ComponentType
        style?: TextInputStyle
        custom_id: string
        placeholder?: string
        required: boolean,
        options?: APISelectMenuOption[]
    }
}
