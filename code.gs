/* ===== Attendance Handler (Geo-Fenced, Flexible Employee Columns) ===== */
function handleAttendance(e) {
  try {
    // ----- Extract and validate parameters -----
    var empId = e.parameter.empId;
    var shift = e.parameter.shift;
    var latitude = parseFloat(e.parameter.latitude);
    var longitude = parseFloat(e.parameter.longitude);
    var action = e.parameter.action;  // "Check-In" or "Check-Out"
    var timestamp = new Date(e.parameter.timestamp);

    if (!empId || !shift || isNaN(latitude) || isNaN(longitude) || !action) {
      throw new Error("Missing or invalid attendance fields");
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ----- GET EMPLOYEE (Flexible Columns) -----
    var empSheet = ss.getSheetByName("Employees");
    if (!empSheet) throw new Error("Employees sheet not found");

    var empData = empSheet.getDataRange().getValues();
    if (empData.length < 2) throw new Error("No employee data found");

    // Detect headers dynamically
    var headers = empData[0].map(h => h.toString().toLowerCase());
    var colEmpId = headers.indexOf("empid");
    var colName  = headers.indexOf("name");
    var colRole  = headers.indexOf("role");
    var colOffice= headers.indexOf("office");

    if (colEmpId < 0 || colName < 0 || colRole < 0 || colOffice < 0) {
      throw new Error("Employee sheet missing required headers (EmpID, Name, Role, Office)");
    }

    // Find employee
    var emp = null;
    for (var i = 1; i < empData.length; i++) {
      if (empData[i][colEmpId].toString() == empId) {
        emp = {
          name: empData[i][colName],
          role: empData[i][colRole],
          office: empData[i][colOffice]
        };
        break;
      }
    }
    if (!emp) throw new Error("Employee not found");

    // ----- GET OFFICE LOCATION -----
    var officeSheet = ss.getSheetByName("Offices");
    if (!officeSheet) throw new Error("Offices sheet not found");

    var officeData = officeSheet.getDataRange().getValues();
    var officeLat = null;
    var officeLng = null;

    for (var j = 1; j < officeData.length; j++) {
      if (officeData[j][0] == emp.office) {
        officeLat = parseFloat(officeData[j][1]);
        officeLng = parseFloat(officeData[j][2]);
        break;
      }
    }
    if (officeLat === null || officeLng === null) {
      throw new Error("Office location not found");
    }

    // ----- GEO-FENCING CHECK (200 meters) -----
    var MAX_DISTANCE = 200;
    var distance = getDistanceInMeters(officeLat, officeLng, latitude, longitude);

    if (distance > MAX_DISTANCE) {
      throw new Error(
        "Outside office area (200m limit). Your distance: " + Math.round(distance) + " meters"
      );
    }

    // ----- ATTENDANCE SHEET -----
    var attSheet = ss.getSheetByName("Attendance");
    if (!attSheet) throw new Error("Attendance sheet not found");

    var data = attSheet.getDataRange().getValues();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var foundRow = null;
    for (var k = 1; k < data.length; k++) {
      var rowDate = new Date(data[k][0]);
      rowDate.setHours(0, 0, 0, 0);

      if (data[k][1].toString() == empId && rowDate.getTime() === today.getTime()) {
        foundRow = k + 1; // Google Sheets rows are 1-indexed
        break;
      }
    }

    if (action === "Check-In") {
      if (foundRow) throw new Error("Already checked in today");

      attSheet.appendRow([
        new Date(today), // Date
        empId,
        emp.name,
        emp.role,
        emp.office,
        timestamp,   // Check-In Time
        shift,       // Check-In Shift
        "",          // Check-Out Time
        "",          // Check-Out Shift
        latitude,    // Check-In Latitude
        longitude,   // Check-In Longitude
        "",          // Check-Out Latitude
        ""           // Check-Out Longitude
      ]);

    } else if (action === "Check-Out") {
      if (!foundRow) throw new Error("No check-in found for today");

      attSheet.getRange(foundRow, 8).setValue(timestamp);   // Check-Out Time
      attSheet.getRange(foundRow, 9).setValue(shift);       // Check-Out Shift
      attSheet.getRange(foundRow, 12).setValue(latitude);   // Check-Out Latitude
      attSheet.getRange(foundRow, 13).setValue(longitude);  // Check-Out Longitude
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: action + " successful" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ===== Distance Calculation ===== */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  var R = 6371000; // Earth radius in meters
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
