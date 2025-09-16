function doPost(e) {
  try {
    const params = e.parameter;
    const name = params.name;
    const shift = params.shift;
    const latitude = parseFloat(params.latitude);
    const longitude = parseFloat(params.longitude);
    const action = params.action;
    const email = params.email || "unknown@carrybee.com";

    if (!name || !shift || isNaN(latitude) || isNaN(longitude)) {
      return ContentService.createTextOutput("❌ Missing or invalid parameters.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const locationSheet = ss.getSheetByName("EmployeeLocations");
    const shiftSheet = ss.getSheetByName("ShiftTimes");
    const logSheet = ss.getSheetByName("Attendance") || ss.insertSheet("Attendance");

    // Set header if sheet is empty
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(["Timestamp", "Employee ID", "Shift", "Latitude", "Longitude", "Distance (m)", "Status", "Action", "Email"]);
    }

    // Get assigned location
    const locationData = locationSheet.getDataRange().getValues();
    let targetLat = null, targetLng = null;

    for (let i = 1; i < locationData.length; i++) {
      if (locationData[i][0].toLowerCase() === name.toLowerCase()) {
        targetLat = parseFloat(locationData[i][1]);
        targetLng = parseFloat(locationData[i][2]);
        break;
      }
    }

    if (targetLat === null || targetLng === null) {
      return ContentService.createTextOutput("❌ Employee ID not found in location records.");
    }

    const distance = getDistanceInMeters(latitude, longitude, targetLat, targetLng);
    if (distance > 100) {
      return ContentService.createTextOutput(
        `❌ Too far from assigned office.\n📍 Your location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}\n📌 Distance from office: ${Math.round(distance)} meters.`
      );
    }

    // Get shift cutoff time
    const shiftData = shiftSheet.getDataRange().getValues();
    let shiftCutoff = null;
    for (let j = 1; j < shiftData.length; j++) {
      if (shiftData[j][0].toLowerCase() === shift.toLowerCase()) {
        shiftCutoff = shiftData[j][1]; // Expected in HH:mm
        break;
      }
    }

    if (!shiftCutoff) {
      return ContentService.createTextOutput("❌ Shift time not found.");
    }

    const now = new Date();
    const timeZone = Session.getScriptTimeZone();
    const currentTime = Utilities.formatDate(now, timeZone, "HH:mm");
    const status = currentTime <= shiftCutoff ? "🟢 On Time" : "Late";

    logSheet.appendRow([
      now,
      name,
      shift,
      latitude,
      longitude,
      Math.round(distance),
      status,
      action,
      email
    ]);

    return ContentService.createTextOutput(`✅ ${status} - ${action} successful for ${name} at ${currentTime}\n📧 ${email}`);

  } catch (error) {
    return ContentService.createTextOutput("❌ Error: " + error.message);
  }
}

function doGet(e) {
  const name = e.parameter.name;
  const action = e.parameter.action;

  if (action === "history" && name) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Attendance");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "No attendance records found." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();
    const history = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toLowerCase() === name.toLowerCase()) {
        history.push({
          day: Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "dd MMM"),
          late: data[i][6],
          action: data[i][7],
          email: data[i][8]
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify(history))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput("✅ Attendance Web App is running.");
}

// ✅ FIX: Missing function added below
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = angle => angle * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
