'use strict';

// Periodic sweep: warns on 24h ticket inactivity and auto-closes after 48h.

const { sweepInactiveTickets } = require('../commands/tickets');
const { daysAgo } = require('./helpers');

// Archives PENDING applications left unattended for 14 days.
async function purgeStaleApplications(ctx) {
  await ctx.store.update('applications', [], (list) => {
    for (const a of list) {
      if (a.status === 'PENDING' && daysAgo(a.submittedAt) >= 14) a.status = 'ARCHIVED';
    }
  });
}

function start(client, ctx) {
  const run = () =>
    Promise.all([sweepInactiveTickets(client, ctx), purgeStaleApplications(ctx)])
      .catch((err) => ctx.log.error('Maintenance sweep failed:', err));
  setInterval(run, 15 * 60 * 1000).unref();
  run();
}

module.exports = { start };
