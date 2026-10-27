'use strict';

const tickets = require('./tickets');
const apps = require('./apps');
const central = require('./central');
const developer = require('./developer');
const lookup = require('./lookup');

const modules = [tickets, apps, central, developer, lookup];

module.exports = {
  commands: modules.flatMap((m) => m.commands),
  componentHandlers: modules.flatMap((m) => m.componentHandlers || []),
  modalHandlers: modules.flatMap((m) => m.modalHandlers || []),
};
