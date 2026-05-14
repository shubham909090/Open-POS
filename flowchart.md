# Gaurav POS Flowcharts

This file contains Mermaid diagrams for the current POS system. It is meant to travel with `context.md`.

## 1. Complete System Map

```mermaid
flowchart LR
  subgraph "Cloud"
    WorkOS["WorkOS AuthKit<br/>Google login"]
    CloudAdmin["Next.js Cloud Admin<br/>apps/cloud-admin"]
    Convex["Convex Backend<br/>convex/*"]
    CRestaurants["restaurants"]
    CMembers["memberships + invitations"]
    CInstall["installations"]
    CCommands["hubCommands"]
    CEvents["syncedEvents"]
    CReports["dailyReports<br/>dailyReportBills<br/>dailyReportItems<br/>dailyReportGroups"]
  end

  subgraph "Restaurant LAN"
    Hub["Windows Hub<br/>apps/hub-electron<br/>Fastify + React + Electron"]
    SQLite["Local SQLite<br/>Drizzle ORM + migrations"]
    HubUI["Hub UI<br/>Setup / Take Orders / Kitchen / Reports / Advanced"]
    API["Hub REST API"]
    WS["Hub WebSocket<br/>/realtime"]
    PrintQueue["Durable print_jobs queue"]
    SystemPrinter["Installed system printers"]
    NetworkPrinter["Network ESC/POS printers<br/>host + port"]
    Backup["Local backups"]
    Mobile["Android APK<br/>apps/mobile"]
    KDS["Kitchen role screen<br/>KDS routes"]
  end

  Owner["Owner/Admin/Reporting user"] --> WorkOS
  WorkOS --> CloudAdmin
  CloudAdmin --> Convex
  Convex --> CRestaurants
  Convex --> CMembers
  Convex --> CInstall
  Convex --> CCommands
  Convex --> CEvents
  Convex --> CReports

  HubUI --> API
  Mobile --> API
  KDS --> API
  API --> SQLite
  Hub --> SQLite
  Hub --> API
  Hub --> WS
  WS --> HubUI
  WS --> Mobile
  WS --> KDS
  Hub --> PrintQueue
  PrintQueue --> SystemPrinter
  PrintQueue --> NetworkPrinter
  Hub --> Backup

  Hub -->|"push events/reports<br/>/pos/ingest-events"| Convex
  Hub -->|"pull support commands<br/>/pos/pull-hub-snapshot"| Convex
```

## 2. App Responsibilities

```mermaid
flowchart TD
  Root["Gaurav POS Monorepo"]

  Root --> HubApp["apps/hub-electron"]
  Root --> MobileApp["apps/mobile"]
  Root --> CloudApp["apps/cloud-admin"]
  Root --> ConvexApp["convex"]
  Root --> SharedPkg["packages/shared"]

  HubApp --> HubDb["SQLite owner"]
  HubApp --> HubApi["LAN REST + WebSocket"]
  HubApp --> HubOps["Setup, orders, KOT/BOT, billing, reports, backups"]
  HubApp --> HubPrinting["Printer queue + retry"]
  HubApp --> HubSync["Convex sync bridge"]

  MobileApp --> MobilePair["Connect + pair"]
  MobileApp --> MobileOrder["Pick table + send order"]
  MobileApp --> MobileCaptain["Captain table/item shift"]
  MobileApp --> MobileReady["Ready alerts polling"]

  CloudApp --> CloudAuth["WorkOS Google auth"]
  CloudApp --> CloudSetup["Restaurant + staff"]
  CloudApp --> CloudHub["Owner-only hub connection"]
  CloudApp --> CloudReports["Finalized business-day reports"]
  CloudApp --> CloudAdvanced["Advanced hub command queue"]

  ConvexApp --> ConvexSchema["Cloud schema"]
  ConvexApp --> ConvexAdmin["Admin queries/mutations"]
  ConvexApp --> ConvexSync["Event ingest + command pull"]

  SharedPkg --> SharedTypes["Roles/status/money/schemas"]
  SharedPkg --> SharedTable["Shared table display state"]
```

## 3. Auth And Pairing Flow

