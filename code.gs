/*********************************************************
 * ===== Carrybee Attendance Backend (Fixed & Updated) =====
 * Features:
 * - Role + Shift Validation
 * - Multi-Office Validation
 * - Geo-Fencing (200m default)
 * - Duplicate Check-In Prevention
 * - Check-Out Only After Check-In
 * - Same-Day Restriction
 * - Work Duration Auto Calculate
 *********************************************************/

const GEO_RADIUS = 200; // meters

/* ================= MAIN ENTRY ================= */
function doPost(e) {
  try {
    const params = e.parameter;
    const action = params.action;
    if (!action) throw new Error("Action missing");

    switch(action) {
      case "getHistory":
        return jsonResponse(getHistory(params.empId));
      case "getAllEmployees":
        return jsonResponse(getAllEmployees());
      case "getOffices":
        return jsonResponse(getOffices());
      case "Check-In":
      case "Check-Out":
        return jsonResponse(handleAttendance(params));
      default:
        throw new Error("Invalid action");
    }

  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

/* ================= ATTENDANCE HANDLER ================= */
function handleAttendance(params) {

  const empId = (params.empId || "").toUpperCase().trim();
  const shift = (params.shift || "").toLowerCase().trim();
  const selectedOffice = (params.office || "").trim();
  const latitude = parseFloat(params.latitude);
  const longitude = parseFloat(params.longitude);
  const action = params.action;
  const timestamp = new Date(params.timestamp);

  if (!empId || !shift || !selectedOffice || isNaN(latitude) || isNaN(longitude))
    throw new Error("Missing or invalid parameters");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timezone = ss.getSpreadsheetTimeZone();
  const todayStr = Utilities.formatDate(timestamp, timezone, "yyyy-MM-dd");

  // ===== EMPLOYEE VALIDATION =====
  const empSheet = ss.getSheetByName("Employees");
  if (!empSheet) throw new Error("Employees sheet missing");

  const empData = empSheet.getDataRange().getValues();
  const headers = empData[0].map(h => h.toString().toLowerCase());
  const colEmpId = headers.indexOf("empid");
  const colName = headers.indexOf("name");
  const colRole = headers.indexOf("role");

  if ([colEmpId, colName, colRole].includes(-1)) throw new Error("Employees sheet headers invalid");

  const employee = empData.slice(1).find(r => r[colEmpId].toString().toUpperCase() === empId);
  if (!employee) throw new Error("Employee not found");

  const empObj = { name: employee[colName], role: employee[colRole].toLowerCase() };

  // ===== ROLE + SHIFT VALIDATION =====
  const allowedShifts = { inbound: ["night"], outbound: ["morning", "evening"] };
  if (!allowedShifts[empObj.role]?.includes(shift)) throw new Error("Shift not allowed for role: " + empObj.role);

  // ===== OFFICE VALIDATION (Geo-Fencing) =====
  const officeMatch = getMatchingOffice(latitude, longitude, selectedOffice);
  if (!officeMatch.success) throw new Error(officeMatch.message);
  const matchedOffice = officeMatch.officeName;

  // ===== ATTENDANCE SHEET =====
  const attSheet = ss.getSheetByName("Attendance");
  if (!attSheet) throw new Error("Attendance sheet missing");

  const data = attSheet.getDataRange().getValues();
  let existingRow = null;

  for (let i = 1; i < data.length; i++) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), timezone, "yyyy-MM-dd");
    if (data[i][1].toString().toUpperCase() === empId && rowDate === todayStr) {
      existingRow = i + 1;
      break;
    }
  }

  // ===== CHECK-IN =====
  if (action === "Check-In") {
    if (existingRow) throw new Error("Already checked in today");

    attSheet.appendRow([
      todayStr,           // Date
      empId,              // Employee ID
      empObj.name,        // Name
      empObj.role,        // Role
      matchedOffice,      // Check-In Office
      timestamp,          // Check-In Time
      shift,              // Shift
      "", "",             // Check-Out Time, Shift
      "",                 // Check-Out Office
      latitude, longitude,// Check-In Lat/Lng
      "", "",             // Check-Out Lat/Lng
      ""                  // Work Duration
    ]);
  }

  // ===== CHECK-OUT =====
  if (action === "Check-Out") {
    if (!existingRow) throw new Error("No check-in found for today");

    const checkInTime = attSheet.getRange(existingRow, 6).getValue();
    const workDuration = calculateDuration(checkInTime, timestamp);

    attSheet.getRange(existingRow, 8).setValue(timestamp); // Check-Out Time
    attSheet.getRange(existingRow, 9).setValue(shift);     // Shift
    attSheet.getRange(existingRow, 10).setValue(matchedOffice); // Check-Out Office
    attSheet.getRange(existingRow, 13).setValue(latitude); // Check-Out Lat
    attSheet.getRange(existingRow, 14).setValue(longitude);// Check-Out Lng
    attSheet.getRange(existingRow, 15).setValue(workDuration);
  }

  return { success: true, message: `${action} successful at ${matchedOffice}` };
}

