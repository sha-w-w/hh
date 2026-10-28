'use strict';

const {
  ActionRowBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { getSettings } = require('../services/settings');
const { isStaff, openTicketFor, updateTicket, postPanel, escalate, rateTicket, showStats, showControlPanel } = require('./coreticket-1');
const { openTicket, claimTicket, closeTicket, hrOverrideClaim } = require('./coreticket-2');

const componentHandlers = [
  { prefix: 'tkp', run: async (interaction, ctx) => {
    const action = interaction.customId.split(':')[1];
    if (action === 'post') return postPanel(interaction, ctx);
    if (action === 'stats') return showStats(interaction, ctx);
    if (action === 'escalate') return escalate(interaction, ctx);
    if (action === 'close') return closeTicket(interaction, ctx);
    if (action === 'adduser' || action === 'removeuser') return showUserPicker(interaction, ctx, action === 'adduser');
    if (action === 'tag') return showTagModal(interaction, ctx);
    if (action === 'pick') return applyUserPick(interaction, ctx);
  } },
  { prefix: 'ticket', run: async (interaction, ctx) => {
    const action = interaction.customId.split(':')[1];
    if (action === 'open' && interaction.isStringSelectMenu()) return openTicket(interaction, ctx);
    if (action === 'claim') return claimTicket(interaction, ctx);
    if (action === 'close') return closeTicket(interaction, ctx);
    if (action === 'rate') return rateTicket(interaction, ctx);
    if (action === 'hrclaim') return hrOverrideClaim(interaction, ctx);
  } },
];

async function showUserPicker(interaction, ctx, grant) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  if (!openTicketFor(interaction, ctx)) return interaction.reply({ content: 'Not an open ticket channel.', flags: MessageFlags.Ephemeral });
  const menu = new UserSelectMenuBuilder().setCustomId(`tkp:pick:${grant ? 'grant' : 'revoke'}`).setPlaceholder('Choose a member');
  return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
}

async function applyUserPick(interaction, ctx) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  const grant = interaction.customId.endsWith(':grant');
  const targetId = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(interaction.channelId) || await interaction.client.channels.fetch(interaction.channelId);
  if (grant) {
    await channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
  } else {
    await channel.permissionOverwrites.delete(targetId);
  }
  return interaction.update({ content: `${grant ? 'Added' : 'Removed'} <@${targetId}>.`, components: [] });
}

function showTagModal(interaction, ctx) {
  const modal = new ModalBuilder().setCustomId('tkp:tagsubmit').setTitle('Tag this ticket');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('label').setLabel('Tag (e.g. bug, billing, urgent)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20),
  ));
  return interaction.showModal(modal);
}

async function submitTag(interaction, ctx) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  if (!openTicketFor(interaction, ctx)) return interaction.reply({ content: 'Not an open ticket channel.', flags: MessageFlags.Ephemeral });
  const label = interaction.fields.getTextInputValue('label').toLowerCase().replace(/[^a-z0-9-]/g, '');
  await updateTicket(interaction.channelId, ctx, (x) => { x.tags = [...new Set([...(x.tags || []), label])]; });
  return interaction.reply({ content: `Tagged \`${label}\`.` });
}

const modalHandlers = [
  { prefix: 'tkp', run: async (interaction, ctx) => {
    if (interaction.customId === 'tkp:tagsubmit') return submitTag(interaction, ctx);
  } },
];

// Deletes messages in an open ticket channel unless the author is the opener,
// the claimer, an HR override, or a Support member. Staff-only messages are allowed too.
async function filterTicketMessage(message, ctx) {
  if (!message.guild || message.author.bot) return;
  const t = ctx.store.read('tickets', []).find((x) => x.channelId === message.channelId && x.status === 'OPEN');
  if (!t) return;
  const settings = await getSettings(ctx);
  const roles = message.member ? message.member.roles.cache : null;
  const allowed =
    message.author.id === t.openerId ||
    message.author.id === t.claimedBy ||
    (settings.hrRoleId && roles && roles.has(settings.hrRoleId)) ||
    (settings.supportRoleId && roles && roles.has(settings.supportRoleId));
  if (allowed) return;
  await message.delete().catch((e) => ctx.log.error('Message delete failed:', e));
}

module.exports = {
  filterTicketMessage,
  componentHandlers,
  modalHandlers,
};
