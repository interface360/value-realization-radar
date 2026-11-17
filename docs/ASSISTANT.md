---
title: AI assistant
section: Administration
order: 23
summary: Set up the VRR Assistant, switch between Gemini and OpenAI, or bring your own OpenAI-compatible LLM. Tools, grounding and safety.
---

# AI assistant

The **VRR Assistant** answers questions about:
1. **This documentation:** how features work, how metrics are calculated, how to map a CRM.
2. **The live portfolio** of the active workspace: accounts, risk, blockers, interventions and sync health.

It runs **on the sync server**, so LLM tokens never reach the browser. It **reads data but never changes it**.

## Quick setup

1. Put a token in `.env.local` in the project root. This file is git-ignored and is never committed.
   ```bash
   VRR_GEMINI_TOKEN=…        # Gemini via the MuleSoft proxy
   VRR_OPENAI_TOKEN=…        # Azure OpenAI via the MuleSoft proxy
   ```
2. Restart the server with `npm run server`. The startup banner lists which providers are ready.
3. In the dashboard, click **Assistant** in the header.

The assistant works in both **Local demo** and **tenant workspaces**. In local demo mode the browser
sends a snapshot of the demo portfolio with each question. It still needs the sync server to reach the LLM.

## Providers

Providers are defined in `config/llm.config.json`. That file holds **no secrets**: each provider names
the environment variable that holds its token.

| id | type | Endpoint | Token env | Default model |
|---|---|---|---|---|
| `gemini` | `gemini` | `https://gemini-proxy.demos.mulesoft.com/v1beta` | `VRR_GEMINI_TOKEN` | `gemini-2.5-flash` |
| `openai` | `openai` | `https://azure-openai-proxy.demos.mulesoft.com/v1` | `VRR_OPENAI_TOKEN` | `gpt-4o-mini` |
| `custom` | `openai` | `http://localhost:11434/v1` (e.g. Ollama) | `VRR_CUSTOM_LLM_TOKEN` | `llama3.1` |

**Choosing a provider:**
- The server uses `defaultProvider` first, then each entry in `fallbackProviders` in order, skipping any without a token.
- Users can pick a provider and model per conversation from the Assistant's menu. Disable that with the
  `allowProviderSwitch` module option.

### Provider fields

| Field | Required | Meaning |
|---|---|---|
| `type` | ✓ | `gemini` (Google Gemini API) or `openai` (any OpenAI-compatible Chat Completions API) |
| `baseUrl` | ✓ | API root. For Gemini this ends in `/v1beta`; for OpenAI-compatible APIs, usually `/v1` |
| `tokenEnv` | ✓ | Name of the env var that holds the token |
| `auth` | | `bearer` (default), `x-goog-api-key` (Gemini), `api-key` (raw Azure OpenAI), or `none` |
| `model` | ✓ | Default model |
| `models` | | Models offered in the UI menu |
| `label` | | Display name |
| `temperature`, `maxOutputTokens` | | Generation settings (defaults 0.2 and 2048) |
| `thinkingBudget` | | Gemini 2.5 only. `0` turns off "thinking" for faster, cheaper answers |

### Bring your own LLM

Any OpenAI-compatible endpoint works: Ollama, vLLM, LM Studio, OpenRouter, Together, Groq, raw Azure
OpenAI, or a corporate gateway. Add a provider to `config/llm.config.local.json`:

```json
{
  "defaultProvider": "my-gateway",
  "providers": {
    "my-gateway": {
      "type": "openai",
      "label": "Corp AI gateway",
      "baseUrl": "https://ai-gateway.example.com/v1",
      "tokenEnv": "MY_GATEWAY_TOKEN",
      "model": "gpt-4.1",
      "models": ["gpt-4.1", "gpt-4.1-mini"]
    }
  }
}
```

Then set `MY_GATEWAY_TOKEN=…` in `.env.local` and restart. To use a local Ollama with no token, set
`"auth": "none"`.

For **raw Azure OpenAI** (not through a proxy), point `baseUrl` at your deployment's OpenAI-compatible endpoint
(`https://<resource>.openai.azure.com/openai/v1`) and set `"auth": "api-key"`.

### Quick switches without editing files

```bash
VRR_LLM_PROVIDER=openai npm run server
VRR_GEMINI_MODEL=gemini-2.5-pro npm run server
```

## How it answers

The assistant is a small **tool-using agent**. For each question:

1. It reads a system prompt that describes VRR, the metric definitions, and the rules (cite sources, don't make up numbers).
2. It **retrieves** the most relevant documentation sections, using keyword search across every page in `docs/`.
3. It calls **tools** as needed, up to 6 rounds:

| Tool | Returns |
|---|---|
| `search_docs(query)` | Matching documentation sections with the page and heading |
| `get_portfolio_summary()` | KPIs: total ARR, ARR at risk, realization, danger count, active interventions |
| `list_accounts(filters)` | Accounts filtered by status, danger zone, renewal window, realization, intervention; sorted and limited |
| `get_account(name_or_id)` | One account in full: projects, blockers, interventions, usage trend |
| `blocker_breakdown()` | ARR and account count per blocker type |
| `list_connections()` | Data-source connections and sync health (tenant workspaces only) |

4. It answers in Markdown, citing doc pages as `[Page](doc:page)` links and accounts as `[Account](account:id)`
   links. In the UI these open the doc page or the Intervention Drawer.

Answers stream into the panel as they are written. The panel also shows which tools were used.

## Safety and data handling

- **Tokens:** they come only from server environment variables. They are never sent to the browser, logged, or saved in config files.
- **Read-only:** the tools only read. Actions such as Deploy FDE stay as buttons you click yourself.
- **Tenant scope:** in a tenant workspace, tools read only that tenant's data, resolved from the API key.
- **What is sent to the LLM:** your question, the retrieved doc sections, and the tool results, which are portfolio
  rows for *this* tenant. Sponsor names and ARR are included when relevant. If that isn't acceptable for a
  workspace, disable the `useDataTools` option; the assistant then answers from the docs only. You can also
  disable the module entirely.
- **Grounding:** the system prompt tells the model to use tool results for any number, and to say when data is missing.

## API

`POST /api/assistant/chat` streams Server-Sent Events. `GET /api/assistant/providers` lists configured providers.
See [API reference](api.md#assistant).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "No LLM provider is configured" | Set a token env var named in `config/llm.config.json` and restart the server |
| `401 Authentication Attempt Failed` | Token is wrong or expired. Get a new one. |
| A provider shows *not configured* in the menu | Its `tokenEnv` variable isn't set in the server's environment |
| Slow answers | Use a faster model (`gemini-2.5-flash`, `gpt-4o-mini`) and keep `thinkingBudget: 0` |
| Assistant says it can't see data | In local demo mode, make sure the dashboard is open, because the browser sends the snapshot. In a tenant, run a pull first. |
