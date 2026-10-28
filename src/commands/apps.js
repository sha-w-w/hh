'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ChannelType,
} = require('discord.js');
const { getSettings } = require('../services/settings');
const { cleanText, withLock } = require('../services/helpers');

const appsCmd = new SlashCommandBuilder()
  .setName('apps')
  .setDescription('Application system: opens the control panel');

// Single command: an ephemeral panel with buttons. No subcommands.
async function execute(interaction, ctx) {
  const settings = await getSettings(ctx);
  const isStaff = Boolean(settings.staffRoleId && interaction.member.roles.cache.has(settings.staffRoleId));
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('appp:apply').setLabel('Apply').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('appp:history').setLabel('My History').setStyle(ButtonStyle.Secondary),
  )];
  if (isStaff) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('appp:post').setLabel('Post Apply Button').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('appp:export').setLabel('Export JSON').setStyle(ButtonStyle.Secondary),
    ));
  }
  return interaction.reply({ content: 'Application panel', components: rows, flags: MessageFlags.Ephemeral });
}

async function runPanelAction(interaction, ctx, action) {
  if (action === 'apply') return startApply(interaction, ctx);
  if (action === 'history') return showHistory(interaction, ctx);
  if (action === 'export') return exportApps(interaction, ctx);
  if (action === 'post') return postApplyButton(interaction, ctx);
}

async function postApplyButton(interaction, ctx) {
  const settings = await getSettings(ctx);
  if (!interaction.member.roles.cache.has(settings.staffRoleId)) {
    return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('app:start').setLabel('Apply').setStyle(ButtonStyle.Success),
  );
  await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(settings.applicationTemplate.title).setDescription('Click Apply to submit.')], components: [row] });
  return interaction.reply({ content: 'Posted.', flags: MessageFlags.Ephemeral });
}

async function showHistory(interaction, ctx) {
  const mine = ctx.store.read('applications', []).filter((a) => a.userId === interaction.user.id);
  if (!mine.length) return interaction.reply({ content: 'No applications on record.', flags: MessageFlags.Ephemeral });
  const lines = mine.slice(-10).map((a) => `#${a.id} • ${a.status} • ${a.submittedAt}`).join('\n');
  return interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
}

async function exportApps(interaction, ctx) {
  const settings = await getSettings(ctx);
  if (!interaction.member.roles.cache.has(settings.staffRoleId)) {
    return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  }
  const json = JSON.stringify(ctx.store.read('applications', []), null, 2);
  return interaction.reply({ content: 'Export attached.', files: [{ attachment: Buffer.from(json), name: 'applications.json' }], flags: MessageFlags.Ephemeral });
}

async function startApply(interaction, ctx) {
  const settings = await getSettings(ctx);
  const cooldownMs = ctx.cfg.applicationCooldownHours * 3600000;
  // Lock per user so two quick clicks cannot both pass the cooldown check.
  const allowed = await withLock(`apply:${interaction.user.id}`, () => {
    const last = ctx.store.read('applications', []).filter((a) => a.userId === interaction.user.id).pop();
    return !(last && Date.now() - new Date(last.submittedAt).getTime() < cooldownMs);
  });
  if (!allowed) {
    return interaction.reply({ content: 'Please wait before applying again.', flags: MessageFlags.Ephemeral });
  }
  const questions = settings.applicationTemplate.questions.slice(0, 5);
  const modal = new ModalBuilder().setCustomId('app:submit').setTitle(settings.applicationTemplate.title.slice(0, 45));
  questions.forEach((q, i) => modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
    ),
  ));
  return interaction.showModal(modal);
}

async function submitApplication(interaction, ctx) {
  const settings = await getSettings(ctx);
  const questions = settings.applicationTemplate.questions.slice(0, 5);
  const answers = questions.map((q, i) => ({ question: q, answer: interaction.fields.getTextInputValue(`q${i}`).trim() }));
  const id = await ctx.store.update('counters', { appSeq: 0 }, (d) => { d.appSeq = (d.appSeq || 0) + 1; }).then((d) => d.appSeq);
  const record = { id, userId: interaction.user.id, answers, status: 'PENDING', submittedAt: new Date().toISOString(), reviewerId: null };
  await ctx.store.update('applications', [], (list) => { list.push(record); });

  if (settings.applicationReviewChannelId) {
    const channel = await interaction.guild.channels.fetch(settings.applicationReviewChannelId).catch(() => null);
    if (channel) {
      const embed = new EmbedBuilder().setTitle(`Application #${id}`).setDescription(`Submitted by <@${interaction.user.id}>`)
        .addFields(answers.map((a) => ({ name: a.question.slice(0, 256), value: a.answer.slice(0, 1024) })));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app:accept:${id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app:deny:${id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`app:note:${id}`).setLabel('Add Note').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`app:interview:${id}`).setLabel('Interview').setStyle(ButtonStyle.Primary),
      );
      await channel.send({ embeds: [embed], components: [row] });
    }
  }
  return interaction.reply({ content: `Application #${id} submitted.`, flags: MessageFlags.Ephemeral });
}

