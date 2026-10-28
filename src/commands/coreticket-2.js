'use strict';

const {
  PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { getSettings } = require('../services/settings');
const { buildTranscript } = require('../services/transcript');
const { isStaff, openTicketFor, updateTicket, controlRow, ratingRow } = require('./coreticket-1');

async function openTicket(interaction, ctx) {
  const settings = await getSettings(ctx);
  const categoryId = interaction.values[0];
  const category = settings.ticketCategories.find((c) => c.id === categoryId);
  if (!category) return interaction.reply({ content: 'Unknown category.', flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const user = interaction.user;
  const existing = ctx.store.read('tickets', []).find((t) => t.openerId === user.id && t.status === 'OPEN');
  if (existing) {
    return interaction.reply({ content: `You already have an open ticket: <#${existing.channelId}>`, flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ticketId = await ctx.store.update('counters', { ticketSeq: 0 }, (d) => { d.ticketSeq += 1; }).then((d) => d.ticketSeq);
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  for (const roleId of [settings.staffRoleId, settings.hrRoleId, settings.supportRoleId]) {
    if (roleId) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const channel = await guild.channels.create({
    name: `ticket-${safeName}-${ticketId}`,
    type: ChannelType.GuildText,
    parent: settings.ticketCategoryId || undefined,
    permissionOverwrites: overwrites,
  });

  await ctx.store.update('tickets', [], (list) => {
    list.push({ id: ticketId, channelId: channel.id, openerId: user.id, category: category.id, status: 'OPEN',
      claimedBy: null, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), warned: false });
  });

  const mention = settings.staffRoleId ? `<@&${settings.staffRoleId}> ` : '';
  await channel.send({
    content: `${mention}<@${user.id}>`,
    embeds: [new EmbedBuilder().setTitle(`${category.label} #${ticketId}`).setDescription('Describe your issue and a staff member will help you shortly.')],
    components: [controlRow()],
  });
  await interaction.editReply({ content: `Your ticket: <#${channel.id}>` });
}

// True when the member holds the given role binding (staff, hr, support).
async function hasRole(interaction, ctx, key) {
  const settings = await getSettings(ctx);
  const roleId = settings[key];
  return Boolean(roleId && interaction.member.roles.cache.has(roleId));
}

// HR may override a claim. HR members are not blocked by the claim lock.
async function isHrOverride(interaction, ctx) {
  return hasRole(interaction, ctx, 'hrRoleId');
}

// HR-only: takes over a claimed ticket. Other roles get a refusal.
async function hrOverrideClaim(interaction, ctx) {
  if (!await isHrOverride(interaction, ctx)) {
    return interaction.reply({ content: 'Only HR can override a claim.', flags: MessageFlags.Ephemeral });
  }
  const t = ctx.store.read('tickets', []).find((x) => x.channelId === interaction.channelId && x.status === 'OPEN');
  if (!t) return interaction.reply({ content: 'Not an open ticket channel.', flags: MessageFlags.Ephemeral });
  await updateTicket(interaction.channelId, ctx, (x) => { x.claimedBy = interaction.user.id; x.hrOverride = true; });
  return interaction.reply({ content: `${interaction.user} (HR) took over this ticket.` });
}

async function claimTicket(interaction, ctx) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Only staff can claim tickets.', flags: MessageFlags.Ephemeral });
  const list = ctx.store.read('tickets', []);
  const t = list.find((x) => x.channelId === interaction.channelId);
  if (!t) return interaction.reply({ content: 'Not a ticket channel.', flags: MessageFlags.Ephemeral });
  if (t.claimedBy && t.claimedBy !== interaction.user.id) {
    return interaction.reply({ content: `Already claimed by <@${t.claimedBy}>. Only HR can override.`, flags: MessageFlags.Ephemeral });
  }
  await updateTicket(interaction.channelId, ctx, (x) => { x.claimedBy = interaction.user.id; });
  await interaction.channel.setName(`claimed-${interaction.channel.name}`.slice(0, 100)).catch(() => {});
  await interaction.reply({ content: `${interaction.user} claimed this ticket.` });
}

async function closeTicket(interaction, ctx) {
  const list = ctx.store.read('tickets', []);
  const t = list.find((x) => x.channelId === interaction.channelId && x.status === 'OPEN');
  if (!t) {
    const msg = { content: 'This is not an open ticket channel.', flags: MessageFlags.Ephemeral };
    return interaction.replied || interaction.deferred ? interaction.followUp(msg) : interaction.reply(msg);
  }
  await interaction.reply({ content: `Closing in ${ctx.cfg.ticketCloseCountdownSeconds} seconds...` });
  await finalizeClose(interaction.channel, t, ctx, 'closed by staff or opener', interaction.user.tag);
}

async function finalizeClose(channel, t, ctx, reason, closedBy) {
  const { file, count } = await buildTranscript(channel, { transcriptDir: ctx.cfg.transcriptDir, ticketId: t.id });
  await ctx.store.update('tickets', [], (list) => {
    const rec = list.find((x) => x.id === t.id);
    if (rec) {
      rec.status = 'CLOSED';
      rec.closedAt = new Date().toISOString();
      rec.closeReason = reason;
      rec.closedBy = rec.claimedBy || null;
    }
  });
  if (t.openerId && channel.client) {
    const opener = await channel.client.users.fetch(t.openerId).catch(() => null);
    if (opener) {
      await opener.send({
        content: `Your ticket #${t.id} was closed (${reason}). How would you rate our support?`,
        components: [ratingRow(t.id)],
      }).catch(() => {});
    }
  }
  const settings = await getSettings(ctx);
  if (settings.ticketLogChannelId) {
    const log = await channel.guild.channels.fetch(settings.ticketLogChannelId).catch(() => null);
    if (log) {
      await log.send({
        content: `Ticket #${t.id} (${channel.name}) closed by ${closedBy}: ${reason}. ${count} message(s).`,
        files: [file],
      });
    }
  }
  setTimeout(() => channel.delete(`Ticket #${t.id} closed`).catch((e) => ctx.log.error(e)), ctx.cfg.ticketCloseCountdownSeconds * 1000);
}

async function sweepInactiveTickets(client, ctx) {
  const now = Date.now();
  const list = ctx.store.read('tickets', []);
  for (const t of list.filter((x) => x.status === 'OPEN')) {
    const hours = (now - new Date(t.lastActivityAt).getTime()) / 3600000;
    const channel = await client.channels.fetch(t.channelId).catch(() => null);
    if (!channel) continue;
    if (hours >= ctx.cfg.inactivityCloseHours) {
      await finalizeClose(channel, t, ctx, 'auto-closed after 48h inactivity', 'system');
    } else if (hours >= ctx.cfg.inactivityWarnHours && !t.warned) {
      await channel.send(`⚠️ No activity for ${Math.floor(hours)}h. This ticket will auto-close after ${ctx.cfg.inactivityCloseHours}h of inactivity.`);
      await updateTicket(t.channelId, ctx, (x) => { x.warned = true; });
    }
  }
}


module.exports = {
  openTicket,
  hasRole,
  isHrOverride,
  hrOverrideClaim,
  claimTicket,
  closeTicket,
  finalizeClose,
  sweepInactiveTickets,
};
