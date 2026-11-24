const fs = require('fs');
const path = require('path');
const source = path.join(__dirname, '..', 'sdk', 'supernova.js');
const target = path.join(__dirname, '..', 'public', 'assets', 'supernova.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`Browser SDK copied to ${target}`);
