# Build Specification: Value Realization Radar

## 1. Project Overview & Objective
**App Name:** Value Realization Radar
**Core Philosophy:** Treat adoption as an early indicator of renewal risk.
**UI/UX Goal:** Build a dynamic, data-driven "Dark Command Center." The UI must translate complex customer success metrics into an immediate, pre-attentive visual radar. 
**Strict Constraint:** **NO TRADITIONAL DATA TABLES** for the main overview. Account health, usage, and risk must be instantly recognizable through position (x/y axes), scale (size of elements), and color (health status).

## 2. Tech Stack & Persistence
*   **Frontend Framework:** React (Next.js or Vite) with Tailwind CSS.
*   **Data Visualization:** D3.js, Recharts, or Visx (must support highly custom, interactive scatter/bubble plots).
*   **Icons:** Lucide React.
*   **Persistence Layer:** Local embedded database for rapid prototyping (e.g., SQLite via WASM, PouchDB, or a robust IndexedDB wrapper like Dexie.js). 

## 3. Design System: "Dark Command Center"
*   **Backgrounds:** Deep slate/blacks (e.g., `bg-slate-950`, `bg-gray-900`) to make data points pop.
*   **Pre-Attentive Colors:** 
    *   *Healthy/On-Track:* Neon Emerald/Cyan (glow effects).
    *   *Warning/Stalled:* High-visibility Amber/Yellow.
    *   *Critical/Risk:* Neon Rose/Crimson.
*   **Typography:** Monospaced fonts for numbers and metrics (e.g., JetBrains Mono, Fira Code) to evoke a technical, command-center feel. Clean sans-serif (Inter, Roboto) for standard text.
*   **Visual Hierarchy:** Rely on *glow*, *opacity*, and *size* rather than borders and explicit text labels.

## 4. Database Schema (Embedded DB)
Initialize the local database with the following core entities:
*   **Accounts:** `id`, `name`, `arr_value`, `renewal_date`, `sponsor_name`.
*   **Telemetry:** `account_id`, `purchased_capacity`, `consumed_capacity`, `last_active_date`.
*   **Projects:** `id`, `account_id`, `status` (On Track, Stalled, Delayed), `blocker_type` (None, API, Template, Missing Feature).
*   **Interventions:** `id`, `account_id`, `type` (FDE Deploy, Recovery Plan, Packaging), `status`.

## 5. Step-by-Step Build Instructions

### Step 1: The Radar Core (Main Dashboard)
**Component:** `ValueRealizationRadar.jsx`
*   **Concept:** A massive, interactive Bubble/Scatter Plot occupying the center of the screen.
*   **X-Axis:** "Time to Renewal" (Left = Far away, Right = Imminent).
*   **Y-Axis:** "Value Realization %" (Consumed Capacity / Purchased Capacity).
*   **Bubble Size:** Represents the account's ARR (Larger bubble = Higher financial risk/reward).
*   **Bubble Color:** Represents Project Status (Green = Moving, Amber = Delayed, Red = Stalled).
*   **Interaction:** Hovering over a bubble triggers a tooltip with precise metrics. Clicking a bubble opens a slide-out panel (The Intervention Drawer).

### Step 2: Tab 1 - Account Momentum Hub
**Component:** `AccountMomentumHub.jsx`
*   **Concept:** The intervention engine for CS and Account Teams.
*   **Layout:** A Kanban-style board or priority matrix (Urgent vs. Impact).
*   **Features:**
    *   Automatically pulls in "Red" and "Amber" accounts from the Radar.
    *   **Action Buttons (Primary UI element):** "Deploy FDE/Builder", "Initiate Recovery Plan". 
    *   Clicking these updates the embedded database and shifts the account into an "Intervention Active" visual state (e.g., adding a pulsing ring around the bubble on the main radar).

### Step 3: Tab 2 - Delivery Friction (Product Loop)
**Component:** `DeliveryFriction.jsx`
*   **Concept:** The feedback loop for Product Managers.
*   **Visual:** A Treemap or Heatmap.
*   **Data Mapping:** Group the `blocker_type` from the embedded database. Size of the heatmap blocks should represent the *Total ARR tied to that specific blocker*. 
*   **Goal:** Instantly show Product Managers that "Missing API Documentation" is stalling $2.4M in ARR.

### Step 4: Tab 3 - Commercial Flexibility (The Safety Net)
**Component:** `CommercialFlexibility.jsx`
*   **Concept:** Tooling for Account Executives.
*   **Visual:** A timeline or horizontal bar chart showing runway.
*   **Data Mapping:** Filter for accounts where `renewal_date` is < 90 days AND `Value Realization %` is < 40%.
*   **Action:** Provide interactive sliders to model "Flexible Packaging" (e.g., extending the contract term to allow more time for adoption without forcing churn).

### Step 5: The Intervention Drawer (Action UI)
**Component:** `InterventionDrawer.jsx`
*   **Trigger:** Clicking any data point in the Radar or Hubs.
*   **UI:** A sleek, glassmorphism slide-out from the right side.
*   **Content:**
    *   Top: Account Name, Sponsor, and a mini sparkline of their usage drop-off.
    *   Middle: The diagnosed issue (e.g., "Underused Capacity: $45k | Project: Stalled").
    *   Bottom: "Execute Strategy" buttons (Align CS, Deploy FDE, Log Blocker). Writing to the local DB upon click.

## 6. Prototyping Milestones for AI
1.  **Milestone 1:** Scaffold app, implement dark theme, and initialize the local embedded DB with mock data.
2.  **Milestone 2:** Build the `ValueRealizationRadar` interactive D3/Recharts component (No tables!).
3.  **Milestone 3:** Implement the three sub-tabs (Momentum, Friction, Commercial) using alternative visualizations (Kanban, Treemap).
4.  **Milestone 4:** Connect the `InterventionDrawer` so that clicking a node, logging a blocker, or deploying an FDE dynamically updates the local DB and reflects immediately on the visual radar.