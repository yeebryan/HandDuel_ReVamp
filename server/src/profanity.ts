// Common profanity list — extend as needed.
// Words are matched case-insensitively as whole words or substrings within names.
const BAD_WORDS = [
  'fuck', 'fuck', 'fuk', 'f u c k',
  'shit', 'sh1t', 'sht',
  'ass', 'arse',
  'bitch', 'b1tch',
  'cunt', 'c u n t',
  'cock', 'dick', 'd1ck',
  'pussy',
  'bastard',
  'nigger', 'nigga',
  'faggot', 'fag',
  'whore', 'slut',
  'piss', 'poop', 'poo', 'crap',
  'damn', 'hell',
  'retard',
  'sex', 'porn',
  'penis', 'vagina',
];

function asterisk(word: string): string {
  if (word.length <= 2) return '*'.repeat(word.length);
  return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
}

export function filterProfanity(name: string): string {
  let result = name;
  for (const bad of BAD_WORDS) {
    // Match the bad word case-insensitively anywhere in the name
    const regex = new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, (match) => asterisk(match));
  }
  return result;
}
