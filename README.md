# Modular Discord Bot

Ticket system, application system, and admin panels. Data is stored in one JSON file (`data/db.json`). No database server needed.

## Setup (about 5 minutes)

1. **Install Node.js 18 or newer** from https://nodejs.org
2. **Open `config.json`** and replace the three placeholders:
   - `token`: from the Discord Developer Portal → your app → Bot → Reset Token
   - `clientId`: your app's Application ID (General Information page)
   - `guildId`: your server ID (right-click the server with Developer Mode on → Copy Server ID). Required. Commands are registered to this server only; global commands are never used.
3. **Enable the Message Content intent**: Developer Portal → your app → Bot → Privileged Gateway Intents → Message Content Intent. Required for the ticket message filter.
4. **Invite the bot** with the `bot` and `applications.commands` scopes and Administrator permission (or the specific permissions you need).
5. **Install dependencies** in this folder:

   ```
   npm install
   ```

6. **Register the slash commands** (guild only; any global commands are cleared):

   ```
   npm run register
   ```

   After this, the developer can type `+control` in the server at any time to reload data and re-register the guild commands without restarting the bot.

7. **Start the bot**:

   ```
   npm start
   ```

## First-time server setup

Run these in your server:

- `/central`: bind the ticket category, ticket log channel, staff role, HR role, Support role, application review channel, and the role granted on acceptance.
- `/tickets`: open the control panel, then **Post Ticket Panel** in the channel where members should open tickets.
- `/apps`: open the panel, then **Post Apply Button** in the channel where applications should start.

`/developer` is only available to the developer account set in `src/config.js`.

`+control` (typed as a message by the developer account, in the configured server only) reloads the bot's data file and re-registers guild commands.

## Notes

- Keep `config.json` private. Do not share it or commit it to Git.
- Only run one copy of the bot at a time; the JSON database is single-process.
- Transcripts are saved to `data/transcripts/`.
