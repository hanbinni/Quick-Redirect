# Quick Redirect

Quick Redirect is a Chrome Extension MVP that lets a user type a natural-language request and redirects them to the most relevant page inside the current website.

The extension does not send full site content to AI. It collects local candidate URLs, keeps the top 10, and asks the Lambda backend to select one candidate.

## Folder Structure

```text
quick-redirect/
  extension/
    manifest.json
    config.js
    content.js
    background.js
    styles.css
  lambda/
    package.json
    index.js
    openaiClient.js
  test-pages/
    sample.html
  README.md
```

## Extension

1. Deploy or run the Lambda backend.
2. Set the endpoint in `extension/config.js`.
3. Open Chrome and go to `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked and select the `extension/` folder.

The UI appears as a floating button in the bottom-right corner on `http` and `https` pages.

## Lambda Setup

### Mock mode (no AI key or npm install required)

```powershell
cd C:\project\quick-redirect\lambda
npm run start:mock
```

In another PowerShell window:

```powershell
cd C:\project\quick-redirect
python -m http.server 8080
```

Open `http://127.0.0.1:8080/test-pages/sample.html`. This preview loads the same
extension UI code directly, so Chrome extension installation is not required.

Mock behavior:

- A normal matching query returns `confidence: 0.72` and shows candidate buttons.
- A matching query containing `바로`, `즉시`, `열어`, or `이동` returns `confidence: 0.95` and redirects.
- An unrelated query returns low confidence and shows the failure message.

### OpenAI mode

```bash
cd lambda
npm install
OPENAI_API_KEY=your_api_key OPENAI_MODEL=gpt-5.4-mini QR_LOCAL_SERVER=true npm start
```

For PowerShell:

```powershell
cd lambda
npm install
$env:OPENAI_API_KEY="your_api_key"
$env:OPENAI_MODEL="gpt-5.4-mini"
$env:QR_LOCAL_SERVER="true"
npm start
```

The local server listens on `http://localhost:3000/select`, which matches the default `extension/config.js`.

For AWS Lambda, deploy `lambda/index.js` as the handler module and set:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` optional, defaults to `gpt-5.4-mini`

Use API Gateway HTTP API or Lambda Function URL and route `POST /select` to the handler.

## API

Request:

```json
{
  "userQuery": "공지사항 어디 있어?",
  "currentPage": "https://abc.com",
  "candidates": [
    {
      "title": "공지사항",
      "url": "https://abc.com/notice",
      "source": "nav",
      "score": 42
    }
  ]
}
```

Response:

```json
{
  "selectedUrl": "https://abc.com/notice",
  "confidence": 0.95,
  "reason": "matched notice intent"
}
```

## Redirect Policy

- `confidence >= 0.85`: redirect immediately.
- `0.6 <= confidence < 0.85`: show candidate buttons.
- `< 0.6` or `selectedUrl === null`: show a failure message.

## UI State Flow

The chat UI uses one shared status value so the header, floating button, input, and loading bubble stay consistent:

| Status | When it appears | User-facing copy |
| --- | --- | --- |
| `idle` | Panel is ready | `바로 찾을 준비가 됐어요` |
| `analyzing` | Local DOM and root page candidates are being collected | `페이지를 분석하고 있어요` |
| `thinking` | Candidate list has been sent to the API | `AI가 후보를 고르고 있어요` |
| `found` | A valid candidate was selected | `이동할 페이지를 찾았어요` |
| `redirecting` | The user is about to be redirected | `페이지로 이동 중이에요` |
| `done` | Medium-confidence results are waiting for user choice | `선택을 기다리고 있어요` |
| `error` | The request failed or no useful candidate exists | `다시 시도할 수 있어요` |

During busy states, the input placeholder changes to `...`, `분석 중...`, or `이동 중...`, the launcher shows a subtle pulse, and the loading bubble shows a small status icon. Users with reduced motion enabled receive the same state copy without animation.

## Error And Usage Cases

| Case | Behavior |
| --- | --- |
| No candidates found | Shows `현재 페이지에서 이동할 만한 링크를 찾지 못했어요. 다른 표현으로 다시 시도해주세요.` |
| API endpoint is missing | Shows a friendly `extension/config.js` setup message. |
| Timeout, network, or CORS issue | Shows `응답 시간이 초과됐어요. 잠시 후 다시 시도해주세요.` |
| Lambda/model error | Shows a general retry message and logs the original error to the browser console. |
| High confidence | Shows found and redirecting states, then calls `window.location.assign(...)`. |
| Medium confidence | Shows up to 3 candidate buttons; clicking one switches to redirecting state. |
| Low confidence or invalid model URL | Shows the failure message and returns to an editable input. |
| Duplicate submit while busy | Ignored so only one request is in flight. |

## Candidate Collection

The content script collects:

- `a` tags: `innerText`, `title`, `aria-label`, `href`
- weighted links inside `nav`, `header`, and `footer`
- `button`, `[role="button"]`, `[role="link"]`
- `onclick`, `data-url`, `data-href`
- page metadata for local scoring context: `document.title`, meta description, `h1`, `h2`
- the site root once, with no recursive crawling

It excludes `javascript:`, `mailto:`, `tel:`, external origins, empty URLs, and duplicate URLs.

## Testing

Static checks:

```bash
cd lambda
npm run check
```

Manual extension test:

1. Run the Lambda local server.
2. Load the extension in Chrome.
3. Open `test-pages/sample.html` through a local static server.
4. Try:
   - `공지사항 어디 있어?`
   - `채용 페이지 찾아줘`
   - `다운로드 페이지 열어줘`
   - `고객센터 이동`
   - `회원가입 하려면 어디로 가야 해?`

UI state test:

1. Open `http://127.0.0.1:8080/test-pages/sample.html?ui=15`.
2. Check the default floating button and panel open/close animation.
3. Type a query and confirm the send button changes from disabled to active.
4. Submit a query and confirm the header status, input placeholder, floating button pulse, and loading bubble move through analyzing/thinking states.
5. In mock mode, submit a normal matching query and confirm candidate buttons appear.
6. Submit a query containing `바로`, `즉시`, `열어`, or `이동` and confirm the redirecting state appears before navigation.
7. Submit an unrelated query and confirm the failure copy appears.
8. Stop the API server or point `QR_API_ENDPOINT` to an invalid URL and confirm the timeout/network error.
9. Resize to a mobile-width viewport and confirm the panel, input, and candidate buttons do not overlap.
10. Enable reduced motion in the browser or OS and confirm animations are removed while state copy remains visible.

Lambda API test:

```bash
curl -X POST http://localhost:3000/select \
  -H "content-type: application/json" \
  -d '{"userQuery":"공지사항 어디 있어?","currentPage":"https://abc.com","candidates":[{"title":"공지사항","url":"https://abc.com/notice","source":"nav","score":42}]}'
```

## Future Extensions

- Add a small options page for configuring the API endpoint.
- Cache root-page candidates per origin for a short TTL.
- Add localized synonym packs for more languages.
- Add telemetry-free debug mode that logs candidate scores locally.
- Add an allowlist for enterprise deployments that should restrict API endpoints.
