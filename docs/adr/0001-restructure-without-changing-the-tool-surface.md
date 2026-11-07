# Restructure first, without changing the tool surface

Status: accepted (2026-11-07)

The code is reorganised into a proper architecture before any feature work: the same 50 tools and the same module queries as v0.8.6, with no tool added, dropped, renamed or reshaped. Mixing structure and behaviour changes in one step makes both unreviewable. Reshaping the tools themselves (one tool per resource with an `action`, a common result envelope, guard levels) is a separate follow-up on top of this restructure.
