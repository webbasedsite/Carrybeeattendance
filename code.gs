/*********************************************************
 * ===== Carrybee Attendance Backend (Enterprise Version) =====
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

    if (action === "getAllEmployees") {
      return jsonResponse(getAllEmployees());
    }

    if (action === "Check-In" || action === "Check-Out") {
      return jsonResponse(handleAttendance(params));
    }

    throw new Error("Invalid action");

  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

/* ================= ATTENDANCE HANDLER ================= */
function handleAttendance(params) {

  const empId = (params.empId || "").toUpperCase().trim();
  const shift = (params.shift || "").toLowerCase().trim();
  const latitude = parseFloat(params.latitude);
  const longitude = parseFloat(params.longitude);
  const action = params.action;
  const timestamp = new Date(params.timestamp);

  if (!empId || !shift || isNaN(latitude) || isNaN(longitude))
    throw new Error("Missing or invalid parameters");

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  /* ===== EMPLOYEE VALIDATION ===== */
  const empSheet = ss.getSheetByName("Employees");
  if (!empSheet) throw new Error("Employees sheet missing");

  const empData = empSheet.getDataRange().getValues();
  const headers = empData[0].map(h => h.toString().toLowerCase());

  const colEmpId = headers.indexOf("empid");
  const colName = headers.indexOf("name");
  const colRole = headers.indexOf("role");

  if ([colEmpId, colName, colRole].includes(-1))
    throw new Error("Employees sheet headers invalid");

  let employee = null;

  for (let i = 1; i < empData.length; i++) {
    if (empData[i][colEmpId].toString().toUpperCase() === empId) {
      employee = {
        name: empData[i][colName],
        role: empData[i][colRole].toLowerCase()
      };
      break;
    }
  }

  if (!employee) throw new Error("Employee not found");

  /* ===== ROLE + SHIFT VALIDATION ===== */
  const allowedShifts = {
    inbound: ["night"],
    outbound: ["morning", "evening"]
  };

  if (!allowedShifts[employee.role]?.includes(shift))
    throw new Error("Shift not allowed for role: " + employee.role);

  /* ===== MATCH ANY REGISTERED OFFICE ===== */
  const officeMatch = getMatchingOffice(latitude, longitude);
  if (!officeMatch.success)
    throw new Error(officeMatch.message);

  const matchedOffice = officeMatch.officeName;

  /* ===== ATTENDANCE SHEET ===== */
  const attSheet = ss.getSheetByName("Attendance");
  if (!attSheet) throw new Error("Attendance sheet missing");

  const data = attSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0,0,0,0);

  let existingRow = null;

  for (let i = 1; i < data.length; i++) {
    const rowDate = new Date(data[i][0]);
    rowDate.setHours(0,0,0,0);

    if (
      data[i][1].toString().toUpperCase() === empId &&
      rowDate.getTime() === today.getTime()
    ) {
      existingRow = i + 1;
      break;
    }
  }

  /* ===== CHECK-IN ===== */
  if (action === "Check-In") {

    if (existingRow)
      throw new Error("Already checked in today");

    attSheet.appendRow([
      today,                 // Date
      empId,
      employee.name,
      employee.role,
      matchedOffice,         // Check-In Office
      timestamp,             // Check-In Time
      shift,
      "", "",                // Check-Out Time + Shift
      "",                    // Check-Out Office
      latitude, longitude,   // Check-In Lat/Lng
      "", "",                // Check-Out Lat/Lng
      ""                     // Work Duration
    ]);
  }

  /* ===== CHECK-OUT ===== */
  if (action === "Check-Out") {

    if (!existingRow)
      throw new Error("No check-in found for today");

    const checkInTime = attSheet.getRange(existingRow, 6).getValue();
    const workDuration = calculateDuration(checkInTime, timestamp);

    attSheet.getRange(existingRow, 8).setValue(timestamp);
    attSheet.getRange(existingRow, 9).setValue(shift);
    attSheet.getRange(existingRow, 10).setValue(matchedOffice);
    attSheet.getRange(existingRow, 13).setValue(latitude);
    attSheet.getRange(existingRow, 14).setValue(longitude);
    attSheet.getRange(existingRow, 15).setValue(workDuration);
  }

  return {
    success: true,
    message: action + " successful at " + matchedOffice
  };
}

/* ================= MATCH ANY OFFICE ================= */
function getMatchingOffice(lat, lng) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const officeSheet = ss.getSheetByName("Offices");

  if (!officeSheet)
    return { success:false, message:"Offices sheet missing" };

  const data = officeSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {

    const officeName = data[i][0];
    const officeLat = parseFloat(data[i][1]);
    const officeLng = parseFloat(data[i][2]);

    const distance = getDistanceInMeters(
      officeLat, officeLng,
      lat, lng
    );

    if (distance <= GEO_RADIUS) {
      return { success:true, officeName:officeName };
    }
  }

  return {
    success:false,
    message:"Not inside any registered office area"
  };
}

/* ================= DISTANCE FUNCTION ================= */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/* ================= WORK DURATION ================= */
function calculateDuration(start, end) {
  if (!start || !end) return "";

  const diff = (new Date(end) - new Date(start)) / 1000;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  return hours + "h " + minutes + "m";
}

/* ================= GET EMPLOYEES ================= */
function getAllEmployees() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const empSheet = ss.getSheetByName("Employees");

  if (!empSheet)
    return { success:false, message:"Employees sheet missing" };

  const data = empSheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().toLowerCase());

  const colEmpId = headers.indexOf("empid");
  const colName = headers.indexOf("name");
  const colRole = headers.indexOf("role");

  if ([colEmpId, colName, colRole].includes(-1))
    return { success:false, message:"Invalid employee headers" };

  const employees = data.slice(1).map(r => ({
    empId: r[colEmpId],
    name: r[colName],
    role: r[colRole]
  }));

  return { success:true, employees:employees };
}

/* ================= JSON RESPONSE ================= */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
