// Shared by the unit tests: a fresh temporary data folder for this test
// process, set up before any app module is loaded (config.js reads the
// environment when it's first required). `node --test` runs each file in its
// own process, so files never share a folder.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdesk-unit-'));
process.env.TASKDESK_LOCAL_DIR = DATA;
process.env.TASKDESK_LOCAL_DATA = '1';
process.env.TASKDESK_NO_UPDATE = '1';

// A scratch folder inside the data folder, for files a test wants to read or write.
const scratch = (name) => {
  const d = path.join(DATA, 'scratch', name);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

module.exports = { DATA, scratch };
