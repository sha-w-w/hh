'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { getSettings } = require('../services/settings');
const { buildTranscript } = require('../services/transcript');
const { redactPII } = require('../services/helpers');

const ticketsCmd = new SlashCommandBuilder()
  .setName('tickets')
  .setDescription('Ticket system: opens the control panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

// Single command: an ephemeral control panel with buttons and menus.
async function execute(interaction, ctx) {
  return showControlPanel(interaction, ctx);
}

function panelRows(inTicket) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tkp:post').setLabel('Post Ticket Panel').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('tkp:stats').setLabel('My Stats').setStyle(ButtonStyle.Secondary),
    ),
  ];
  if (inTicket) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tkp:adduser').setLabel('Add User').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tkp:removeuser').setLabel('Remove User').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tkp:escalate').setLabel('Escalate').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tkp:tag').setLabel('Tag').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tkp:close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
    ));
  }
  return rows;
}

async function showControlPanel(interaction, ctx) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  const inTicket = Boolean(openTicketFor(interaction, ctx));
  return interaction.reply({ content: 'Ticket control panel', components: panelRows(inTicket), flags: MessageFlags.Ephemeral });
}

async function isStaff(interaction, ctx) {
  const settings = await getSettings(ctx);
  return Boolean(settings.staffRoleId && interaction.member.roles.cache.has(settings.staffRoleId));
}

function openTicketFor(interaction, ctx) {
  return ctx.store.read('tickets', []).find((x) => x.channelId === interaction.channelId && x.status === 'OPEN');
}



async function updateTicket(channelId, ctx, fn) {
  return ctx.store.update('tickets', [], (list) => {
    const t = list.find((x) => x.channelId === channelId);
    if (t) fn(t);
  });
}

async function escalate(interaction, ctx) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  const t = openTicketFor(interaction, ctx);
  if (!t) return interaction.reply({ content: 'Not an open ticket channel.', flags: MessageFlags.Ephemeral });
  const settings = await getSettings(ctx);
  await updateTicket(interaction.channelId, ctx, (x) => { x.escalated = true; });
  const voice = await interaction.guild.channels.create({
    name: `escalated-${t.id}`,
    type: ChannelType.GuildVoice,
    parent: settings.ticketCategoryId || undefined,
    permissionOverwrites: [{ id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
  });
  const mention = settings.staffRoleId ? `<@&${settings.staffRoleId}>` : 'Staff';
  await interaction.channel.send(`🚨 ${mention} escalated by ${interaction.user}. Voice room: <#${voice.id}>`);
  return interaction.reply({ content: 'Escalated.', flags: MessageFlags.Ephemeral });
}

// Handles a star button from the closure DM: ticket:rate:<ticketId>:<stars>.
async function rateTicket(interaction, ctx) {
  const [, , idRaw, starsRaw] = interaction.customId.split(':');
  const id = Number(idRaw);
  const stars = Number(starsRaw);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return interaction.reply({ content: 'Invalid rating.', flags: MessageFlags.Ephemeral });
  }
  const t = ctx.store.read('tickets', []).find((x) => x.id === id && x.openerId === interaction.user.id && x.status === 'CLOSED');
  if (!t) return interaction.reply({ content: 'This ticket is not yours or is not closed.', flags: MessageFlags.Ephemeral });
  if (t.rating) return interaction.reply({ content: 'You already rated this ticket.', flags: MessageFlags.Ephemeral });
  await ctx.store.update('tickets', [], (l) => {
    const rec = l.find((x) => x.id === id);
    if (rec) rec.rating = stars;
  });
  return interaction.reply({ content: `Thanks! Rated ${stars}/5.`, flags: MessageFlags.Ephemeral });
}

function ratingRow(ticketId) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
      .setCustomId(`ticket:rate:${ticketId}:${n}`)
      .setLabel(`${n}★`)
      .setStyle(ButtonStyle.Secondary)),
  );
}

async function showStats(interaction, ctx) {
  if (!await isStaff(interaction, ctx)) return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  const target = interaction.options.getUser('staff') || interaction.user;
  const closed = ctx.store.read('tickets', []).filter((t) => t.status === 'CLOSED' && t.closedBy === target.id);
  const claimed = ctx.store.read('tickets', []).filter((t) => t.claimedBy === target.id);
  const times = closed.filter((t) => t.closedAt && t.createdAt).map((t) => new Date(t.closedAt) - new Date(t.createdAt));
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60000) : 0;
  const ratings = closed.filter((t) => t.rating).map((t) => t.rating);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : 'n/a';
  return interaction.reply({
    content: `Staff: ${target.tag}\nClaimed: ${claimed.length}\nClosed: ${closed.length}\nAvg resolution: ${avgMin} min\nAvg rating: ${avgRating}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function postPanel(interaction, ctx) {
  const settings = await getSettings(ctx);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:open')
    .setPlaceholder('Choose a category')
    .addOptions(settings.ticketCategories.map((c) => ({ label: c.label, description: c.description, value: c.id })));
  const embed = new EmbedBuilder().setTitle('Support Tickets').setDescription('Select a category below to open a private ticket.');
  await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  await interaction.reply({ content: 'Panel posted.', flags: MessageFlags.Ephemeral });
}

function controlRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('✋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:hrclaim').setLabel('HR Override').setStyle(ButtonStyle.Secondary),
  );
}


module.exports = {
  ticketsCmd,
  execute,
  isStaff,
  openTicketFor,
  updateTicket,
  controlRow,
  ratingRow,
  postPanel,
  escalate,
  rateTicket,
  showStats,
  showControlPanel,
};
