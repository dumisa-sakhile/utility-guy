const { execSync } = require('child_process');
const p = require('../package.json');
console.log('Checking dependencies...');
Object.keys(p.dependencies || {}).forEach((k) => {
  try {
    const out = execSync('npm view ' + k + ' deprecated --silent', { encoding: 'utf8' }).trim();
    console.log(k + ': ' + (out ? 'DEPRECATED - ' + out : 'OK'));
  } catch (e) {
    console.log(k + ': ERROR');
  }
});
console.log('\nChecking devDependencies...');
Object.keys(p.devDependencies || {}).forEach((k) => {
  try {
    const out = execSync('npm view ' + k + ' deprecated --silent', { encoding: 'utf8' }).trim();
    console.log(k + ': ' + (out ? 'DEPRECATED - ' + out : 'OK'));
  } catch (e) {
    console.log(k + ': ERROR');
  }
});
