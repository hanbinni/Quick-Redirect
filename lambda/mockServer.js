process.env.QR_MOCK_MODE = "true";
process.env.QR_LOCAL_SERVER = "true";

await import("./index.js");
