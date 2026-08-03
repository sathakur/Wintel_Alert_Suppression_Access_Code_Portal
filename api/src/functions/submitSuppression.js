const { app } = require('@azure/functions');
const crypto = require('crypto');

const MAX_HOSTNAMES = 20;
const HOSTNAME_PATTERN = /^[A-Za-z0-9._-]{1,253}$/;

function jsonResponse(status, body) {
  return { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, jsonBody: body };
}

function normalizeHostnames(values) {
  return [...new Set(values.filter(v => typeof v === 'string').map(v => v.trim().toUpperCase()).filter(Boolean))];
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'Request body must be JSON.';
  for (const f of ['requesterName','requesterEmail','employeeId','portalAccessCode','startDateTime','endDateTime','timeZone','changeNumber','reason']) {
    if (typeof body[f] !== 'string' || !body[f].trim()) return `${f} is required.`;
  }
  if (!Array.isArray(body.hostnames)) return 'hostnames must be an array.';
  const names = normalizeHostnames(body.hostnames);
  if (names.length < 1 || names.length > MAX_HOSTNAMES) return `Provide 1 to ${MAX_HOSTNAMES} unique hostnames.`;
  const invalid = names.find(h => !HOSTNAME_PATTERN.test(h));
  if (invalid) return `Invalid hostname: ${invalid}.`;
  if (body.requesterName.length > 100 || body.requesterEmail.length > 150 || body.employeeId.length > 50 || body.changeNumber.length > 80 || body.reason.length > 500) return 'One or more fields exceed the maximum length.';
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

    const expectedCode = process.env.PORTAL_ACCESS_CODE;
    if (!expectedCode) return jsonResponse(500, { success:false, status:'ConfigurationError', message:'PORTAL_ACCESS_CODE is not configured.' });
    if (!safeEqual(body.portalAccessCode, expectedCode)) return jsonResponse(401, { success:false, status:'Unauthorized', message:'The portal access code is incorrect.' });

    const callbackUrl = process.env.LOGIC_APP_CALLBACK_URL;
    if (!callbackUrl) return jsonResponse(500, { success:false, status:'ConfigurationError', message:'LOGIC_APP_CALLBACK_URL is not configured.' });

    const logicAppPayload = {
      hostnames: normalizeHostnames(body.hostnames),
      startDateTime: body.startDateTime.trim(),
      endDateTime: body.endDateTime.trim(),
      timeZone: body.timeZone.trim(),
      changeNumber: body.changeNumber.trim(),
      reason: body.reason.trim(),
      environment: typeof body.environment === 'string' ? body.environment.trim() : '',
      requesterName: body.requesterName.trim(),
      requesterUserName: body.requesterEmail.trim(),
      requesterUserId: `manual:${body.employeeId.trim()}`
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
