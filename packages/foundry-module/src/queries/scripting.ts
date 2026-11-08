import { executeScript, manageMacros } from '../services/script-runner.js';
import type { QueryGroup, QueryHandler } from './query-registry.js';

/** Running scripts and macros in the GM browser. Refused unless "Allow script and macro execution" is on. */
export class ScriptingQueries implements QueryGroup {
  routes(): Record<string, QueryHandler> {
    return {
      executeScript,
      manageMacros,
    };
  }
}
