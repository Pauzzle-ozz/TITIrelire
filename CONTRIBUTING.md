# Contributing to TI'TIrelire

First off — thank you for taking the time to contribute! 🐷 TI'TIrelire is open source
(Apache 2.0) and welcomes contributions of all sizes.

## Code of Conduct

This project and everyone participating in it is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## Ways to contribute

- 🐛 **Report bugs** — open an issue using the bug report template.
- 💡 **Suggest features** — open an issue using the feature request template.
- 📝 **Improve docs** — typos, clarifications, examples.
- 🔧 **Submit code** — fixes and features via pull requests.

## Development workflow

We follow a strict, test-first workflow (also enforced for AI-assisted work — see
[`CLAUDE.md`](./CLAUDE.md)):

1. **Audit before assuming.** Understand the surrounding code before changing it.
2. **Plan.** Break the work into clear, verifiable steps.
3. **Implement one step at a time**, finishing each to 100% — no half-done work, no
   leftover TODOs.
4. **Prove it with unit tests.** Every change ships with tests covering the nominal case,
   edge cases, and error cases. Tests must pass before a change is considered done.
5. **Commit & push per completed segment**, then verify status (CI green) before moving on.

## Pull request process

1. Fork the repository and create a branch from `main`:
   `git checkout -b feat/short-description`
2. Make your changes with accompanying tests.
3. Ensure the full test suite passes locally.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for your messages:
   `type(scope): imperative description` (e.g. `fix(wallet): handle negative balance`).
5. Open a pull request describing **what** changed and **why**. Link any related issue.
6. Be responsive to review feedback.

A PR is mergeable when: tests pass, the code is covered, it follows project conventions, and
at least one maintainer approves.

## Commit message convention

| Type       | Use for                                        |
|------------|------------------------------------------------|
| `feat`     | A new feature                                  |
| `fix`      | A bug fix                                       |
| `docs`     | Documentation only                             |
| `test`     | Adding or fixing tests                          |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                         |
| `chore`    | Tooling, deps, housekeeping                     |
| `ci`       | CI configuration                               |
| `build`    | Build system or external dependencies          |

## Style

- Code, symbol names, and public docs in **English**.
- Keep functions small and testable.
- No secrets, no debug prints, no dead code.

## License of contributions

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](./LICENSE), consistent with the rest of the project.

Thank you! 💛
