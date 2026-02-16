/* Attendance Handler (Geo-Fenced Version) */
function handleAttendance(e) {
  try {
    var empId = e.parameter.empId;
    var shift = e.parameter.shift;
    var latitude = parseFloat(e.parameter.latitude);
    var longitude = parseFloat(e.parameter.longitude);
    var action = e.parameter.action;
    var timestamp = new Date(e.parameter.timestamp);

    if (!empId || !shift || isNaN(latitude) || isNaN(longitude) || !action) {
      throw new Error("Missing or invalid attendance fields");
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    /* ===== GET EMPLOYEE ===== */
    var empSheet = ss.getSheetByName("Employees");
    if (!empSheet) throw new Error("Employees sheet not found");

    var empData = empSheet.getDataRange().getValues();
    var emp = null;

    for (var i = 1; i < empData.length; i++) {
      if (empData[i][1] == empId) {
        emp = {
          name: empData[i][2],
          role: empData[i][3],
          office: empData[i][4]   // Column E থেকে অফিস নাম
        };
        break;
      }
    }

    if (!emp) throw new Error("Employee not found");

    /* ===== GET OFFICE LOCATION ===== */
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

    /* ===== GEO-FENCING CHECK (200 meters) ===== */
    var MAX_DISTANCE = 200;
    var distance = getDistanceInMeters(
      officeLat,
      officeLng,
      latitude,
      longitude
    );

    if (distance > MAX_DISTANCE) {
      throw new Error(
        "Outside office area (200m limit). Your distance: " +
        Math.round(distance) + " meters"
      );
    }

    /* ===== ATTENDANCE SHEET ===== */
    var attSheet = ss.getSheetByName("Attendance");
    if (!attSheet) throw new Error("Attendance sheet not found");

    var data = attSheet.getDataRange().getValues();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var foundRow = null;

    for (var k = 1; k < data.length; k++) {
      var rowDate = new Date(data[k][0]);
      rowDate.setHours(0, 0, 0, 0);

      if (data[k][1] == empId && rowDate.getTime() === today.getTime()) {
        foundRow = k + 1;
        break;
      }
    }

    if (action === "Check-In") {
      if (foundRow) {
        throw new Error("Already checked in today");
      }

      attSheet.appendRow([
        new Date(today),
        empId,
        emp.name,
        emp.role,
        emp.office,
        timestamp,
        shift,
        "",
        "",
        latitude,
        longitude,
        "",
        ""
      ]);

    } else if (action === "Check-Out") {

      if (!foundRow) {
        throw new Error("No check-in found for today");
      }

      attSheet.getRange(foundRow, 8).setValue(timestamp);
      attSheet.getRange(foundRow, 9).setValue(shift);
      attSheet.getRange(foundRow, 12).setValue(latitude);
      attSheet.getRange(foundRow, 13).setValue(longitude);
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
