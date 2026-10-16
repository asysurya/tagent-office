/**
 * Path: packages/cli/src/index.ts
 * Purpose: `tagent-office` binary entry. Parses the command line and
 *          dispatches to commands. Exit codes: 0 ok, 1 usage error, 2 boot
 *          failure.
 * Dependencies: ./commands/start, @tagent-office/shared
 */
import { startCommand } from './commands/start';
import { APP_VERSION } from '@tagent-office/shared';

const USAGE = `tagent-office ${APP_VERSION} — Your AI team, in your browser.

USAGE
  tagent-office start [workspace] [options]   Start the office daemon
  tagent-office --version                     Print the version
  tagent-office --help                         Show this help

START OPTIONS
  [workspace]        Workspace name agents operate in (default: demo)
  --port <number>    Daemon port (default: 4020; env TAGENT_OFFICE_PORT)
  --storage <path>   Storage root for SQLite + workspaces (default: ./storage)
  --config <path>    Config file path (default: ./tagent-office.config.json)
  --log-level <lvl>  debug | info | warn | error (default: info)

ENVIRONMENT
  TAGENT_OFFICE_BASE_URL / TAGENT_OFFICE_API_KEY / TAGENT_OFFICE_MODEL
  point the office at any OpenAI-compatible endpoint (Groq, Ollama, ...).
  See docs/configuration.md for the full reference.
`;

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start': {
      startCommand(args.slice(1));
      return;
    }
    case '--version':
    case '-v': {
      process.stdout.write(`${APP_VERSION}\n`);
      return;
    }
    case '--help':
    case '-h':
    case undefined: {
      process.stdout.write(USAGE);
      process.exitCode = command === undefined ? 1 : 0;
      return;
    }
    default: {
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      process.exitCode = 1;
    }
  }
}

main();
