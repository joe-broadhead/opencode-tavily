# Changelog

## 0.0.0 (unreleased)

The first release in `we-the-rebel-alliance`, rebuilt from OpenCode 2.4.1 only.

- Package renamed `@we-the-rebel-alliance/tavily-plugin`; version reset to 0.0.0.
- OpenCode `>=2.4.1 <2.5.0`, tested on 2.4.1 only; older hosts and their test matrices removed.
- One spend classification in `src/spend.ts`: the five tools spend Tavily credits, status reports the `spend` class
  and the cost line, and both skills carry the drafted descriptions.
- Scripts and schedules are OpenCode automations; the Jelly docs and the Jelly-only test are gone.
- Tested on OpenCode 2.4.1.
