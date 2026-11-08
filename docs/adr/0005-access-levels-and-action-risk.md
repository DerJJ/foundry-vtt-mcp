# One access level, and a risk on every action

Status: accepted (2026-11-08)

Every action carries one risk: `read`, `write`, `delete` or `execute`. A GM sets one **access level** per world in the bridge's module settings:

| Level                  | Allows                    |
| ---------------------- | ------------------------- |
| Read only              | `read`                    |
| Read & write (default) | `read`, `write`           |
| Full access            | `read`, `write`, `delete` |

`execute` (macros and scripts) is not part of any level. It needs its own checkbox, which is off by default, because it runs arbitrary code in the GM's browser.

The bridge is the authority. It refuses a query whose risk the level does not allow, whatever the server sent, and the refusal names the level that would allow it. The server reads the level (`world` `capabilities`) so that the model is told what is refused before it tries.

Rejected: a switch per risk class (too much for a GM to judge for every update), calling every update destructive (too strict to work with), and enforcing in the server only (a second client of the bridge would bypass it).

Consequence: the default refuses deletions, which the tools before this change allowed. The changelog says so.
