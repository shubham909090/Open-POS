# AGENT.md

This file defines baseline working rules for agents in any repository that adopts it.

## Core Principle

- Prefer simple, professional, readable code over clever, defensive, or overly generic code.
- More code does not mean better code.
- Prefer the smallest clear solution that solves the real problem well.
- A concise, consistent approach is better than a large, noisy, over-engineered one.
- Simplicity is the key.
- Do not guess when the correct answer can be verified through the codebase, official documentation, or web research.
- If an architecture or structural decision has meaningful tradeoffs, pause and discuss it with the user before committing to it.

## Configuration And Environment Variables

- Do not scatter environment variables, secrets, or important operational values directly across source files.
- All true environment-dependent values must be defined in `.env` or `.env.example` and accessed through a central config layer.
- If a value is not secret and does not belong in `.env`, place it in a small typed config file such as `src/config/*.ts`.
- Defaults, feature flags, limits, labels, routes, timeouts, and similar knobs should not be hidden inside random components or server files.
- Prefer one well-named config source over repeated inline literals.
- If a config value is hard to discover, the implementation is wrong and should be refactored.

## No Fallback Hell

- Do not write chains of speculative fallbacks just because the correct behavior is unclear.
- Avoid code shaped like "try five things and hope one works" unless the system truly requires that behavior.
- Verify library APIs, framework behavior, and platform constraints using local code, official docs, or web search before implementing.
- Prefer one correct path over several uncertain paths.
- Do not ship "slop that fits all cases" when the real requirement can be determined.

## Reuse Before Writing New Code

- Before creating a new utility, component, hook, service, schema, or helper, search the repository for an existing implementation.
- Reuse and extend existing code where appropriate instead of duplicating logic with slightly different names.
- If similar code already exists but is not reusable, refactor toward reuse rather than creating a second version.
- Before writing auth logic, permission checks, formatting logic, data transforms, API clients, validation, or repeated business rules, search for existing helpers or service-layer functions first.
- Do not inline logic in a route, component, handler, or mutation when the repo already has a helper, shared utility, auth layer, service, or schema location for that responsibility.
- If no helper exists and the logic is likely to be reused, create a small well-named helper in the appropriate shared or domain-specific module instead of burying it inline.
- Always leave the codebase more discoverable after the task than it was before.

## Decision Making

- If the requested implementation is likely to create technical debt, say so before coding and propose the cleaner alternative.
- If there are multiple reasonable approaches, choose the simplest maintainable one and briefly explain why.
- Do not optimize for speed of implementation at the cost of long-term clarity.

## Types And Type Safety

- Do not create client-side types that duplicate or shadow the real server types when the stack already provides them.
- For tools like tRPC, Convex, Prisma, generated SDKs, or framework-provided inference, use the types that come from the source system instead of rewriting them locally.
- Do not create manual client `type` or `interface` definitions for server responses just because it feels organized. That usually drifts from the source of truth and breaks code.
- Avoid unnecessary type casting with `as`, forced assertions, or fake narrowing just to make TypeScript quiet.
- If the server is the source of truth, the client should consume the inferred server type, not a shadow copy of it.
- Create local types only when they represent truly client-only state, UI-only transformations, or view-specific shapes that do not already exist in the backend contract.
- If a transformed client shape is needed, derive it from the original source type as simply as possible instead of redefining the original payload from scratch.

## Devlog And Lightweight Repo Memory

- Every completed task must update a lightweight devlog.
- The default location is `.agent/devlog.md` unless the repository already has an established equivalent.
- Each devlog entry should be short and include:
  - date
  - task summary
  - files added or changed
  - important functions, modules, or components introduced
  - reusable pieces worth checking before writing similar code again
  - follow-up notes or caveats if any
- Keep the devlog concise. It is a retrieval aid, not a diary.
- The goal is to preserve enough repo memory that future agents can find and reuse prior work without bloating prompt context.
- If the repo benefits from it, maintain a second tiny index such as `.agent/reuse-map.md` that lists reusable modules and what they do in one or two lines each.

