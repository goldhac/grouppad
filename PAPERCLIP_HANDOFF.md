# Paperclip Instance — Handoff Doc

**Instance:** pepelwerk (`https://paperclip.codegrind.pro`)
**Company ID:** `733c060f-0be6-4510-9e07-1fc1c13f5567`
**Snapshot taken:** 2026-06-15 · signed in as Jason Leibow
**Source:** Paperclip MCP API (company key), cross-checked against the web inbox

---

## 1. What this instance is

Paperclip is running pepelwerk's **autonomous AI agent company** — a hierarchy of 62 agents
organized like an org chart, with a CEO agent (**Money Penny**) at the top delegating to
department-head agents, who in turn delegate to specialist sub-agents. Agents pick up
**issues** (tickets, `PEP-xxx`), execute **runs**, and escalate **approvals** to a human when
they need sign-off.

There is **one project**: **Agent Ecosystem** (`agent-ecosystem`, status `in_progress`) —
the root that "orchestrates Sally (Sales), Milton (Ops), Lezle (Profile Optimization), and
Flo (Customer Success)." Lead agent: Money Penny.

---

## 2. Org structure (who reports to whom)

```
Money Penny  (CEO · running · canCreateAgents)
│
├── Flo Customer Success ............... Customer Success dept (9 agents)
│     ├── Intake & Triage
│     ├── Customer Health
│     ├── SLA Monitor & Escalation
│     ├── Follow-up & Cadence
│     ├── HITL Response            (human-in-the-loop responses)
│     ├── Product Signal
│     ├── Accounting Triage
│     └── CS Reporting & Analytics
│
├── Lezle AICA Optimization Agent ...... Profile / AICA optimization (10 agents, role=engineer)
│     ├── Profile Analysis Engine
│     ├── Profile Optimizer
│     ├── Segmentation & Prioritization
│     ├── Content & Messaging
│     ├── Channel Routing
│     ├── Recommendation Engine
│     ├── Delivery & Execution
│     ├── Data Intelligence
│     └── RGA Tracking & Attribution
│
├── Milton Ops Agent ................... Operations dept (10 agents · ERROR)
│     ├── Execution
│     ├── Verification
│     ├── Job Processing
│     ├── Document Review
│     ├── Transaction Review
│     ├── Suggestion Review
│     ├── Wallet & Code
│     ├── Daily Report
│     └── Sterling                 (senior/utility ops agent, $25 cap)
│
├── Otto ............................... Agent-optimization / analysis system (7 agents · ERROR)
│     ├── Efficiency Analysis
│     ├── Reliability Analysis
│     ├── Quality & Compliance
│     ├── Inventory & Topology
│     ├── Proposal Synthesis
│     └── QA
│
├── Sally Sales Manager ............... Sales dept (running · the only real spender)
│     ├── Sally - Carrie ............... CTE (Career & Technical Education) sub-team (6 agents)
│     │     ├── CTE District Research
│     │     ├── CTE Prospect Discovery
│     │     ├── CTE Qualification
│     │     ├── CTE Story Crafting
│     │     ├── CTE Meeting & Demo Flow
│     │     └── CTE Pipeline & Reporting
│     ├── Sally - MIT Coordinator ...... Military-in-Transition pipeline (8 agents · ERROR)
│     │     ├── Prospect Discovery
│     │     ├── Data Enrichment
│     │     ├── Quality Assurance
│     │     ├── Email Validation
│     │     ├── Outreach Content
│     │     ├── LinkedIn Automation
│     │     ├── Response Management
│     │     └── Performance Reporting
│     └── Sally - Scout ............... General prospecting sub-team (6 agents · ERROR)
│           ├── Discovery
│           ├── Research
│           ├── Qualifier
│           ├── Brief Writer
│           ├── Outreach Writer
│           └── Pipeline Manager
│
└── Synczilla ......................... Sync utility (PAUSED — manual)
```

---

## 3. The departments — what each does

| Dept (head) | Mission | Sub-agents |
|---|---|---|
| **Sales** (Sally Sales Manager) | Drives pepelwerk's sales pipelines. Owns three sub-teams: Carrie (CTE/education market), MIT Coordinator (Military in Transition — the flagship pipeline), and Scout (general prospecting). | 20 |
| **Operations** (Milton Ops Agent) | Back-office ops: execution, verification, job/document/transaction/suggestion review, wallet & code, daily reporting. | 9 |
| **Profile Optimization** (Lezle) | "AICA" optimization — analyzes and optimizes user/candidate profiles, segments them, routes content across channels, tracks attribution (RGA). | 9 |
| **Customer Success** (Flo) | Intake/triage, customer health, SLA monitoring & escalation, follow-up cadences, human-in-the-loop responses, product signals, accounting triage, CS analytics. | 8 |
| **Agent Optimization** (Otto) | A meta-system that analyzes the *other* agents — efficiency, reliability, quality/compliance, inventory/topology — then synthesizes improvement proposals and QAs them. | 6 |
| **Sync** (Synczilla) | Standalone sync utility. Currently paused manually. | 0 |

