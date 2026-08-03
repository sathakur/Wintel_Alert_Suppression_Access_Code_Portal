const { app } = require("@azure/functions");

const MAX_HOSTNAMES = 20;
const FIXED_TIME_ZONE = "India Standard Time";
const ALLOWED_HOSTNAME = /^[A-Za-z0-9._-]{1,253}$/;

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    jsonBody: body
  };
}

function normalizeHostnames(values) {
  return [...new Set(
    values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  )];
}

function validatePayload(body) {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }

  for (const field of [
    "requesterName",
    "requesterEmail",
    "startDateTime",
    "endDateTime",
    "changeNumber",
    "reason"
  ]) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      return `${field} is required.`;
    }
  }

  if (!Array.isArray(body.hostnames)) {
    return "hostnames must be an array.";
  }

  const hostnames = normalizeHostnames(body.hostnames);

  if (hostnames.length < 1 || hostnames.length > MAX_HOSTNAMES) {
    return `Provide between 1 and ${MAX_HOSTNAMES} unique hostnames.`;
  }

  const invalidHostname = hostnames.find(
    (hostname) => !ALLOWED_HOSTNAME.test(hostname)
  );

  if (invalidHostname) {
    return `Invalid hostname: ${invalidHostname}.`;
  }

  if (body.timeZone !== FIXED_TIME_ZONE) {
    return "Only India Standard Time is allowed.";
  }

  return "";
}

app.http("submitSuppression", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "submitSuppression",
  handler: async (request, context) => {
    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, {
        success: false,
        status: "InvalidJson",
        message: "The request body is not valid JSON."
      });
    }

    const validationError = validatePayload(body);
    if (validationError) {
      return jsonResponse(400, {
        success: false,
        status: "InvalidRequest",
        message: validationError
      });
    }

    const callbackUrl = process.env.LOGIC_APP_CALLBACK_URL;
    if (!callbackUrl) {
      context.error("LOGIC_APP_CALLBACK_URL is not configured.");

      return jsonResponse(500, {
        success: false,
        status: "ConfigurationError",
        message: "The portal API is not connected to the Logic App."
      });
    }

    const requesterEmail = body.requesterEmail.trim();

    const logicAppPayload = {
      hostnames: normalizeHostnames(body.hostnames),
      startDateTime: body.startDateTime.trim(),
      endDateTime: body.endDateTime.trim(),
      timeZone: FIXED_TIME_ZONE,
      changeNumber: body.changeNumber.trim(),
      reason: body.reason.trim(),
      environment:
        typeof body.environment === "string" ? body.environment.trim() : "",
      requesterName: body.requesterName.trim(),
      requesterUserName: requesterEmail,
      requesterUserId: `manual-email:${requesterEmail.toLowerCase()}`
    };

    let logicAppResponse;

    try {
      logicAppResponse = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(logicAppPayload),
        signal: AbortSignal.timeout(230000)
      });
    } catch (error) {
      context.error("Logic App request failed.", error);

      return jsonResponse(502, {
        success: false,
        status: "LogicAppUnavailable",
        message: "The Logic App could not be reached.",
        details: error.message
      });
    }

    const responseText = await logicAppResponse.text();
    let responseBody;

    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseBody = {
        success: false,
        status: "InvalidLogicAppResponse",
        message: responseText || "The Logic App returned no response body."
      };
    }

    return jsonResponse(logicAppResponse.status, responseBody);
  }
});
