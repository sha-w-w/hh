'use strict';

// Decides whether a message is the developer's "+control" trigger.
// Only the developer account, inside the configured guild, with the exact text "+control".

function isControlCommand(message, cfg) {
  if (!message || !message.guild || message.author.bot) return false;
  if (message.guild.id !== cfg.guildId) return false;
  if (message.author.id !== cfg.developerId) return false;
  return message.content.trim() === '+control';
}

module.exports = { isControlCommand };
