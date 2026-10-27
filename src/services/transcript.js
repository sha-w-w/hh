'use strict';

// Builds a plain-text transcript of a channel by paging through its history.

const fs = require('node:fs');
const path = require('node:path');
const { redactPII } = require('./helpers');

async function fetchAll(channel) {
  const messages = [];
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return messages.reverse();
}

async function buildTranscript(channel, { transcriptDir, ticketId }) {
  const messages = await fetchAll(channel);
  const lines = messages.map((m) => {
    const attachments = [...m.attachments.values()].map((a) => ` [attachment: ${a.url}]`).join('');
    return redactPII(`[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${attachments}`);
  });
  fs.mkdirSync(transcriptDir, { recursive: true });
  const file = path.join(transcriptDir, `${ticketId}.txt`);
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return { file, count: messages.length };
}

module.exports = { buildTranscript };
