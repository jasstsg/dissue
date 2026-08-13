import { ComponentType, InteractionResponseType, TextInputStyle } from 'discord-api-types/v10';
import type {
    APIChatInputApplicationCommandGuildInteraction,
    APIInteractionResponseChannelMessageWithSource,
    APIModalInteractionResponse,
    APIModalInteractionResponseCallbackComponent,
    APISelectMenuOption,
    FileUploadType,
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

    components.push(
        new ModalField('feedbackImages', 'Images (optional)', 'Hosted by Discord — may stop displaying in the GitHub issue after some time.')
            .asFileUpload()
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

    constructor(id: string, label: string, description?: string) {
        this.component = {
            type: ComponentType.Label,
            label: label,
            description,
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

    // Images are optional — unlike the other field types, which are always required.
    asFileUpload(): APIModalInteractionResponseCallbackComponent {
        this.component.component.type = ComponentType.FileUpload;
        this.component.component.required = false;
        this.component.component.min_values = 0;
        this.component.component.max_values = 4;
        this.component.component.file_types = ['image'];

        return this.component as APIModalInteractionResponseCallbackComponent;
    }
}

type ModalComponent = {
    type: ComponentType
    label: string
    description?: string
    component: {
        type?: ComponentType
        style?: TextInputStyle
        custom_id: string
        placeholder?: string
        required: boolean,
        options?: APISelectMenuOption[]
        min_values?: number
        max_values?: number
        file_types?: FileUploadType[]
    }
}
