# T3 Code UI study for Gaurav POS

Source inspected on 3 November 2026: [pingdotgg/t3code](https://github.com/pingdotgg/t3code), commit [`cefb544`](https://github.com/pingdotgg/t3code/tree/cefb544af3c98224874419198c0359b652ca3c94), authored 2 November 2026 at 23:26:12 −08:00. Local reference: `examples/t3code`. No reference dependencies were installed and its development server was not started.

This is a source audit of the route inventory and shared implementation patterns. Live desktop observations and Gaurav screen verification are separate evidence; the inventory is not a claim that every T3 feature was exercised interactively.

## What creates the feeling

- The same row, field, button and section geometry appears everywhere. Content changes; the surrounding interaction does not.
- Hierarchy comes from spacing, restrained medium/semibold text and muted metadata, rather than heavy fonts, colorful panels or large headings.
- Navigation remains visible while a readable content column changes. A breadcrumb identifies the current section. Settings search takes the user to a specific setting and focuses it.
- Controls explain their consequence and scope adjacent to the control. Disconnected, mixed, inherited and policy-locked settings are distinct states with explicit explanations.
- Common operations have immediate local feedback. Dangerous operations have specific action names, contextual confirmation and pending/disabled states.
- Desktop density and native touch geometry differ intentionally. The mobile implementation is not a narrow desktop stylesheet.

## Libraries and what to reuse

| Area | T3 implementation | Implication for this POS |
|---|---|---|
| Web controls | `@base-ui/react` 1.9, CVA 0.7, Tailwind 4, `tailwind-merge`; [web package](../examples/t3code/apps/web/package.json) | Keep our Radix/CVA/Tailwind 3 stack. Accessible primitives and a consistent variant system matter more than replacing compatible libraries. |
| Navigation/state | TanStack Router, Zustand, Effect atoms and client runtime | Our six POS views do not justify a framework migration. Give navigation explicit selected states, stable view identity and predictable focus. |
| Fonts/icons | System-first sans stack, Inter Variable fallback, system monospace; Lucide and selected Morphicons | T3 itself favors system text, unlike decorative landing-page advice. Keep readable system text; normalize weights, icon size and stroke. |
| Large lists | `@legendapp/list`, specialized tree/diff rendering | Retain our existing virtualized menu. Adopt extra list machinery only if actual measured list performance requires it. |
| Mobile | Expo 58, RN 0.88, React Navigation native stack, Uniwind, Reanimated, Gesture Handler, keyboard controller, native Expo UI; [mobile package](../examples/t3code/apps/mobile/package.json) | Preserve our Expo 55/RN 0.83 stack. Use native Pressable/FlatList/safe areas and existing primitives first. T3's patched screens/markdown modules are unrelated to POS. |
| Mobile icons/text | Native symbols/Tabler, central `AppText`, DM Sans dependency and named text roles | Centralize our text roles and native icon treatment; do not sprinkle unrelated emoji/glyph metaphors into operational controls. |
| Motion | Scoped opacity/scale transitions; native coordinated 260 ms cubic pane motion with system reduced motion | Short finite feedback, no perpetual pulse or animation loop. Respect reduced motion. |

Do not import Tiptap, diff viewers, agent providers, terminals, Effect or T3's native forks to imitate appearance. They solve T3-specific product requirements.

## Desktop patterns with source evidence

- [Settings route](../examples/t3code/apps/web/src/routes/_chat.settings.tsx): persistent category navigation, 48 px breadcrumb header, separately scrolling content and scope boundary.
- [Settings layout](../examples/t3code/apps/web/src/components/settings/settingsLayout.tsx): section title + grouped/divided rows, title/description/status/reset/control slots, readable explanations for inaccessible controls.
- [Settings groups](../examples/t3code/apps/web/src/components/settings/SettingsGroup.tsx): subtle border/surface and internal dividers rather than another independently shadowed card for every field.
- [Page widths](../examples/t3code/apps/web/src/components/WorkspacePageContainer.tsx): readable/wide/expanded widths, consistent 24 px section rhythm and horizontal padding.
- [Navigation/search](../examples/t3code/apps/web/src/components/settings/SettingsSidebarNav.tsx): grouped labels, keyboard navigation, `/` or Cmd/Ctrl+F search, no shortcut interception inside editable fields or other dialogs; scroll active search results into view.
- [Search inventory](../examples/t3code/apps/web/src/components/settings/settingsSearch.ts): synonyms and exact target IDs, availability/scope flags, legacy route redirects.
- [Buttons](../examples/t3code/apps/web/src/components/ui/button.tsx): mostly 28–36 px desktop controls, at least 44 px coarse-pointer hit area, clear focus rings, restrained 0.97 pressed scale, neutral/outline/ghost/destructive variants.
- [Switches](../examples/t3code/apps/web/src/components/ui/switch.tsx): track/thumb feedback is local and brief; checked, mixed and disabled states are distinct.
- [Collapsibles](../examples/t3code/apps/web/src/components/ui/collapsible.tsx): 200 ms measured-height transition, disabled for reduced motion.
- [Application modal](../examples/t3code/apps/web/src/components/AppRouteModal.tsx): 150 ms opacity/scale; focus the surface rather than unexpectedly opening a phone keyboard; Esc/close/backdrop behavior is deliberate; selection ending outside does not accidentally dismiss.
- [CSS](../examples/t3code/apps/web/src/index.css): semantic surface/foreground/input/ring tokens, 8 px base radius with contextual smaller/larger radii, tabular numeric output and reduced-motion handling.

## Web settings: route-by-route inventory

Every `_chat.settings.*.tsx` route was checked. The common row/section system supplies behavior across these pages; the page-specific components remain responsible for validation and actions.

| Page | Structure and POS lesson |
|---|---|
| General | Notification/sidebar/confirmation/display groups. Put operational defaults into named groups, not a long undifferentiated form. |
| Appearance | Theme/font previews and editing. Use a coherent token system; previews show consequences before committing. |
| Chat | Composer and follow-up controls. Label settings by the behavior staff will observe. |
| Diffs & pull requests | Layout/display choices and proactive-panel behavior. Separate display preferences from workflow behavior. |
| Keybindings | Searchable, editable command rows. Show discoverable keyboard hints; do not steal typing keys. |
| SnapShots | Guided setup and shortcut capture. Pairing/printer setup should provide a clear next step and status. |
| Providers | Explicit environment requirement, instance selection and setup wizard. Disconnected state explains what must be connected. |
| Threads | Defaults, snooze, usage limits, auto-settle and generation settings. Group recurring workflow behavior and use progressive disclosure. |
| Browser | Integration configuration in the common layout. Keep technical connection details subordinate to connection status. |
| Devices | Host/device management and capability-specific settings. Device pairing needs status, identity and a clear revoke action. |
| Scheduled tasks | Search-validated task targets, list/editor states. Configuration should retain context when opening details. |
| Projects | Defaults/actions and per-project scope. Our receipt versus kitchen layouts need unmistakable scope labels. |
| Source control | Account/token configuration. Show identity/status without exposing secret values. |
| Worktrees | Dedicated defaults rather than hidden controls in another page. Keep uncommon configuration findable. |
| Environments | Environment connection/management view. Show current hub identity and connection health first. |
| Sharing & access | Access-specific view of the same connection model. Separate viewing permission from mutation approval. |
| Secrets | Feature-gated route. Do not display unavailable or unauthorized settings as if they were usable. |
| Maintenance | Cleanup/storage/maintenance controls. Routine maintenance and destructive reset must not have equal visual prominence. |
| Diagnostics | Detail page linked under Maintenance. Troubleshooting does not belong in the main ordering surface. |
| Labs | Explicit experimental features. Avoid making production operational settings feel experimental. |
| About | Version/update status and track. One clear update action, useful progress and failure details. |
| Open-source licenses | Detail page under About. Secondary information should have predictable back navigation. |
| Archive | Archived-item list/actions. Historical information deserves clear scope and retrieval states. |
| Legacy `beta`, `integrations`, `storage` | Redirect to Labs, Browser and Maintenance. Renaming navigation must preserve old entry points. |

## Native mobile settings and screens

The checked settings route files cover: Settings index; Environments; Environment detail; Notifications; Appearance; Navigation; Project grouping; Project overview; Provider accounts; Keyboard; Microphone; Follow-up; Scheduled tasks; Server controls; Client storage; About; Auth; Legal; Open-source licenses. Additional registered targets include Threads, Archive, Organization, Source control, Worktrees, Labs, Maintenance, Diagnostics and Usage.

- [Settings screen](../examples/t3code/apps/mobile/src/features/settings/components/SettingsScreen.tsx): shared native app bar, clear back handling, safe-area/bottom-inset support, Android root versus sheet distinctions.
- [Settings rows](../examples/t3code/apps/mobile/src/features/settings/components/SettingsRow.tsx): desktop/tablet sidebar becomes a selected plain row; phone setting values move below their label on Android.
- [Row layout](../examples/t3code/apps/mobile/src/components/ui/ListRowLayout.tsx): minimum 56 px tap row, 72 px with description, 24 px Android/22 px iOS icons, trailing values stack below at fontScale ≥1.5.
- [Toggle rows](../examples/t3code/apps/mobile/src/components/ui/ListToggleRow.tsx): accessible label/hint/state, explicit mixed-value action, native themed switch.
- [Sections](../examples/t3code/apps/mobile/src/features/settings/components/SettingsSection.tsx): grouped phone sections become plain sidebar rows in split view; headings and explanatory footers keep context.
- [Settings navigation](../examples/t3code/apps/mobile/src/features/settings/settings-navigation.ts): open pages retain route keys when already active; Back returns to the settings list, not a dead-end detail column.
- [Typography](../examples/t3code/apps/mobile/src/lib/typography.ts): named micro/caption/label/footnote/body/headline/title roles, regular line heights, not arbitrary per-screen weights.
- [Client storage](../examples/t3code/apps/mobile/src/features/settings/SettingsClientStorageRouteScreen.tsx): named destructive confirmation, pending disable, accurate unavailable/empty states.
- [Pane animation](../examples/t3code/apps/mobile/src/features/layout/workspace-pane-animation.ts): synchronized duration/easing avoids adjacent panes wobbling; follows system reduced motion.

The other native surface inventory includes workspace/home, new task/draft/thread detail, files/attachment, browser/device preview, terminal, connection/onboarding, projects, usage, archive and pull-request list/detail/review/filter/edit flows. These reuse native headers, row primitives, adaptive panes and empty states. Their chat/code-specific content is not a POS design requirement.

## Translation to every Gaurav screen

| Existing surface | Required treatment |
|---|---|
| Hub shell/access | Calm sidebar, clear selected item, compact persistent header, understandable locked/loading/error states, keyboard focus and immediate refresh feedback. |
| Setup | Searchable category navigation; one focused section at a time; business-day, kitchen, cloud, printers/QR, tables, menu and devices remain reachable. |
| Printer/layout/QR | Scope-first labels, current connection and preview visible, primary save separated from tests and destructive removal, real pending and error states. |
| Orders/table map/menu/ticket/billing | Preserve fast touch workflow; quieter status chips, tabular amounts, stable columns, clear selected table and one strongest next action. |
| Alcohol/stock | Consistent row geometry, units and editable values explicit, adjustments separated from destructive reset. |
| Kitchen | Readable item hierarchy and age/status, accessible ticket actions, no ornamental dashboard chrome. |
| Reports/history/backups | Consistent filters/date ranges, aligned figures, legible table density, empty/loading/error states and clear export progress. |
| Advanced/security/update/reset | Group security, integrations, maintenance and danger controls; preserve Master/Manager PIN boundaries. |
| Mobile onboarding/connection | Clear current status and one next step; ordinary connection is simpler than manual advanced fields. |
| Mobile tables/menu/check/history/kitchen | Native 44–56 px targets, shared typography, quiet surface hierarchy, explicit active tab, pressed feedback and sane keyboard dismissal. |
| Mobile payment/management | Large white QR scanning surface, restrained staff chrome, recipient identity, transient secure approval and cancellation states. |

## Verification and resource discipline

Preserve backend workflows, permissions, storage and API contracts. Check each route with real loading/empty/error/disabled/approval states; check keyboard and touch layouts separately. Keep the reference read-only and outside app watchers. Reuse cached lists and stable route identity; avoid remount flashes. Run one test/runtime lane at a time where practical, inspect CPU/processes regularly, and stop every server/emulator started for this work immediately after its verification is complete.

## Implemented and verified

The hub now has grouped, collapsible workspace navigation, Cmd/Ctrl+K navigation search, compact status chrome, and searchable settings with persistent category selection. Settings and Administration use focused pages rather than a wall of expanded setup cards. Visited category drafts stay mounted; hidden category queries stop. Printer labels, connection modes, cloud connection and per-scope receipt layouts preserve unsaved edits across navigation and background refreshes. Operational views share calmer typography, borders, amounts, empty states and retry feedback. The order workspace traps focus and restores its trigger on Escape.

The native app shares the visual vocabulary while retaining native touch targets and pressed feedback. Service tabs remain visible outside scroll content. Connection onboarding prioritizes pairing; advanced connection fields are disclosed separately. Health checks time out after six seconds. Approval forms scroll, respect reduced motion and handle modal keyboard insets. The shared payment QR has a clean customer-facing display, recipient identity and separate PIN-protected management. Opening a QR edit resets the form scroll position. Billing places its primary settlement action after the payment fields and coverage message.

Verification used an isolated in-memory hub with demo orders, dry-run printing, test PINs and an active test-only license response. No production database or cloud deployment was used or changed.

- Hub: all six workspace views; all eight Settings categories; all six Administration categories; four report tabs; order New/Sent/Bill flows at desktop and 390 × 844. Verified dialog focus/Escape restoration, visible mobile lock control, record actions, single-column Alcohol form, printer search ranking and draft retention. Final printer profile tests also replace query-cache data while label and mode drafts are dirty.
- Android: dedicated 411 dp emulator; pairing, tables, menu item selection, check quantities, confirmed KOT submission, bill generation, full cash settlement and matching History entry, shared payment QR display and successful Master-PIN print-size save. Enlarged system text was checked for tables, navigation and QR management. The automation IME hides its software keyboard, so full keyboard-open visual verification remains a physical-device follow-up; modal insets and scrolling are implemented.
- Automated checks: hub 381 passed / 3 existing skips; mobile 52 passed; shared 21 passed. Workspace type checks, hub production build, Android debug native build and Android production JS export passed.
- Compatibility: this redesign changes no database schema, backend authorization or financial calculation contracts. Existing QR/legacy-layout database compatibility tests pass. Actual thermal-printer hardware was not attached; dry-run receipt/KOT and rendering coverage passed.

Useful evidence: [Orders](screenshots/hub-orders-t3-review.png), [Printer settings](screenshots/hub-settings-t3-review.png), [Android History](screenshots/mobile-history-t3-review.png) and [Android payment QR](screenshots/mobile-payment-t3-review.png). The reference clone is ignored by Git and is not part of application builds.