```mermaid
sequenceDiagram
  participant Owner as Owner
  participant Admin as Cloud Admin
  participant Cloud as Cloud Admin
  participant WorkOS as WorkOS AuthKit
  participant Convex as Convex
  participant Hub as Windows Hub
  participant Phone as Android App
  participant DB as SQLite

  Owner->>Cloud: Open owner portal
  Cloud->>WorkOS: Google sign-in
  WorkOS-->>Cloud: Authenticated session
  Cloud->>Convex: Create/list restaurant and staff
  Admin->>Cloud: Manage staff/support commands after owner grants admin role
  Owner->>Convex: Create hub connection
  Convex-->>Cloud: POS_INSTALLATION_ID + POS_SYNC_SECRET
  Owner->>Hub: Paste hub env values and start hub
  Owner->>Hub: Unlock with HUB_ADMIN_TOKEN
  Owner->>Hub: Create pairing code with device name + role
  Hub->>DB: Store one-time pairing code hash + expiry
  Hub-->>Owner: QR + manual code
  Phone->>Hub: Exchange QR/manual code
  Hub->>DB: Create local device token hash and role
  Hub-->>Phone: Local token + role
  Phone->>Hub: Future LAN requests with local token
```

## 4. Role Permission Map

```mermaid
flowchart TD
  Role["Local device role"] --> Admin["admin"]
  Role --> Captain["captain"]
  Role --> Waiter["waiter"]
  Role --> Kitchen["kitchen"]

  Admin --> A1["Setup/admin/device/printer/tax/sync/backups"]
  Admin --> A2["Billing, movement, reports"]

  Captain --> C1["Operations, billing, current reports, print"]
  Captain --> C2["Generate, print, revise, NC, settle bills"]
  Captain --> C3["Submit orders and open items"]
  Captain --> C4["Shift own open table/items"]
  Captain --> C5["Receive ready alerts"]

  Waiter --> W1["Submit orders"]
  Waiter --> W2["View running table order"]
  Waiter --> W3["No shift, no billing, no reports"]

  Kitchen --> K1["View KOT/BOT by kitchen/counter"]
  Kitchen --> K2["Mark queued/preparing/ready/served/cancelled"]
```

## 5. Daily Restaurant Operation

```mermaid
flowchart TD
  Start["Captain starts hub app"]
  Unlock["Unlock hub using HUB_ADMIN_TOKEN"]
  AutoDay["Hub assigns current business day<br/>6 AM IST to 6 AM IST"]
  Service["Restaurant service"]
  Orders["Captains/waiters take orders"]
  Kitchen["Kitchen/bar handles KOT/BOT"]
  Billing["Captain bills occupied tables"]
  Boundary{"6 AM IST boundary passed?"}
  ReadyFinalize{"Old day has open/billed tables?"}
  FixTables["Settle or cancel remaining old tables"]
  LocalReport["Hub auto-finalizes daily_report_snapshots"]
  SyncCloud["Hub queues cloud sync"]
  CloudReport["Cloud Admin Reports show finalized day after sync"]

  Start --> Unlock
  Unlock --> AutoDay
  AutoDay --> Service
  Service --> Orders
  Orders --> Kitchen
  Orders --> Billing
  Billing --> Boundary
  Boundary -- "No" --> Service
  Boundary -- "Yes" --> ReadyFinalize
  ReadyFinalize -- "Yes" --> FixTables --> ReadyFinalize
  ReadyFinalize -- "No" --> LocalReport
  LocalReport --> SyncCloud
  SyncCloud --> CloudReport
```

## 6. Setup Flow

```mermaid
flowchart TD
  Setup["Hub Setup"]
  BusinessDay["Business day auto-active<br/>6 AM IST boundary"]
  Floors["Add/edit/disable floors"]
  Tables["Add/edit/disable/delete-safe tables"]
  Counters["Add/edit/disable/delete-safe kitchens/counters"]
  Dishes["Add/edit/disable dishes<br/>name + price + optional counter + sale group"]
  Printers["Choose cash printer<br/>configure counter printers"]
  ManagerPin["Set manager PIN"]
  SaleGroups["Configure Food/Alcohol/Beverage/Other tax groups"]
  PrintText["Configure bill/KOT/BOT text"]
  PairDevices["Pair admin/captain/waiter/kitchen devices"]
  Ready["Ready for service"]

  Setup --> BusinessDay
  Setup --> Floors --> Tables
  Setup --> Counters --> Dishes
  Setup --> Printers
  Setup --> ManagerPin
  Setup --> SaleGroups
  Setup --> PrintText
  Setup --> PairDevices
  BusinessDay --> Ready
  Tables --> Ready
  Dishes --> Ready
```

## 7. Order, KOT, BOT, And Printing Flow

