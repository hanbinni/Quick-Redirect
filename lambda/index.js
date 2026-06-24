import http from "node:http";

const MAX_CANDIDATES = 10;
const PORT = Number(process.env.PORT || 3000);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json; charset=utf-8"
};

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const path = event.rawPath || event.path || "/";

  if (method === "OPTIONS") {
    return json(204, {});
  }

  if (method !== "POST" || !path.endsWith("/select")) {
    return json(404, { error: "Not found" });
  }

  try {
    const payload = parseBody(event.body, event.isBase64Encoded);
    const validated = validatePayload(payload);
    const modelResult = await selectUrl(validated);
    return json(200, enforceCandidateSelection(modelResult, validated.candidates));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const statusCode = message.startsWith("Invalid") ? 400 : 500;
    return json(statusCode, {
      selectedUrl: null,
      confidence: 0,
      reason: message
    });
  }
}

async function selectUrl(payload) {
  if (process.env.QR_MOCK_MODE === "true") {
    return chooseMockUrl(payload);
  }

  const { chooseUrl } = await import("./openaiClient.js");
  return chooseUrl(payload);
}

function chooseMockUrl({ userQuery, candidates }) {
  const normalizedQuery = userQuery.toLowerCase();
  const queryTokens = tokenize(normalizedQuery);
  const ranked = candidates
    .map((candidate) => {
      const searchable = `${candidate.title} ${candidate.url}`.toLowerCase();
      const matchScore = queryTokens.reduce(
        (score, token) => score + (searchable.includes(token) ? 25 : 0),
        0
      );
      return {
        candidate,
        matchScore,
        score: Number(candidate.score || 0) + matchScore
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.matchScore === 0) {
    return {
      selectedUrl: null,
      confidence: 0.2,
      reason: "mock mode: no relevant candidate"
    };
  }

  const immediate = /바로|즉시|열어|이동/.test(normalizedQuery);
  return {
    selectedUrl: best.candidate.url,
    confidence: immediate ? 0.95 : 0.72,
    reason: immediate
      ? "mock mode: immediate redirect"
      : "mock mode: showing candidate choices"
  };
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/i)
    .filter((token) => token.length >= 2);
}

function parseBody(body, isBase64Encoded) {
  if (!body) {
    throw new Error("Invalid request body.");
  }

  const text = isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error("Invalid JSON body.");
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload.");
  }

  const userQuery = String(payload.userQuery || "").trim();
  const currentPage = String(payload.currentPage || "").trim();
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];

  if (!userQuery) {
    throw new Error("Invalid userQuery.");
  }
  if (!isHttpUrl(currentPage)) {
    throw new Error("Invalid currentPage.");
  }
  if (!candidates.length) {
    throw new Error("Invalid candidates.");
  }

  const origin = new URL(currentPage).origin;
  const sanitizedCandidates = candidates
    .slice(0, MAX_CANDIDATES)
    .map((candidate) => sanitizeCandidate(candidate, origin))
    .filter(Boolean);

  if (!sanitizedCandidates.length) {
    throw new Error("Invalid candidates.");
  }

  return {
    userQuery,
    currentPage,
    candidates: sanitizedCandidates
  };
}

function sanitizeCandidate(candidate, origin) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const title = String(candidate.title || "").trim().slice(0, 160);
  const url = String(candidate.url || "").trim();
  const source = String(candidate.source || "").trim().slice(0, 80);
  const score = Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : 0;

  if (!isHttpUrl(url)) {
    return null;
  }

  const parsed = new URL(url);
  if (parsed.origin !== origin) {
    return null;
  }

  parsed.hash = "";
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return {
    title: title || parsed.pathname || parsed.hostname,
    url: parsed.href,
    source,
    score
  };
}

function enforceCandidateSelection(modelResult, candidates) {
  const selectedUrl = normalizeUrl(modelResult?.selectedUrl);
  const candidateUrls = new Set(candidates.map((candidate) => candidate.url));
  const confidence = clampConfidence(modelResult?.confidence);
  const reason = String(modelResult?.reason || "").slice(0, 240);

  if (!selectedUrl || !candidateUrls.has(selectedUrl)) {
    return {
      selectedUrl: null,
      confidence: 0,
      reason: reason || "model did not select a valid candidate"
    };
  }

  return {
    selectedUrl,
    confidence,
    reason
  };
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || !isHttpUrl(rawUrl)) {
    return null;
  }

  const url = new URL(rawUrl);
  url.hash = "";
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.href;
}

function isHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function clampConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return 0;
  }
  return Math.min(1, Math.max(0, confidence));
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}

if (process.env.QR_LOCAL_SERVER === "true") {
  http
    .createServer(async (request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", async () => {
        const result = await handler({
          rawPath: new URL(request.url || "/", "http://localhost").pathname,
          requestContext: { http: { method: request.method } },
          body: Buffer.concat(chunks).toString("utf8")
        });
        response.writeHead(result.statusCode, result.headers);
        response.end(result.body);
      });
    })
    .listen(PORT, () => {
      console.log(`Quick Redirect Lambda local server listening on http://localhost:${PORT}`);
    });
}