async function setStatus(interaction, ctx, id, status) {
  const settings = await getSettings(ctx);
  if (!settings.staffRoleId || !interaction.member.roles.cache.has(settings.staffRoleId)) {
    return interaction.reply({ content: 'Only staff can review applications.', flags: MessageFlags.Ephemeral });
  }
  const updated = await ctx.store.update('applications', [], (list) => {
    const a = list.find((x) => x.id === id);
    if (a) { a.status = status; a.reviewerId = interaction.user.id; a.reviewedAt = new Date().toISOString(); }
    return list;
  });
  const app = updated.find((x) => x.id === id);
  if (!app) return interaction.reply({ content: 'Application not found.', flags: MessageFlags.Ephemeral });
  if (status === 'ACCEPTED' && settings.applicationRoleId) {
    const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
    if (member) await member.roles.add(settings.applicationRoleId).catch((e) => ctx.log.error(e));
  }
  const user = await interaction.client.users.fetch(app.userId).catch(() => null);
  if (user) await user.send(`Your application #${id} was ${status.toLowerCase()}.`).catch(() => {});
  return interaction.reply({ content: `Application #${id} marked ${status}.`, flags: MessageFlags.Ephemeral });
}

const componentHandlers = [
  { prefix: 'appp', run: async (interaction, ctx) => runPanelAction(interaction, ctx, interaction.customId.split(':')[1]) },
  { prefix: 'app', run: async (interaction, ctx) => {
    const [, action, idRaw] = interaction.customId.split(':');
    if (action === 'start') return startApply(interaction, ctx);
    if (action === 'accept') return setStatus(interaction, ctx, Number(idRaw), 'ACCEPTED');
    if (action === 'deny') return openDenyModal(interaction, Number(idRaw));
    if (action === 'note') return openNoteModal(interaction, Number(idRaw));
    if (action === 'interview') return openInterview(interaction, ctx, Number(idRaw));
  } },
];

async function openInterview(interaction, ctx, id) {
  const settings = await getSettings(ctx);
  if (!interaction.member.roles.cache.has(settings.staffRoleId)) {
    return interaction.reply({ content: 'Only staff can open interviews.', flags: MessageFlags.Ephemeral });
  }
  const app = ctx.store.read('applications', []).find((x) => x.id === id);
  if (!app) return interaction.reply({ content: 'Application not found.', flags: MessageFlags.Ephemeral });
  const thread = await interaction.channel.threads.create({
    name: `interview-${id}`,
    type: ChannelType.PrivateThread,
    invitable: false,
  });
  await thread.members.add(app.userId).catch(() => {});
  await thread.members.add(interaction.user.id).catch(() => {});
  await ctx.store.update('applications', [], (list) => {
    const a = list.find((x) => x.id === id);
    if (a) { a.status = 'INTERVIEWING'; a.interviewThreadId = thread.id; }
  });
  return interaction.reply({ content: `Interview thread created: <#${thread.id}>`, flags: MessageFlags.Ephemeral });
}

function openDenyModal(interaction, id) {
  const modal = new ModalBuilder().setCustomId(`app:denyreason:${id}`).setTitle(`Deny application #${id}`);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('reason').setLabel('Reason sent to the applicant').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500),
  ));
  return interaction.showModal(modal);
}

function openNoteModal(interaction, id) {
  const modal = new ModalBuilder().setCustomId(`app:notesubmit:${id}`).setTitle(`Staff note on #${id}`);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('note').setLabel('Private staff note').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800),
  ));
  return interaction.showModal(modal);
}

async function addNote(interaction, ctx, id) {
  const settings = await getSettings(ctx);
  if (!settings.staffRoleId || !interaction.member.roles.cache.has(settings.staffRoleId)) {
    return interaction.reply({ content: 'Only staff can add notes.', flags: MessageFlags.Ephemeral });
  }
  const note = cleanText(interaction.fields.getTextInputValue('note'), 800);
  await ctx.store.update('applications', [], (list) => {
    const a = list.find((x) => x.id === id);
    if (a) { a.notes = a.notes || []; a.notes.push({ by: interaction.user.id, at: new Date().toISOString(), text: note }); }
  });
  return interaction.reply({ content: 'Note added.', flags: MessageFlags.Ephemeral });
}

async function handleDenyReason(interaction, ctx, id) {
  const reason = cleanText(interaction.fields.getTextInputValue('reason'), 500);
  const settings = await getSettings(ctx);
  if (!settings.staffRoleId || !interaction.member.roles.cache.has(settings.staffRoleId)) {
    return interaction.reply({ content: 'Only staff can review applications.', flags: MessageFlags.Ephemeral });
  }
  const app = ctx.store.read('applications', []).find((x) => x.id === id);
  if (!app) return interaction.reply({ content: 'Application not found.', flags: MessageFlags.Ephemeral });
  await ctx.store.update('applications', [], (list) => {
    const a = list.find((x) => x.id === id);
    if (a) { a.status = 'DENIED'; a.reviewerId = interaction.user.id; a.reviewedAt = new Date().toISOString(); a.denyReason = reason; }
  });
  const user = await interaction.client.users.fetch(app.userId).catch(() => null);
  if (user) await user.send(`Your application #${id} was denied.\nReason: ${reason}`).catch(() => {});
  return interaction.reply({ content: `Application #${id} denied.`, flags: MessageFlags.Ephemeral });
}

const modalHandlers = [
  { prefix: 'app', run: async (interaction, ctx) => {
    const [, action, idRaw] = interaction.customId.split(':');
    if (action === 'submit') return submitApplication(interaction, ctx);
    if (action === 'denyreason') return handleDenyReason(interaction, ctx, Number(idRaw));
    if (action === 'notesubmit') return addNote(interaction, ctx, Number(idRaw));
  } },
];

module.exports = { commands: [{ data: appsCmd, execute }], componentHandlers, modalHandlers };
