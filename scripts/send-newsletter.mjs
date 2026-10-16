// Sends the Plot of the Day newsletter (run it once a day from a scheduler).
//   API_URL=https://api.example.com ADMIN_TOKEN=... npm run newsletter
const base = process.env.API_URL || 'http://localhost:3002';
const res = await fetch(`${base}/admin/newsletter`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN ?? ''}` } });
const data = await res.json().catch(() => ({}));
console.log(res.ok ? `Newsletter: ${data.already ? 'already sent today' : `${data.queued} queued (${data.subject})`}` : `Failed: ${res.status} ${data.error ?? ''}`);
process.exit(res.ok ? 0 : 1);
