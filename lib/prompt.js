import { createInterface } from 'node:readline';
import { RESET, BOLD, CYAN } from './constants.js';

/**
 * Prompt for free-text input using readline. Falls back to defaultValue when
 * stdin/stderr are not a TTY (e.g. CI) or when --yes/-y was requested.
 */
export async function inputPrompt(message, defaultValue = '', validate = null) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return defaultValue;
  }

  while (true) {
    const answer = await new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const hint = defaultValue ? ` (${defaultValue})` : '';
      rl.question(`${BOLD}${CYAN}?${RESET} ${BOLD}${message}${hint}${RESET}: `, (line) => {
        rl.close();
        resolve(line.trim() || defaultValue);
      });
    });

    if (!validate || validate(answer) !== false) return answer;
    process.stderr.write('  Invalid input, please try again.\n');
  }
}

/**
 * Wrapper around ctx.prompt.select that throws on cancellation.
 * Falls back to the first option when not interactive or ctx is absent.
 */
export async function promptSelect(ctx, message, options) {
  if (!ctx?.prompt) {
    return options[0].value;
  }
  const result = await ctx.prompt.select({ message, options });
  if (result.cancelled) throw new Error('Setup cancelled by user.');
  return result.value;
}
