const MAX_HOSTNAMES = 20;
const FIXED_TIME_ZONE = "India Standard Time";

const form = document.getElementById("suppressionForm");
const hostnamesInput = document.getElementById("hostnames");
const hostnameCount = document.getElementById("hostnameCount");
const validationMessage = document.getElementById("validationMessage");
const submitButton = document.getElementById("submitButton");
const clearButton = document.getElementById("clearButton");
const resultArea = document.getElementById("resultArea");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseHostnames(rawValue) {
  const values = rawValue
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.toUpperCase());

  return [...new Set(values)];
}

function updateHostnameCount() {
  const count = parseHostnames(hostnamesInput.value).length;
  hostnameCount.textContent = `${count} / ${MAX_HOSTNAMES}`;
  hostnameCount.classList.toggle("over-limit", count > MAX_HOSTNAMES);
}

function validateForm(payload) {
  if (!payload.requesterName) return "Enter the requester name.";
  if (!payload.requesterEmail) return "Enter the requester email or username.";

  if (payload.hostnames.length < 1) return "Enter at least one hostname.";
  if (payload.hostnames.length > MAX_HOSTNAMES) {
    return `A maximum of ${MAX_HOSTNAMES} unique hostnames is allowed.`;
  }

  const hostnamePattern = /^[A-Z0-9._-]{1,253}$/;
  const invalidHostname = payload.hostnames.find(
    (hostname) => !hostnamePattern.test(hostname)
  );

  if (invalidHostname) return `Invalid hostname: ${invalidHostname}.`;

  if (!payload.startDateTime || !payload.endDateTime) {
    return "Enter the start and end date/time.";
  }

  if (new Date(payload.endDateTime) <= new Date(payload.startDateTime)) {
    return "End date/time must be later than start date/time.";
  }

  if (!payload.changeNumber) return "Enter the change or incident number.";
  if (!payload.reason) return "Enter the reason for suppression.";

  return "";
}

function buildSuccessTable(items) {
  if (!Array.isArray(items) || items.length === 0) return "";

  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.hostname)}</td>
      <td>${escapeHtml(item.vmName)}</td>
      <td>${escapeHtml(item.subscriptionName)}</td>
      <td>${escapeHtml(item.resourceGroup)}</td>
      <td><span class="badge badge-success">${escapeHtml(item.status || "Created")}</span></td>
      <td>${escapeHtml(item.ruleName)}</td>
    </tr>
  `).join("");

  return `
    <h3>Successful VMs</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Azure VM</th>
            <th>Subscription</th>
            <th>Resource group</th>
            <th>Status</th>
            <th>Suppression rule</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildFailureTable(items) {
  if (!Array.isArray(items) || items.length === 0) return "";

  const rows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.hostname || item.hostnameSubmitted)}</td>
      <td><span class="badge badge-error">${escapeHtml(item.status || "Failed")}</span></td>
      <td>${escapeHtml(item.failureStage)}</td>
      <td>${escapeHtml(item.message || item.details?.message || "Automation failed")}</td>
    </tr>
  `).join("");

  return `
    <h3>Failed VMs</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Status</th>
            <th>Failure stage</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function showResult(result, httpStatus) {
  let bannerClass = "status-error";
  let heading = "Request failed";

  if (result.status === "Created") {
    bannerClass = "status-success";
    heading = "All suppression rules were created";
  } else if (result.status === "PartiallyCreated") {
    bannerClass = "status-warning";
    heading = "Request partially completed";
  }

  resultArea.hidden = false;
  resultArea.innerHTML = `
    <div class="status-banner ${bannerClass}">
      <h2>${escapeHtml(heading)}</h2>
      <div class="copy-row">
        <strong>Request ID:</strong>
        <code>${escapeHtml(result.requestId || "Not available")}</code>
        <button id="copyRequestId" type="button" class="secondary">Copy Request ID</button>
      </div>
      <p>${escapeHtml(result.message || `HTTP status ${httpStatus}`)}</p>
    </div>

    <div class="summary">
      <div class="summary-item">
        <strong>${escapeHtml(result.submittedCount ?? 0)}</strong>
        <span>Submitted</span>
      </div>
      <div class="summary-item">
        <strong>${escapeHtml(result.uniqueCount ?? 0)}</strong>
        <span>Unique</span>
      </div>
      <div class="summary-item">
        <strong>${escapeHtml(result.successCount ?? 0)}</strong>
        <span>Successful</span>
      </div>
      <div class="summary-item">
        <strong>${escapeHtml(result.failureCount ?? 0)}</strong>
        <span>Failed</span>
      </div>
    </div>

    ${buildSuccessTable(result.successfulResults)}
    ${buildFailureTable(result.failedResults)}
  `;

  document.getElementById("copyRequestId")?.addEventListener("click", async () => {
    if (!result.requestId) return;
    await navigator.clipboard.writeText(result.requestId);
    document.getElementById("copyRequestId").textContent = "Copied";
  });

  resultArea.scrollIntoView({ behavior: "smooth", block: "start" });
}

hostnamesInput.addEventListener("input", updateHostnameCount);

clearButton.addEventListener("click", () => {
  form.reset();
  document.getElementById("timeZone").value = FIXED_TIME_ZONE;
  validationMessage.textContent = "";
  resultArea.hidden = true;
  resultArea.innerHTML = "";
  updateHostnameCount();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  validationMessage.textContent = "";
  resultArea.hidden = true;

  const payload = {
    requesterName: document.getElementById("requesterName").value.trim(),
    requesterEmail: document.getElementById("requesterEmail").value.trim(),
    hostnames: parseHostnames(hostnamesInput.value),
    startDateTime: document.getElementById("startDateTime").value,
    endDateTime: document.getElementById("endDateTime").value,
    timeZone: document.getElementById("timeZone").value,
    changeNumber: document.getElementById("changeNumber").value.trim(),
    reason: document.getElementById("reason").value.trim(),
    environment: document.getElementById("environment").value
  };

  const validationError = validateForm(payload);
  if (validationError) {
    validationMessage.textContent = validationError;
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Processing VMs…";

  try {
    const response = await fetch("/api/submitSuppression", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let result;

    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = {
        success: false,
        status: "Failed",
        message: text || "The API returned an invalid response."
      };
    }

    showResult(result, response.status);
  } catch (error) {
    showResult({
      success: false,
      status: "Failed",
      message: `The request could not be submitted: ${error.message}`
    }, 0);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit suppression request";
  }
});

updateHostnameCount();
