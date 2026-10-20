// The rule for an admin's password, shared by the API (services/api/admin.mjs, which decides) and the admin pages (which say so first).
// Strong enough without being long: the sign-in locks a username or a network for 15 minutes after 5 failures, and a password is kept as a
// salted scrypt hash, so guessing online is slow and a stolen hash is costly to crack. A password needs:
//   - at least PASSWORD_MIN characters (at most 200);
//   - at least 3 of the 4 kinds: a lowercase letter, an uppercase letter, a number, a symbol (anything else, a space included), unless it is
//     a passphrase of PASSPHRASE_MIN characters or more ("three random words like this"), which is strong by its length alone;
//   - not to be the username, and not to be one of the passwords everybody tries first.
export const PASSWORD_MIN = 8;
export const PASSPHRASE_MIN = 16;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters with 3 of: a lowercase letter, a capital, a number, a symbol; or a phrase of ${PASSPHRASE_MIN}+ characters. Not the username.`;

const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', 'admin123', 'admin1234', 'administrator', 'letmein1', 'welcome1', 'welcome123', 'iloveyou1', '12345678', '123456789', '1234567890', 'changeme', 'changeme1', 'voxelventure', 'voxelventure1']);

const kinds = (pw) => [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;

// What is wrong with a password, in a sentence, or '' when it is fine.
export function passwordProblem(username, password) {
  const pw = String(password ?? '');
  if (pw.length < PASSWORD_MIN) return `The password must be at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 200) return 'The password is too long (200 characters at most).';
  if (pw.length < PASSPHRASE_MIN && kinds(pw) < 3) return `Use at least 3 of: a lowercase letter, a capital, a number, a symbol (or a phrase of ${PASSPHRASE_MIN} characters or more).`;
  const lower = pw.trim().toLowerCase();
  if (lower === String(username ?? '').trim().toLowerCase()) return 'The password cannot be the username.';
  if (COMMON.has(lower)) return 'That password is too common. Choose another.';
  return '';
}