## Quality Gates

- Do not present work as complete until relevant checks have been run.
- Run the appropriate feedback loop for the stack in use, typically including:
  - formatting
  - linting
  - type-checking
  - targeted tests when relevant
- If lint or type-check scripts do not exist, add them when appropriate or explicitly call out the gap.
- Respect project-specific linting and formatting rules. If the user has custom rules in mind, ask before introducing opinionated ones.
- Fix root causes where practical instead of suppressing warnings.

## File Size And Modularity

- Avoid very large files that are hard to review or reason about.
- Use a soft limit of around 300 to 500 lines for most files.
- Treat 800 lines as a strong refactor signal.
- Do not let files grow toward 1000 lines unless there is a clear and justified reason.
- Split by responsibility, not arbitrarily. Each extracted file should have a coherent purpose.
- Prefer a modular codebase where schemas, helpers, services, and feature logic live in predictable shared or feature-specific files.
- Keep Zod schemas and validation rules in a shared schema file or established schema module whenever they are reused, part of an API contract, or relevant outside one tiny local scope.
- Do not define substantial schemas inline inside routes, UI components, handlers, or mutations when a shared schema location exists.
- Keep authentication and authorization behavior behind clear helper functions or service-layer utilities instead of repeating checks throughout the codebase.
- When adding a module, place it where future agents and developers would naturally search for that responsibility.

## Readability And Professionalism

- Code should look like it was written by a careful human engineer, not generated in a rush.
- Prefer straightforward control flow over deeply nested conditionals and spread-heavy transformations.
- Do not overuse spread operators, inline object construction, or dense one-liners when they reduce readability.
- Name things clearly and consistently.
- Keep functions focused and small enough to understand without scrolling through unrelated logic.
- Add comments where they provide real value:
  - business rules
  - non-obvious tradeoffs
  - framework caveats
  - tricky implementation details
- Do not add comment noise that merely restates the code.

## Architecture Expectations

- Favor simple separation of concerns between UI, business logic, data access, side effects, schemas, and shared utilities.
- "Clean architecture" here means code is organized clearly, not that it must follow formal industry patterns or heavy abstraction.
- Call out bad design, weak architecture, brittle workflows, or poor product choices directly and professionally, like a senior developer reviewing the work.
- Do not blindly implement a request when the requested feature depends on external APIs, framework behavior, platform rules, product docs, or third-party service constraints.
- When a feature depends on documentation or reference material, verify it through official docs or reliable web research first. If the needed reference cannot be found, ask the user for the relevant docs before implementing.
- Do not introduce layered folder structures, DTO pyramids, mapper chains, or extra type wrappers unless they solve a real current problem.
- Avoid jargon-heavy names like `infra`, `adapters`, `entities`, `useCases`, or similar terms unless the project already uses them and the user is comfortable with them.
- Prefer plain, obvious names that a junior developer can understand quickly.
- Prefer boring, durable architecture over trendy patterns.
- Keep the number of files, layers, types, and indirections as low as reasonably possible.
- When an architectural decision is non-trivial, discuss the options and tradeoffs with the user before proceeding.
- Do not introduce new abstractions, libraries, or patterns only because they might be useful later.
- Build for current needs with reasonable extensibility, not speculative complexity.

## Working Style

- Search first, change second.
- Verify assumptions before encoding them into the codebase.
- If something is unclear but discoverable, investigate instead of asking the user to absorb the uncertainty.
- When blocked by a real product or architecture choice, ask concise questions and present the tradeoff clearly.
- Never do half-finished work, dirty patches, or ad hoc code just to make the immediate symptom disappear.
- Fix the real cause where practical, keep the implementation coherent, and leave the codebase in a maintainable state.
- When work is complete, leave behind enough structure, logs, and discoverability that the next agent can continue without redoing the same thinking.


<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
