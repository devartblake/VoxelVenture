// The confirmed sign-ups as a spreadsheet file (an address that starts with = + - or @ is quoted so a spreadsheet cannot run it as a formula).
export function leadsCsv(leads) {
  const cell = (v) => `"${/^[=+\-@]/.test(String(v)) ? "'" : ''}${String(v).replace(/"/g, '""')}"`;
  const rows = [['Business', 'Type', 'Email', 'Confirmed on'].map(cell).join(',')];
  for (const l of leads.items) for (const c of l.confirmed) rows.push([l.title, l.kind === 'ad' ? 'Ad space' : 'Business', c.email, new Date(c.at).toISOString().slice(0, 10)].map(cell).join(','));
  return rows.join('\r\n');
}