/* ================= STRICT OFFICE MATCH ================= */
function getMatchingOffice(lat, lng, selectedOffice) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Offices");
  if (!sheet) return { success: false, message: "Offices sheet missing" };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const officeName = data[i][0];
    if (!officeName) continue;

    if (officeName.toString().trim() === selectedOffice) {
      const locations = [data[i][1], data[i][2]]; // Only B & C

      for (let loc of locations) {
        if (!loc) continue;
        const parts = loc.toString().split(",");
        if (parts.length < 2) continue;

        const officeLat = parseFloat(parts[0].trim());
        const officeLng = parseFloat(parts[1].trim());
        if (isNaN(officeLat) || isNaN(officeLng)) continue;

        const distance = getDistanceInMeters(officeLat, officeLng, lat, lng);
        if (distance <= GEO_RADIUS) return { success: true, officeName: selectedOffice };
      }

      return { success: false, message: "Not within 200 meters of selected office" };
    }
  }

  return { success: false, message: "Selected office not found" };
}

/* ================= DISTANCE CALCULATION ================= */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ================= WORK DURATION ================= */
function calculateDuration(start, end) {
  if (!start || !end) return "";
  const diff = (new Date(end) - new Date(start)) / 1000;
  const hours = Math.floor(diff/3600);
  const minutes = Math.floor((diff%3600)/60);
  return `${hours}h ${minutes}m`;
}

/* ================= GET OFFICES ================= */
function getOffices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Offices");
  if (!sheet) return { success: false, message: "Offices sheet missing" };

  const offices = sheet.getRange("A2:A").getValues().flat().filter(String);
  return { success: true, offices };
}

/* ================= GET EMPLOYEES ================= */
function getAllEmployees() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Employees");
  if (!sheet) return { success: false, message: "Employees sheet missing" };

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().toLowerCase());
  const colEmpId = headers.indexOf("empid");
  const colName = headers.indexOf("name");
  const colRole = headers.indexOf("role");
  if ([colEmpId, colName, colRole].includes(-1)) return { success: false, message: "Invalid employee headers" };

  const employees = data.slice(1).map(r => ({ empId: r[colEmpId], name: r[colName], role: r[colRole] }));
  return { success: true, employees };
}

/* ================= GET HISTORY ================= */
function getHistory(empId) {
  if (!empId) return { success: false, message: "Employee ID required" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Attendance");
  if (!sheet) return { success: false, message: "Attendance sheet missing" };

  const data = sheet.getDataRange().getValues();
  const history = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString().toUpperCase() === empId.toUpperCase()) {
      history.push({
        date: data[i][0],
        checkInOffice: data[i][4],
        checkInTime: data[i][5],
        checkOutTime: data[i][7],
        checkOutOffice: data[i][9],
        workDuration: data[i][14]
      });
    }
  }

  return { success: true, history };
}

/* ================= JSON RESPONSE ================= */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
