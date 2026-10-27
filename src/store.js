'use strict';

// Single-file JSON database. All collections live in one file: data/db.json.
//   store.read(name, fallback)            -> copy of a collection (or fallback)
//   store.update(name, fallback, fn)      -> run fn on the collection, save atomically
// Every write is serialized through one queue, so concurrent updates cannot lose data.

const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  constructor(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'db.json');
    this.queue = Promise.resolve();
  }

  load() {
    if (!fs.existsSync(this.file)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      throw new Error(`Corrupt database file ${this.file}: ${err.message}`);
    }
  }

  read(name, fallback) {
    const db = this.load();
    return structuredClone(name in db ? db[name] : fallback);
  }

  update(name, fallback, mutator) {
    const run = async () => {
      const db = this.load();
      if (!(name in db)) db[name] = structuredClone(fallback);
      const result = mutator(db[name]);
      if (result !== undefined) db[name] = result;
      this.writeAtomic(db);
      return db[name];
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  writeAtomic(db) {
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { JsonStore };
