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
