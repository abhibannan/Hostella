const fetch = require('node-fetch'); // wait, I don't need node-fetch in node 18+

async function test() {
  const res = await fetch('https://hosteldesk-1.onrender.com/api/v1/renters/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test' })
  });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${text}`);
}

test();