```mermaid
sequenceDiagram
  participant Device as Hub UI or Android
  participant API as Hub API
  participant Auth as Local Device Auth
  participant Service as OrderService
  participant DB as SQLite
  participant Printer as Print Queue
  participant KDS as Kitchen/KDS
  participant WS as WebSocket

  Device->>API: POST /orders/submit
  API->>Auth: Validate device token + role
  Auth-->>API: Actor id/name/role
  API->>Service: submitOrder(input, actor)
  Service->>DB: Create/update order and order_items snapshots
  Service->>DB: Create KOT/BOT for assigned kitchen/counter items
  Service->>DB: Create print_jobs
  Service->>DB: Append event_log + sync_outbox
  Service-->>API: Order + KOT/BOT result
  API-->>Device: Success response
  API->>WS: Broadcast table/order/ticket update
  WS-->>Device: Refresh UI from hub source of truth
  Printer->>DB: Read pending print_jobs
  Printer->>Printer: Send to system or network printer
  Printer->>DB: Mark printed or failed
  KDS->>API: GET /kds/:productionUnitId
```

## 8. Kitchen Ready Notification Flow

```mermaid
sequenceDiagram
  participant Kitchen as Kitchen/KDS role
  participant API as Hub API
  participant Service as OrderService
  participant DB as SQLite
  participant Phone as Captain/Waiter APK

  Kitchen->>API: PATCH /kot/:id/status ready
  API->>Service: update KOT status
  Service->>DB: Update kots.status
  Service->>DB: Insert ready_notifications when applicable
  Phone->>API: GET /notifications/ready
  API->>DB: Fetch unread ready alerts for device/session
  API-->>Phone: Table, counter, item ready alerts
```

## 9. Billing And Settlement Flow

```mermaid
flowchart TD
  Table["Selected running table"]
  SentItems{"Has sent items?"}
  Generate["Generate bill<br/>POST /bills/:orderId/generate"]
  PendingBill["Bill pending"]
  Adjust["Captain applies discount/tip"]
  PayChoice["Record payment rows"]
  Cash["Cash"]
  UPI["UPI"]
  Card["Card"]
  Online["Online"]
  Covered{"Payments cover final total?"}
  Punch["Punch bill<br/>POST /bills/:billId/settle"]
  PrintBill["Queue bill print job"]
  Paid["Bill paid"]
  FreeTable["Table becomes free"]

  Table --> SentItems
  SentItems -- "No" --> Table
  SentItems -- "Yes" --> Generate
  Generate --> PendingBill
  PendingBill --> Adjust
  Adjust --> PayChoice
  PayChoice --> Cash
  PayChoice --> UPI
  PayChoice --> Card
  PayChoice --> Online
  Cash --> Covered
  UPI --> Covered
  Card --> Covered
  Online --> Covered
  Covered -- "No" --> PayChoice
  Covered -- "Yes" --> Punch
  Punch --> PrintBill
  Punch --> Paid
  Paid --> FreeTable
```

## 10. Manager Approval, Revision, And NC Flow

```mermaid
flowchart TD
  Sensitive["Sensitive action requested"]
  Kind{"Action type"}
  Cancel["Cancel order"]
  Reprint["Reprint KOT/BOT or bill"]
  Revise["Revise printed/generated bill"]
  NC["Mark bill NC"]
  Pin["Manager PIN + reason required"]
  Verify{"PIN valid?"}
  Block["Block action and show error"]
  Audit["Insert manager_approvals audit"]
  Execute["Execute protected action"]

  Sensitive --> Kind
  Kind --> Cancel
  Kind --> Reprint
  Kind --> Revise
  Kind --> NC
  Cancel --> Pin
  Reprint --> Pin
  Revise --> Pin
  NC --> Pin
  Pin --> Verify
  Verify -- "No" --> Block
  Verify -- "Yes" --> Audit --> Execute

  Revise --> RevisionGuard{"Any payment recorded?"}
  RevisionGuard -- "Yes" --> Block
  RevisionGuard -- "No" --> Pin

  NC --> NCGuard{"Any normal payment recorded?"}
  NCGuard -- "Yes" --> Block
  NCGuard -- "No" --> Pin
```

## 11. Open Item Flow

```mermaid
flowchart TD
  OpenItem["Add open item"]
  Inputs["Enter name, price, sale group, optional kitchen/counter"]
  Snapshot["Store directly in order_items snapshot<br/>menu_item_id nullable"]
  Ticket{"Kitchen/counter assigned?"}
  NoTicket["Billable only<br/>no KOT/BOT"]
  TicketJob["Create KOT/BOT + print job"]
  Bill["Included in bill tax/report math"]
  Reports["Included in item/group summaries"]

  OpenItem --> Inputs --> Snapshot
  Snapshot --> Ticket
  Ticket -- "No" --> NoTicket --> Bill
  Ticket -- "Yes" --> TicketJob --> Bill
  Bill --> Reports
```

