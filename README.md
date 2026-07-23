# AutoAiPlanner

English | [한국어](README.ko.md)

AutoAiPlanner is a browser-based personal planning app that combines direct editing with natural-language AI assistance. It keeps schedules, todos, projects, and milestones together, with app data stored in the current browser by default.

## Overview

AutoAiPlanner is a zero-dependency static single-page application for organizing personal work without a required account or backend. You can enter items directly, ask a configured AI provider to create or update them, and review generated content before saving it.

The app manages:

- Schedules with optional start and end times
- Todos with optional due dates and times
- Projects with date ranges and linked work
- Milestones inside project periods

App data is stored locally in the browser. This makes the app easy to run, but it does not provide account-based cloud backup or synchronization.

## Live Demo

Not deployed yet. Follow [Getting Started](#getting-started) to run it locally.

## Features

- Dashboard summaries, quick todo entry, and editable welcome copy
- Direct schedule creation and editing, including all-day or optional start/end times
- Todo quick add, completion, editing, deletion, and conversion into a schedule
- Projects with date ranges, milestones, linked schedules, and linked todos
- Single-month and continuously scrollable multi-month calendar views
- Separate calendar representations for schedules, todos, projects, and milestones
- User-selected colors for schedule markers and project lines
- AI-assisted creation, project detailing, and natural-language updates with a review step
- Provider configuration with editable endpoints and model IDs, connection testing, and API help
- Light, dark, and system themes, responsive mobile layout, accessible labels and focus handling, and reduced-motion support
- Local persistence, JSON backup/import, v1/v2 migration, and synchronization between open tabs
- Configurable deletion confirmation and resettable example data

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Web Storage APIs: `localStorage`, `sessionStorage`
- Fetch API
- JSON Schema-based AI response validation

The app has no package installation, build step, framework, TypeScript runtime, server database, or external UI dependency. A local static server is only a convenient way to serve the files.

## Getting Started

No dependencies need to be installed and no build is required.

1. Download or copy the project.
2. Open a terminal in the project directory.
3. Move into the app folder and start a static HTTP server:

```bash
cd auto-ai-planner
python -m http.server 8000
```

4. Open `http://localhost:8000` in a browser.

If Python is unavailable, use another static file server. Opening `index.html` directly may work for local-only features, but an HTTP server is recommended because external AI providers can enforce browser and CORS policies.

## AI Provider Setup

AutoAiPlanner supports these provider modes:

- **Experience mode:** Local mock flow with no API key or external AI request
- **Google Gemini:** Gemini Interactions API adapter
- **GroqCloud:** OpenAI-compatible Chat Completions adapter
- **OpenRouter:** Free-model list, automatic free-model selection, and direct model ID input
- **Custom OpenAI-compatible API:** User-provided Chat Completions endpoint and model ID

To configure a provider:

1. Open **Settings**.
2. Choose an AI service.
3. Confirm or edit the endpoint and model.
4. Enter the API key when required.
5. Choose whether to keep the key for the current session only or save it on the device.
6. Run the connection test.
7. Save the configuration.

Provider endpoints and model IDs can change. Use values supplied by a provider you trust. For non-experience modes, the browser sends the API key and relevant request content directly to the selected provider; AutoAiPlanner does not proxy requests through its own backend.

## Data Storage

- Main app data uses the `localStorage` key `autoAiPlanner.appData.v3`.
- Data stored under the v1 or v2 keys is normalized and migrated automatically to v3.
- Schedules, todos, projects, milestones, profile details, preferences, recent prompts, and API profiles are stored in the current browser.
- A session-only API key uses `sessionStorage` and is limited to the current tab or browser session.
- A device-saved API key uses `localStorage` and can remain after the browser is closed.
- JSON export and import cover app data and configuration, but exported backups do not contain API keys.
- Changes to the v3 app data are synchronized between open tabs through the browser `storage` event.
- Clearing browser site data can permanently remove local data unless a separate backup exists.
- There is no automatic synchronization between devices.

## Technical Decisions

- **Zero-dependency static architecture:** Three runtime files make the app portable and easy to inspect, at the cost of maintaining UI and state behavior without a framework.
- **Central in-memory state with render functions:** A single state object keeps screen behavior consistent, while larger render functions require careful organization.
- **Event delegation through `data-action`:** Dynamically rendered controls share document-level handlers, reducing repeated listeners but making action naming part of the internal contract.
- **Normalization before accepting data:** Stored, imported, and AI-generated values pass through normalization so invalid fields do not enter state unchecked; malformed values can be replaced with safe defaults.
- **Backward-compatible migration:** v1 and v2 data is upgraded to v3, including conversion of legacy multi-day schedules into projects, which preserves older data while adding migration complexity.
- **Provider adapters with shared response envelopes:** Gemini and OpenAI-compatible services use provider-specific requests but return a common entity envelope for the rest of the app.
- **JSON Schema-guided structured output:** Supported models receive task-specific schemas; other models use JSON mode, followed by the same application-side parsing and validation.
- **Browser-only persistence:** No backend is required, but users are responsible for browser storage, backups, and API-key exposure in the frontend.
- **Context-specific rendering with shared entities:** Schedule, todo, and project renderers are reused across dashboards, detail pages, calendar panels, and modals while adapting controls to each context.

## Security

- API keys are not included in exported backup files.
- Session-only keys are stored in `sessionStorage` for the current tab or browser session.
- Device-saved keys can remain unencrypted in `localStorage`. Do not enable device storage on a public or shared computer.
- This is a static frontend. API keys are used in the browser and are not protected by a backend secret store.
- User-provided text is escaped with `escapeHTML()` before being inserted into generated HTML.
- Stored, imported, and AI-generated data is normalized and validated before use.
- Custom provider endpoints and model IDs should be entered only when their destination is trusted.
- Never commit API keys, `.env` files, or personal `AutoAiPlanner-backup-*.json` files to Git.

Browser storage is not encrypted secure storage. Review the selected provider's data handling before sending sensitive schedule or project content.

## Project Structure

```text
auto-ai-planner/
├─ app.js
├─ index.html
├─ styles.css
├─ .gitignore
├─ README.md
└─ README.ko.md
```

- `index.html`: Semantic shell, navigation, dynamic content root, and status regions
- `styles.css`: Themes, responsive layout, components, modals, and calendar styling
- `app.js`: State, persistence, rendering, calendar logic, AI adapters, and interactions
- `.gitignore`: Local, generated, backup, and sensitive files excluded from Git
- `README.md`: Primary English documentation
- `README.ko.md`: Korean documentation

## Limitations

- Data is browser-local; there is no account or cloud synchronization.
- Multi-user collaboration is not supported.
- Provider availability, browser CORS rules, quotas, pricing, and model behavior are outside the app's control.
- API keys are used directly in the browser.
- AI output still requires user review despite schema guidance and application-side validation.
- Browser storage capacity and user-initiated site-data clearing can cause data loss.
- Cross-tab updates work only for the same browser storage area, not across devices.
- There is no automated test suite or CI pipeline.
- There is no verified hosted Live Demo.

## Future Improvements

The following items are possible future work and are not currently implemented:

- Automated unit and interaction tests
- Optional encrypted backend or cloud synchronization
- PWA and offline installation
- Calendar import/export using standards such as ICS
- A formal accessibility audit and expanded keyboard navigation
- Internationalization beyond the current Korean interface
- CI validation and an official deployment
