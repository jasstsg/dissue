import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentType } from 'discord-api-types/v10';
import type { APIModalSubmissionComponent } from 'discord-api-types/v10';
import { buildFeedbackModal, buildHelpResponse, fieldValue } from '../src/commands.js';

test('buildFeedbackModal keeps every field within Discord\'s length limits', () => {
    const modal = buildFeedbackModal();

    assert.ok(modal.data.title.length <= 45, 'modal title must be <= 45 chars');

    for (const row of modal.data.components) {
        if (row.type !== ComponentType.ActionRow) continue;
        for (const component of row.components) {
            assert.ok(component.label && component.label.length <= 45, `label "${component.label}" exceeds 45 chars`);
            if (component.placeholder) {
                assert.ok(
                    component.placeholder.length <= 100,
                    `placeholder for "${component.custom_id}" is ${component.placeholder.length} chars, ` +
                    'exceeding Discord\'s 100 char limit (this is exactly the bug that broke /feedback before)',
                );
            }
        }
    }
});

test('buildHelpResponse is a private message with non-empty content', () => {
    const response = buildHelpResponse();
    assert.ok(response.data?.content && response.data.content.length > 0);
    assert.notEqual((response.data?.flags ?? 0) & 64, 0, 'expected the Ephemeral flag to be set');
});

function textInputRow(customId: string, value: string): APIModalSubmissionComponent {
    return {
        type: ComponentType.ActionRow,
        components: [{ type: ComponentType.TextInput, custom_id: customId, value }],
    };
}

test('fieldValue finds a matching text input by custom_id', () => {
    const rows = [textInputRow('foo', 'bar'), textInputRow('baz', 'qux')];
    assert.equal(fieldValue(rows, 'baz'), 'qux');
});

test('fieldValue returns an empty string when the custom_id is not present', () => {
    assert.equal(fieldValue([textInputRow('foo', 'bar')], 'missing'), '');
});
