const { app } = require('@azure/functions');

const MAX_HOSTNAMES = 20;
const FIXED_TIME_ZONE = 'India Standard Time';
const HOSTNAME_PATTERN = /^[A-Za-z0-9._-]{1,253}$/;

function jsonResponse(status, body) {
  return { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, jsonBody: body };
}

function normalizeHostnames(values) {
  return [...new Set(values.filter(v => typeof v === 'string').map(v => v.trim().toUpperCase()).filter(Boolean))];
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'Request body must be JSON.';
  for (const f of ['requesterName','requesterEmail','startDateTime','endDateTime','changeNumber','reason']) {
    if (typeof body[f] !== 'string' || !body[f].trim()) return `${f} is required.`;
  }
  if (!Array.isArray(body.hostnames)) return 'hostnames must be an array.';
  const names = normalizeHostnames(body.hostnames);
  if (names.length < 1 || names.length > MAX_HOSTNAMES) return `Provide 1 to ${MAX_HOSTNAMES} unique hostnames.`;
  const invalid = names.find(h => !HOSTNAME_PATTERN.test(h));
  if (invalid) return `Invalid hostname: ${invalid}.`;
  if (body.requesterName.length > 100 || body.requesterEmail.length > 150 || body.changeNumber.length > 80 || body.reason.length > 500) return 'One or more fields exceed the maximum length.';
  return '';
}

app.http('submitSuppression', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'submitSuppression',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); }
    catch { return jsonResponse(400, { success:false, status:'InvalidJson', message:'The request body is not valid JSON.' }); }

    const validationError = validate(body);
    if (validationError) return jsonResponse(400, { success:false, status:'InvalidRequest', message:validationError });

    const callbackUrl = process.env.LOGIC_APP_CALLBACK_URL;
    if (!callbackUrl) return jsonResponse(500, { success:false, status:'ConfigurationError', message:'LOGIC_APP_CALLBACK_URL is not configured.' });

    const requesterEmail = body.requesterEmail.trim();
    const logicAppPayload = {
      hostnames: normalizeHostnames(body.hostnames),
      startDateTime: body.startDateTime.trim(),
      endDateTime: body.endDateTime.trim(),
      timeZone: FIXED_TIME_ZONE,
      changeNumber: body.changeNumber.trim(),
      reason: body.reason.trim(),
      environment: typeof body.environment === 'string' ? body.environment.trim() : '',
      requesterName: body.requesterName.trim(),
      requesterUserName: requesterEmail,
      requesterUserId: `manual-email:${requesterEmail.toLowerCase()}`
    };

    let response;
    try {
      response = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(logicAppPayload),
        signal: AbortSignal.timeout(230000)
      });
    } catch (error) {
      context.error('Logic App request failed', error);
      return jsonResponse(502, { success:false, status:'LogicAppUnavailable', message:'The Logic App could not be reached.', details:error.message });
    }

    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : {}; }
    catch { result = { success:false, status:'InvalidLogicAppResponse', message:text || 'The Logic App returned no response body.' }; }
    return jsonResponse(response.status, result);
  }
});
