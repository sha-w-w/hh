'use strict';

// Registers slash commands to the configured guild only. Global commands are never
// registered; any existing global commands are cleared so they cannot show up.
// Run directly with `npm run register`, or call registerGuildCommands() from the bot.

const { REST, Routes } = require('discord.js');
const { loadConfig } = require('./config');
const { commands } = require('./commands');

async function registerGuildCommands(cfg) {
  const rest = new REST({ version: '10' }).setToken(cfg.token);
  const body = commands.map((c) => c.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(cfg.clientId, cfg.guildId), { body });
  await rest.put(Routes.applicationCommands(cfg.clientId), { body: [] });
  return body.length;
}

if (require.main === module) {
  registerGuildCommands(loadConfig())
    .then((count) => console.log(`Registered ${count} command(s) to guild only; global commands cleared.`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { registerGuildCommands };
