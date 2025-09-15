const webAppUrl = "https://script.google.com/macros/s/AKfycbyPkt34_jOEg8no_k03kuqcfr9bBlmJzYmJrgHX72f3K8fKd5XF7icEwD1LrtHK5rKE/exec"; // Replace with your public Web App URL

function handleSubmit(action) {
  const name = document.getElementById("name").value.trim();
  const shift = document.getElementById("shift").value;
  const statusDiv = document.getElementById("status");

  if (!name || !shift) {
    statusDiv.innerText = "❗ Please fill in all fields.";
    statusDiv.style.color = "red";
    return;
  }

  statusDiv.innerText = "📡 Getting location...";
  statusDiv.style.color = "#444";

  if (!navigator.geolocation) {
    statusDiv.innerText = "❌ Geolocation is not supported.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const params = new URLSearchParams({
        name: name,
        shift: shift,
        latitude: lat,
        longitude: lng,
        action: action
      });

      fetch(webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      })
        .then((res) => res.text())
        .then((txt) => {
          statusDiv.innerText = txt;
          statusDiv.style.color = txt.startsWith("✅") ? "green" : "red";
        })
        .catch((err) => {
          statusDiv.innerText = "❌ Network error: " + err.message;
          statusDiv.style.color = "red";
        });
    },
    (err) => {
      statusDiv.innerText = "❌ Location permission denied or unavailable.";
      statusDiv.style.color = "red";
    }
  );
}

function loadHistory() {
  const name = document.getElementById("name").value.trim();
  const historyDiv = document.getElementById("history");

  if (!name) {
    historyDiv.innerHTML = "<p style='color:red;'>⚠ Please enter Employee ID first.</p>";
    return;
  }

  historyDiv.innerHTML = "⏳ Loading history...";

  fetch(`${webAppUrl}?action=history&name=${encodeURIComponent(name)}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || data.length === 0) {
        historyDiv.innerHTML = "<p>No history found.</p>";
        return;
      }
      let html =
        "<table style='width:100%; border-collapse: collapse; margin-top:10px;'><thead><tr><th style='border-bottom:1px solid #ccc; text-align:left;'>Date & Time</th><th style='border-bottom:1px solid #ccc;'>Action</th><th style='border-bottom:1px solid #ccc;'>Status</th></tr></thead><tbody>";
      data.forEach((it) => {
        html += `<tr>
          <td>${it.timestamp || it.day}</td>
          <td>${it.action}</td>
          <td>${it.status || it.late}</td>
        </tr>`;
      });
      html += "</tbody></table>";
      historyDiv.innerHTML = html;
    })
    .catch((err) => {
      historyDiv.innerHTML = `<p style='color:red;'>❌ Failed to load history: ${err.message}</p>`;
    });
}
