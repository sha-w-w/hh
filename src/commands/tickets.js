'use strict';

// Entry point for the /tickets module. The code is split across coreticket-1/2/3.js.

const p1 = require('./coreticket-1');
const p2 = require('./coreticket-2');
const p3 = require('./coreticket-3');

module.exports = {
  commands: [{ data: p1.ticketsCmd, execute: p1.execute }],
  componentHandlers: p3.componentHandlers,
  modalHandlers: p3.modalHandlers,
  filterTicketMessage: p3.filterTicketMessage,
  sweepInactiveTickets: p2.sweepInactiveTickets,
};
