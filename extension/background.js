importScripts("config.js");

const QR_REQUEST_TIMEOUT_MS = 2500;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "QR_SELECT_URL") {
    return false;
  }

  selectUrl(message.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    });

  return true;
});

async function selectUrl(payload) {
  const endpoint = self.QR_API_ENDPOINT;
  if (!endpoint || endpoint.includes("YOUR_")) {
    throw new Error("Quick Redirect API endpoint is not configured.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QR_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`API request failed with ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
