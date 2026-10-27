'use strict';

const {
  SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { updateSettings, getSettings } = require('../services/settings');

const developerCmd = new SlashCommandBuilder()
  .setName('developer')
  .setDescription('Developer-only control panel');

// Single command: a developer-only ephemeral panel. Access is enforced in index.js.
async function execute(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev:status').setLabel('Status').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dev:title').setLabel('Set App Title').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dev:diag:on').setLabel('Diagnostics On').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dev:diag:off').setLabel('Diagnostics Off').setStyle(ButtonStyle.Danger),
  );
  return interaction.reply({ content: 'Developer panel', components: [row], flags: MessageFlags.Ephemeral });
}

function statusText(ctx) {
  const mem = process.memoryUsage().rss;
  return `uptime: ${Math.floor(process.uptime())}s\nrss: ${(mem / 1048576).toFixed(1)} MB\nnode: ${process.version}\ndiagnostics: ${ctx.diagnostics ? 'on' : 'off'}`;
}

const componentHandlers = [
  { prefix: 'dev', run: async (interaction, ctx) => {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    if (action === 'status') {
      return interaction.reply({ content: statusText(ctx), flags: MessageFlags.Ephemeral });
    }
    if (action === 'diag') {
      ctx.diagnostics = parts[2] === 'on';
      return interaction.reply({ content: `Diagnostics ${ctx.diagnostics ? 'on' : 'off'} (until restart).`, flags: MessageFlags.Ephemeral });
    }
    if (action === 'title') {
      const modal = new ModalBuilder().setCustomId('dev:titlesubmit').setTitle('Application panel title');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Title (max 45 chars)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45),
      ));
      return interaction.showModal(modal);
    }
  } },
];

const modalHandlers = [
  { prefix: 'dev', run: async (interaction, ctx) => {
    if (interaction.customId !== 'dev:titlesubmit') return;
    const title = interaction.fields.getTextInputValue('title').replace(/@(everyone|here)/g, '@\u200b$1');
    const s = await getSettings(ctx);
    await updateSettings(ctx, { applicationTemplate: { ...s.applicationTemplate, title } });
    return interaction.reply({ content: `Application title set to "${title}".`, flags: MessageFlags.Ephemeral });
  } },
];

module.exports = { commands: [{ data: developerCmd, execute, developerOnly: true }], componentHandlers, modalHandlers };
