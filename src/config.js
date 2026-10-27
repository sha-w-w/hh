'use strict';

// Loads settings from config.json (gitignored). Copy config.example.json to start.
// Secrets such as the bot token live only in config.json, never in source control.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Missing ${CONFIG_FILE}. Copy config.example.json to config.json and fill it in.`);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!cfg.token) throw new Error('config.json: "token" is required');
  if (!cfg.clientId) throw new Error('config.json: "clientId" is required');
  if (!isSnowflake(cfg.guildId)) throw new Error('config.json: "guildId" must be your server ID (commands are guild-only)');
  return {
    token: cfg.token,
    clientId: cfg.clientId,
    guildId: cfg.guildId, // commands are registered to this guild only, never globally
    developerId: '811100216052547594', // the only user allowed to use /developer
    dataDir: path.join(ROOT, cfg.dataDir || 'data'),
    transcriptDir: path.join(ROOT, cfg.transcriptDir || 'data/transcripts'),
    inactivityWarnHours: 24,
    inactivityCloseHours: 48,
    ticketCloseCountdownSeconds: 5,
    applicationCooldownHours: 24,
  };
}

const SNOWFLAKE = /^\d{17,20}$/;
const isSnowflake = (v) => typeof v === 'string' && SNOWFLAKE.test(v);

module.exports = { loadConfig, isSnowflake, ROOT };
