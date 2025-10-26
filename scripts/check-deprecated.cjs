const { execSync } = require('child_process');
const p = require('../package.json');
Object.keys(p.dependencies || {}).forEach((k) => {
  try {
    const out = execSync('npm view ' + k + ' deprecated --silent', { encoding: 'utf8' }).trim();
    console.log(k + ': ' + (out ? 'DEPRECATED - ' + out : 'OK'));
  } catch (e) {
    console.log(k + ': ERROR');
  }
});
