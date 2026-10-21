// Opens the dashboard in this computer's browser (macOS: open, Linux: xdg-open).
// On a Raspberry Pi with no screen it only prints the address (see deploy/raspberry-pi.md).
const { execFile } = require('child_process');

const url = `http://localhost:${Number(process.env.PORT) || 3002}`;
const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;

if (!opener) {
  console.log(`Open this address in a browser: ${url}`);
} else {
  execFile(opener, [url], (err) => {
    if (err) console.log(`Could not open a browser. Open this address yourself: ${url}`);
    else console.log(`Opened ${url}`);
  });
}