### The MIT pipeline (the priority one)
Per the instance's **single active goal**, "MIT Pipeline: Weekly Prospect Throughput" is
the highest-value pipeline. Flow:
**discovery → enrichment → QA → email validation → outreach → response handling.**
Goal targets: non-zero weekly qualified MIT prospects, prospect→outreach under one week,
zero false-positive blockers, positive approvals routed to Raleigh weekly.

---

## 4. Runtime / cost facts

- **Models:** almost the entire fleet runs on `claude-haiku-4-5` (cheap, fast). Exceptions:
  - **Sally Sales Manager** → `opencode/gpt-5.4-mini`
  - **Carrie's CTE sub-agents** → `opencode/big-pickle`
- **Spend this month:** **$57.87 total**, and **97% of it ($56.48) is Sally Sales Manager** —
  she's effectively the only agent doing paid work. Money Penny $1.26, Synczilla $0.13,
  everyone else $0.00.
- **Budget caps:** only Milton's sub-team and Scout's sub-team have per-agent monthly caps
  ($10–$25). Most agents have **no cap**.
- **Money Penny** is the only agent with `canCreateAgents` permission (it spawns the recovery
  tickets and, presumably, new agents).

---

## 5. Current state & open items (as of snapshot)

### 🔴 Agents in error (4) — need attention
- **Otto** (last heartbeat 2026-06-15) — inbox shows its last run failed: `invalid x-api-key`.
- **Milton Ops Agent** (hb 2026-06-08)
- **Sally - MIT Coordinator** (hb 2026-06-12) — this is the head of the *priority* MIT pipeline.
- **Sally - Scout** (hb 2026-06-08)

> Note: errors at these *manager* nodes effectively stall their whole sub-trees, even though
> the sub-agents themselves show `idle`.

### ⏸ Paused (1)
- **Synczilla** — `pauseReason: manual` (someone paused it on purpose).

### ⏳ Pending approval (1)
- **Approve P7 Outreach Deployment** — "Deploy P7-010 to P7-022 to Expandi," requested by
  Sally Sales Manager on 2026-06-08, no risks listed, recommended action: Approve.
  *(Sitting in the human approval queue for a week.)*

### 🔁 Recovery-loop churn (the bulk of the queue)
Most in-progress issues are **auto-generated by Money Penny** on the `cheap` model:
`Recover missing next step PEP-xxx` / `Recover stalled issue PEP-xxx`. Root trigger is
`successful_run_missing_state` — an agent's run *succeeds* but never records a valid
disposition (`done` / `blocked` / next step). These have started spawning secondary
**"Review productivity for…"** tickets (trigger: `long_active_duration`).
This is the self-healing system reacting to agents that finish work without closing the loop —
worth fixing at the source rather than letting recovery tickets pile up.

---

## 6. How to access / continue this work

- **API (works now):** company key is already configured in Claude Desktop
  (`PAPERCLIP_API_URL` = `…/api`, `PAPERCLIP_API_KEY` = `pcp_3ce9…4e12`, `PAPERCLIP_COMPANY_ID`).
  Good for: projects, issues, agents, goals, approvals, comments, documents.
- **Agent-scoped endpoints** (`/agents/me`, inbox-lite "Mine") return **401** — those need an
  **agent API key**, not the company key. The Otto `invalid x-api-key` failure is the same
  class of problem. Generate an agent key in the Paperclip UI if those endpoints are needed.
- **Web UI:** `https://paperclip.codegrind.pro/PEP/inbox/mine` (browser session is logged in).

---

## 7. Suggested next actions for whoever picks this up

1. **Clear the P7 Outreach approval** — it's blocking Sally's deployment and is a week old.
2. **Recover the 4 errored managers**, starting with **Sally - MIT Coordinator** (priority
   pipeline) and **Otto** (fix its API key — it's the one that's supposed to keep the fleet healthy).
3. **Fix the `successful_run_missing_state` root cause** so agents record dispositions and the
   recovery/productivity tickets stop multiplying.
4. **Define more goals** — 62 agents share a single goal, so most activity isn't measured.
5. **Watch Sally's spend** — she's 97% of cost with no budget cap.