## 12. Table And Item Movement Flow

```mermaid
flowchart TD
  Request["Move request<br/>full table or selected items"]
  Auth["Hub derives actor from device token"]
  Role{"Actor role"}
  Waiter["waiter"]
  Captain["captain"]
  CaptainAdmin["admin"]
  Deny["Deny"]
  OwnCheck{"Captain owns open table/order?"}
  ValidCheck{"Valid source and target?"}
  Apply["Move full order or selected item quantity"]
  Audit["Insert order_movements + event_log"]
  TransferTickets["Create source/target transfer KOT/BOT where needed"]
  Refresh["Refetch source/target table state"]

  Request --> Auth --> Role
  Role --> Waiter --> Deny
  Role --> Captain --> OwnCheck
  Role --> CaptainAdmin --> ValidCheck
  OwnCheck -- "No" --> Deny
  OwnCheck -- "Yes" --> ValidCheck
  ValidCheck -- "No" --> Deny
  ValidCheck -- "Yes" --> Apply --> Audit --> TransferTickets --> Refresh
```

## 13. Business Day Finalization And Cloud Report Flow

```mermaid
sequenceDiagram
  participant HubTimer as Hub startup/report check
  participant Hub as Hub API
  participant Service as OrderService
  participant DB as SQLite
  participant Sync as ConvexSyncBridge
  participant Convex as Convex
  participant Cloud as Cloud Admin Reports

  HubTimer->>Hub: Startup, report list, or order action
  Hub->>Service: ensure current 6 AM IST business day
  Hub->>Service: finalize completed old business days
  Service->>DB: Skip old day if open/billed orders remain
  Service->>DB: Compute finalized daily snapshot
  Service->>DB: Store daily_report_snapshots
  Service->>DB: Append event_log + sync_outbox
  Hub-->>HubTimer: Current business-day summary stays available
  Sync->>Convex: POST /pos/ingest-events when internet exists
  Convex->>Convex: Store syncedEvents
  Convex->>Convex: Upsert dailyReports, bills, items, groups
  Cloud->>Convex: Query reports
  Convex-->>Cloud: Finalized business-day report details
```

## 14. Cloud Command Pull Flow

```mermaid
sequenceDiagram
  participant Admin as Cloud Admin user
  participant Cloud as Cloud Admin App
  participant Convex as Convex hubCommands
  participant Hub as Windows Hub
  participant DB as SQLite

  Admin->>Cloud: Queue support command
  Cloud->>Convex: enqueueHubCommand
  Convex->>Convex: Validate payload JSON
  Convex->>Convex: Store command
  Hub->>Convex: POST /pos/pull-hub-snapshot with cursor
  Convex-->>Hub: Commands after cursor
  Hub->>DB: Apply command locally
  Hub->>DB: Store cloud_snapshot_cursor
```

Supported command types:

- `device.revoked`
- `device.updated`
- `menu_item.upsert`
- `menu_item.disabled`
- `production_unit.upsert`
- `receipt_printer.updated`

Device commands use `hubDeviceId`.

## 15. Print Job Lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> printing: processPending
  printing --> printed: printer success
  printing --> failed: printer error
  failed --> pending: retry
  printed --> [*]
```

## 16. Table Display State

```mermaid
stateDiagram-v2
  [*] --> free
  free --> running: order opened / status occupied
  running --> bill_printed: bill generated / status billed
  bill_printed --> free: bill settled
  running --> free: order cancelled / shifted away
  free --> disabled: table inactive
  running --> needs_attention: status attention
  bill_printed --> needs_attention: status attention
```

## 17. Data Ownership Summary

```mermaid
flowchart LR
  LiveOps["Live restaurant operations"] --> HubTruth["Hub SQLite is source of truth"]
  HubTruth --> Orders["orders/order_items"]
  HubTruth --> Tickets["kots/kot_items"]
  HubTruth --> Bills["bills/bill_revisions/payments"]
  HubTruth --> Print["print_jobs"]
  HubTruth --> Events["event_log/sync_outbox"]

  CloudOwner["Owner/admin/reporting cloud work"] --> ConvexTruth["Convex is cloud/admin source"]
  ConvexTruth --> Restaurants["restaurants/memberships"]
  ConvexTruth --> Installations["installations<br/>created by owner only"]
  ConvexTruth --> Commands["hubCommands"]
  ConvexTruth --> Reports["daily reports after sync"]

  HubTruth -->|"event sync"| ConvexTruth
  ConvexTruth -->|"command pull"| HubTruth
```
