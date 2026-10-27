'use strict';

const {
  SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
} = require('discord.js');
const { clip } = require('../services/helpers');

const lookupCmd = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription('Telemetry and diagnostics panel');

// Single command: an ephemeral panel. Buttons run server-wide checks; the user menu looks up a member.
async function execute(interaction) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lk:roles').setLabel('Role Audit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lk:server').setLabel('Server Diagnostics').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('lk:help').setLabel('Help').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('lk:user').setPlaceholder('Look up a member').setMinValues(1).setMaxValues(1),
    ),
  ];
  return interaction.reply({ content: 'Lookup panel', components: rows, flags: MessageFlags.Ephemeral });
}

async function userInfo(interaction, ctx, userId) {
  const user = await interaction.client.users.fetch(userId);
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const tickets = ctx.store.read('tickets', []).filter((t) => t.openerId === userId);
  const apps = ctx.store.read('applications', []).filter((a) => a.userId === userId);
  const lines = [
    `User: ${user.tag} (${user.id})`,
    `Account created: ${user.createdAt.toISOString()}`,
    `Joined: ${member && member.joinedAt ? member.joinedAt.toISOString() : 'not a member'}`,
    `Roles: ${member ? member.roles.cache.filter((r) => r.id !== interaction.guildId).map((r) => r.name).join(', ') || 'none' : 'n/a'}`,
    `Tickets opened: ${tickets.length} (open: ${tickets.filter((t) => t.status === 'OPEN').length})`,
    `Applications: ${apps.length} (last: ${apps.length ? apps[apps.length - 1].status : 'n/a'})`,
  ];
  return interaction.reply({ content: clip(lines.join('\n'), 2000), flags: MessageFlags.Ephemeral });
}

async function roleAudit(interaction) {
  const me = await interaction.guild.members.fetchMe();
  const roles = [...interaction.guild.roles.cache.values()].filter((r) => r.id !== interaction.guildId).sort((a, b) => b.position - a.position);
  const unmanageable = roles.filter((r) => r.position >= me.roles.highest.position && !r.managed);
  const lines = [
    `Roles: ${roles.length}`,
    `Bot's highest role position: ${me.roles.highest.position}`,
    `Roles the bot cannot assign: ${unmanageable.length ? unmanageable.map((r) => r.name).join(', ') : 'none'}`,
  ];
  return interaction.reply({ content: clip(lines.join('\n'), 2000), flags: MessageFlags.Ephemeral });
}

async function serverInfo(interaction) {
  const g = interaction.guild;
  const lines = [
    `Server: ${g.name} (${g.id})`,
    `Members (cached): ${g.memberCount}`,
    `Channels: ${g.channels.cache.size}`,
    `Roles: ${g.roles.cache.size}`,
    `Uptime: ${Math.floor(process.uptime())}s`,
    `RSS: ${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`,
  ];
  return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

async function help(interaction) {
  const lines = [
    '/tickets: ticket control panel (staff)',
    '/apps: application panel (apply, history, staff review)',
    '/central: channel and role bindings (admin)',
    '/lookup: this panel (telemetry and diagnostics)',
    '/developer: developer-only panel',
  ];
  return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

const componentHandlers = [
  { prefix: 'lk', run: async (interaction, ctx) => {
    const action = interaction.customId.split(':')[1];
    if (action === 'roles') return roleAudit(interaction);
    if (action === 'server') return serverInfo(interaction);
    if (action === 'help') return help(interaction);
    if (action === 'user') return userInfo(interaction, ctx, interaction.values[0]);
  } },
];

module.exports = { commands: [{ data: lookupCmd, execute }], componentHandlers, modalHandlers: [] };
