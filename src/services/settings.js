'use strict';

// Guild settings (channel/role bindings) stored in data/settings.json.

const DEFAULTS = {
  ticketCategoryId: null,
  ticketLogChannelId: null,
  staffRoleId: null,
  hrRoleId: null,
  supportRoleId: null,
  applicationReviewChannelId: null,
  applicationRoleId: null,
  ticketCategories: [
    { id: 'support', label: 'General Support', description: 'Help with the server or your account' },
    { id: 'billing', label: 'Billing Inquiry', description: 'Questions about payments' },
    { id: 'partnership', label: 'Partnership', description: 'Business and partnership requests' },
  ],
  applicationTemplate: {
    title: 'Staff Application',
    questions: ['Tell us about yourself', 'Why do you want to join?', 'Your relevant experience'],
  },
};

async function getSettings(ctx) {
  const stored = ctx.store.read('settings', {});
  return { ...DEFAULTS, ...stored };
}

async function updateSettings(ctx, patch) {
  return ctx.store.update('settings', {}, (data) => Object.assign(data, patch));
}

module.exports = { getSettings, updateSettings, DEFAULTS };
