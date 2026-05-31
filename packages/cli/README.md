# @agrune/cli

Internal CLI-first prototype for the Playwright daemon path.

```bash
pnpm --filter @agrune/cli run build
pnpm --filter @agrune/cli exec agrune daemon start --headless
pnpm --filter @agrune/cli exec agrune open http://localhost:5173
pnpm --filter @agrune/cli exec agrune tabs new http://localhost:5173/reports
pnpm --filter @agrune/cli exec agrune navigate http://localhost:5173/dashboard
pnpm --filter @agrune/cli exec agrune back
pnpm --filter @agrune/cli exec agrune resize 1280 720
pnpm --filter @agrune/cli exec agrune evaluate "document.title"
pnpm --filter @agrune/cli exec agrune evaluate "el.textContent.trim()" --target nav_board_tab
pnpm --filter @agrune/cli exec agrune evaluate "document.title" --filename .agrune/runs/eval.txt
pnpm --filter @agrune/cli exec agrune run-code-unsafe "async (page) => page.url()"
pnpm --filter @agrune/cli exec agrune run-code-unsafe --file ./snippet.js
pnpm --filter @agrune/cli exec agrune console --level warning
pnpm --filter @agrune/cli exec agrune console --filename .agrune/runs/console.json
pnpm --filter @agrune/cli exec agrune console --all --json
pnpm --filter @agrune/cli exec agrune network --filter /api --json
pnpm --filter @agrune/cli exec agrune network --filename .agrune/runs/network.json
pnpm --filter @agrune/cli exec agrune network request 3 --part response-body --filename .agrune/runs/network-request.json
pnpm --filter @agrune/cli exec agrune dialogs
pnpm --filter @agrune/cli exec agrune handle-dialog --accept --prompt-text "Ada"
pnpm --filter @agrune/cli exec agrune file-choosers
pnpm --filter @agrune/cli exec agrune file-upload ./avatar.png
pnpm --filter @agrune/cli exec agrune file-upload # cancel pending chooser
pnpm --filter @agrune/cli exec agrune tabs focus 1
pnpm --filter @agrune/cli exec agrune tabs select 1
pnpm --filter @agrune/cli exec agrune tabs select --index 0
pnpm --filter @agrune/cli exec agrune close 1
pnpm --filter @agrune/cli exec agrune close --index 0
pnpm --filter @agrune/cli exec agrune targets --full
pnpm --filter @agrune/cli exec agrune targets --mode full --text --filename .agrune/runs/targets.md
pnpm --filter @agrune/cli exec agrune targets --target nav_board_tab --text
pnpm --filter @agrune/cli exec agrune targets --group-ids nav,main --mode full
pnpm --filter @agrune/cli exec agrune snapshot --depth 3
pnpm --filter @agrune/cli exec agrune snapshot --target nav_board_tab
pnpm --filter @agrune/cli exec agrune snapshot --boxes --include-text-content
pnpm --filter @agrune/cli exec agrune snapshot --filename .agrune/runs/snapshot.md
pnpm --filter @agrune/cli exec agrune click nav_board_tab
pnpm --filter @agrune/cli exec agrune click nav_board_tab --button middle --modifiers Alt,Shift
pnpm --filter @agrune/cli exec agrune fill cc_number "4242424242424242" --strategy keystroke
pnpm --filter @agrune/cli exec agrune type search_input "query text" --submit
pnpm --filter @agrune/cli exec agrune fill-form --file ./form-fields.json
pnpm --filter @agrune/cli exec agrune select country_select kr
pnpm --filter @agrune/cli exec agrune upload avatar_input ./avatar.png
pnpm --filter @agrune/cli exec agrune drop drop_zone ./payload.txt --text "plain drop text"
pnpm --filter @agrune/cli exec agrune wait nav_board_tab --state visible
pnpm --filter @agrune/cli exec agrune wait --text "Ready"
pnpm --filter @agrune/cli exec agrune wait --text-gone "Loading"
pnpm --filter @agrune/cli exec agrune wait --time 1
pnpm --filter @agrune/cli exec agrune screenshot --output .agrune/runs/smoke.png
pnpm --filter @agrune/cli exec agrune screenshot --target nav_board_tab --type jpeg --output .agrune/runs/nav.jpg
pnpm --filter @agrune/cli exec agrune events
```

`fill-form` accepts either a JSON array or an object with a `fields` array:

```json
{
  "fields": [
    { "name": "Email", "target": "email_input", "type": "textbox", "value": "ada@example.test" },
    { "name": "Subscribe", "target": "subscribe_checkbox", "type": "checkbox", "value": true },
    { "name": "Country", "target": "country_select", "type": "combobox", "value": "kr" },
    { "name": "Volume", "target": "volume_slider", "type": "slider", "value": 7 }
  ]
}
```

The CLI uses Playwright for standard browser actions. Page runtime code is not
used as the standard action executor.
