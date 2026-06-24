const DEFAULT_MODEL = "gpt-5.4-mini";

let client;

async function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set.");
    }
    const { default: OpenAI } = await import("openai");
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function chooseUrl({ userQuery, currentPage, candidates }) {
  const openai = await getClient();
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    reasoning: { effort: "low" },
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "quick_redirect_selection",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            selectedUrl: {
              anyOf: [{ type: "string" }, { type: "null" }]
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1
            },
            reason: {
              type: "string"
            }
          },
          required: ["selectedUrl", "confidence", "reason"]
        }
      }
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You select the single best URL from provided candidates for the user's navigation intent. " +
              "Return JSON only. Select only one candidate URL. If no candidate is appropriate, return selectedUrl null. " +
              "Do not invent URLs."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              userQuery,
              currentPage,
              candidates: candidates.map(({ title, url }) => ({ title, url }))
            })
          }
        ]
      }
    ]
  });

  return parseResponse(response);
}

function parseResponse(response) {
  const text = response.output_text;
  if (!text) {
    return { selectedUrl: null, confidence: 0, reason: "empty model response" };
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { selectedUrl: null, confidence: 0, reason: "invalid model JSON" };
  }
}
