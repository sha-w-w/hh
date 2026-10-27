'use strict';

const { Client, GatewayIntentBits, Partials, MessageFlags } = require('discord.js');
const { loadConfig } = require('./config');
const { JsonStore } = require('./store');
const { commands, componentHandlers, modalHandlers } = require('./commands');
const { filterTicketMessage } = require('./commands/tickets');
const { registerGuildCommands } = require('./register');
const { isControlCommand } = require('./control');

const cfg = loadConfig();
const store = new JsonStore(cfg.dataDir);
const ctx = { cfg, store, log: console };

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

// Matches "prefix:rest" custom IDs against the handler table.
function dispatch(table, customId) {
  const key = customId.split(':')[0];
  return table.get(key);
}
const componentMap = new Map(componentHandlers.map((h) => [h.prefix, h.run]));
const modalMap = new Map(modalHandlers.map((h) => [h.prefix, h.run]));

// Timing lines are printed only while the developer diagnostics toggle is on.
function logTiming(label, interaction, started) {
  if (!ctx.diagnostics) return;
  ctx.log.info(`[diag] ${label} by ${interaction.user.id} took ${Date.now() - started}ms`);
}

async function safeReply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (err) {
    ctx.log.error('Failed to send error reply:', err);
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) return;
      if (cmd.developerOnly && interaction.user.id !== cfg.developerId) {
        return interaction.reply({ content: 'This command is restricted.', flags: MessageFlags.Ephemeral });
      }
      const started = Date.now();
      await cmd.execute(interaction, ctx);
      logTiming(`/${interaction.commandName}`, interaction, started);
      return;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
      const run = dispatch(componentMap, interaction.customId);
      if (run) {
        const started = Date.now();
        await run(interaction, ctx);
        logTiming(`component ${interaction.customId}`, interaction, started);
      }
      return;
    }
    if (interaction.isModalSubmit()) {
      const run = dispatch(modalMap, interaction.customId);
      if (run) {
        const started = Date.now();
        await run(interaction, ctx);
        logTiming(`modal ${interaction.customId}`, interaction, started);
      }
    }
  } catch (err) {
    ctx.log.error('Interaction error:', err);
    await safeReply(interaction, 'Something went wrong. Please try again.');
  }
});

// +control (developer only, inside the configured guild): refresh runtime data and re-register guild commands.
async function handleControl(message) {
  if (!isControlCommand(message, cfg)) return;
  try {
    ctx.store.read('settings', {}); // confirms the database file is readable and valid JSON
    const count = await registerGuildCommands(cfg);
    await message.reply(`Control: data reloaded, ${count} guild command(s) re-registered. Global commands cleared.`);
  } catch (err) {
    ctx.log.error('+control failed:', err);
    await message.reply('Control failed. Check the console for details.').catch(() => {});
  }
}

client.on('messageCreate', (message) => {
  handleControl(message).catch((err) => ctx.log.error('Control handler failed:', err));
  filterTicketMessage(message, ctx).catch((err) => ctx.log.error('Ticket message filter failed:', err));
});

client.once('ready', (c) => {
  ctx.log.info(`Logged in as ${c.user.tag}`);
  require('./services/maintenance').start(client, ctx);
});

client.login(cfg.token);
