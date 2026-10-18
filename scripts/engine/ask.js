/** "Go ahead? (y/N)" in the console window: true only for y / yes. */

import process from 'node:process';
import readline from 'node:readline/promises';

export async function askYes(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
