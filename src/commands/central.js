'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { getSettings, updateSettings } = require('../services/settings');

const centralCmd = new SlashCommandBuilder()
  .setName('central')
  .setDescription('Bind channels and roles for the bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const BINDINGS = [
  { key: 'ticketCategoryId', kind: 'category', label: 'Ticket category' },
  { key: 'ticketLogChannelId', kind: 'channel', label: 'Ticket log channel' },
  { key: 'staffRoleId', kind: 'role', label: 'Staff role' },
  { key: 'hrRoleId', kind: 'role', label: 'HR role (claim override)' },
  { key: 'supportRoleId', kind: 'role', label: 'Support role (message access)' },
  { key: 'applicationReviewChannelId', kind: 'channel', label: 'Application review channel' },
  { key: 'applicationRoleId', kind: 'role', label: 'Role granted on acceptance' },
];

// Single command: one ephemeral panel with a select menu per binding.
async function execute(interaction) {
  const rows = BINDINGS.map((b) => {
    const menu = b.kind === 'role'
      ? new RoleSelectMenuBuilder()
      : new ChannelSelectMenuBuilder().setChannelTypes(b.kind === 'category' ? [ChannelType.GuildCategory] : [ChannelType.GuildText]);
    return new ActionRowBuilder().addComponents(menu.setCustomId(`central:set:${b.key}`).setPlaceholder(b.label).setMinValues(1).setMaxValues(1));
  });
  return interaction.reply({ content: 'Pick a value for each binding. Changes save on selection.', components: rows.slice(0, 5), flags: MessageFlags.Ephemeral });
}

const componentHandlers = [
  { prefix: 'central', run: async (interaction, ctx) => {
    const key = interaction.customId.split(':')[2];
    if (!BINDINGS.some((b) => b.key === key)) return;
    const value = interaction.values[0];
    await updateSettings(ctx, { [key]: value });
    const s = await getSettings(ctx);
    const lines = BINDINGS.map((b) => `${b.label}: ${s[b.key] ? `<${b.kind === 'role' ? '@&' : '#'}${s[b.key]}>` : 'unset'}`);
    return interaction.update({ content: `Saved.\n${lines.join('\n')}`, components: [] });
  } },
];

module.exports = { commands: [{ data: centralCmd, execute }], componentHandlers, modalHandlers: [] };
