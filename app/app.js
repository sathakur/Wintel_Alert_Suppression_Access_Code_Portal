const MAX_HOSTNAMES = 20;
const FIXED_TIME_ZONE = "India Standard Time";
const ALLOWED_EMAIL_DOMAINS = ["capgemini.com", "fresenius.com"];
const MINIMUM_LEAD_MINUTES = 45;
const MAXIMUM_DURATION_HOURS = 24;

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

function getEmailDomain(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const parts = normalized.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return "";
  }

  return parts[1];
}

function isAllowedRequesterEmail(email) {
  return ALLOWED_EMAIL_DOMAINS.includes(getEmailDomain(email));
}

function parseIstDateTime(value) {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const utcMilliseconds =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) -
    330 * 60 * 1000;

  const istView = new Date(utcMilliseconds + 330 * 60 * 1000);

  if (
    istView.getUTCFullYear() !== Number(year) ||
    istView.getUTCMonth() !== Number(month) - 1 ||
    istView.getUTCDate() !== Number(day) ||
    istView.getUTCHours() !== Number(hour) ||
    istView.getUTCMinutes() !== Number(minute) ||
    istView.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }

  return utcMilliseconds;
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
  if (!payload.requesterEmail) return "Enter the requester email.";
  if (!isAllowedRequesterEmail(payload.requesterEmail)) {
    return "Requester email must end with @capgemini.com or @fresenius.com.";
  }

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

  const startMilliseconds = parseIstDateTime(payload.startDateTime);
  const endMilliseconds = parseIstDateTime(payload.endDateTime);

  if (startMilliseconds === null || endMilliseconds === null) {
    return "Enter valid start and end dates in India Standard Time.";
  }

  if (endMilliseconds <= startMilliseconds) {
    return "End date/time must be later than start date/time.";
  }

  const minimumStart =
    Date.now() + MINIMUM_LEAD_MINUTES * 60 * 1000;

  if (startMilliseconds < minimumStart) {
    return `Start time must be at least ${MINIMUM_LEAD_MINUTES} minutes in the future.`;
  }

  const durationMilliseconds = endMilliseconds - startMilliseconds;
  if (durationMilliseconds > MAXIMUM_DURATION_HOURS * 60 * 60 * 1000) {
    return `The suppression window cannot exceed ${MAXIMUM_DURATION_HOURS} hours.`;
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
