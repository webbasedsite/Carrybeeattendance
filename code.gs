function doPost(e) {
  try {
    var action = e.parameter.action;
    if (!action) throw new Error("Missing action parameter");

    switch (action) {
      case "addEmployee":
        return addEmployee(e);
      case "login":
        return login(e);
      case "Check-In":
      case "Check-Out":
        return handleAttendance(e);
      case "getAllEmployees":
        return getAllEmployees();
      case "getHistory":
        return getHistory(e);
      default:
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, message: "Unknown action: " + action })
        ).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Server error: " + err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/* Add Employee */
function addEmployee(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Employees");
    if (!sheet) throw new Error("Employees sheet not found");

    var empId = e.parameter.empId;
    var name = e.parameter.name;
    var role = e.parameter.role;
    var office = e.parameter.office;

    if (!empId || !name || !role) {
      throw new Error("Missing required fields");
    }

    sheet.appendRow([new Date(), empId, name, role, office]);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "Employee added successfully" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Add employee failed: " + err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/* Attendance Handler (Combined Version) */
function handleAttendance(e) {
  try {
    var empId = e.parameter.empId;
    var shift = e.parameter.shift;
    var latitude = e.parameter.latitude;
    var longitude = e.parameter.longitude;
    var action = e.parameter.action;  // "Check-In" or "Check-Out"
    var timestamp = new Date(e.parameter.timestamp);

    if (!empId || !shift || !latitude || !longitude || !action) {
      throw new Error("Missing required attendance fields");
    }

    // Get employee details
    var empSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Employees");
    var empData = empSheet.getDataRange().getValues();
    var emp = null;

    for (var i = 1; i < empData.length; i++) {
      if (empData[i][1] == empId) {
        emp = { name: empData[i][2], role: empData[i][3], office: empData[i][4] };
        break;
      }
    }
    if (!emp) throw new Error("Employee not found");

    var attSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Attendance");
    if (!attSheet) throw new Error("Attendance sheet not found");

    var data = attSheet.getDataRange().getValues();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var foundRow = null;
    for (var i = 1; i < data.length; i++) {
      var rowDate = new Date(data[i][0]);
      rowDate.setHours(0, 0, 0, 0);
      if (data[i][1] == empId && rowDate.getTime() === today.getTime()) {
        foundRow = i + 1; // sheet row index
        break;
      }
    }

    if (action === "Check-In") {
      if (foundRow) {
        throw new Error("Already checked in today");
      } else {
        attSheet.appendRow([
          new Date(today), // Date
          empId,           // Employee ID
          emp.name,        // Name
          emp.role,        // Role
          emp.office,      // Office
          timestamp,       // Check-In Time
          shift,           // Check-In Shift
          "",              // Check-Out Time
          "",              // Check-Out Shift
          latitude,        // Check-In Latitude
          longitude,       // Check-In Longitude
          "",              // Check-Out Latitude
          ""               // Check-Out Longitude
        ]);
      }
    } else if (action === "Check-Out") {
      if (!foundRow) {
        throw new Error("No check-in found for today");
      } else {
        attSheet.getRange(foundRow, 8).setValue(timestamp); // Check-Out Time
        attSheet.getRange(foundRow, 9).setValue(shift);     // Check-Out Shift
        attSheet.getRange(foundRow, 12).setValue(latitude); // Check-Out Latitude
        attSheet.getRange(foundRow, 13).setValue(longitude);// Check-Out Longitude
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: action + " successful" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Attendance error: " + err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/* Get All Employees */
function getAllEmployees() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Employees");
    if (!sheet) throw new Error("Employees sheet not found");

    var data = sheet.getDataRange().getValues();
    var employees = [];
    for (var i = 1; i < data.length; i++) {
      employees.push({ empId: data[i][1], name: data[i][2], role: data[i][3], office: data[i][4] });
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, employees: employees })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Get all employees failed: " + err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/* Get Attendance History (New Format with Work Duration) */
function getHistory(e) {
  try {
    var empId = e.parameter.empId;
    if (!empId) throw new Error("Missing empId");

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Attendance");
    if (!sheet) throw new Error("Attendance sheet not found");

    var data = sheet.getDataRange().getValues();
    var history = [];

    for (var i = 1; i < data.length; i++) {
      if (data[i][1] == empId) {
        var checkInTime = data[i][5] ? new Date(data[i][5]) : null;
        var checkOutTime = data[i][7] ? new Date(data[i][7]) : null;
        var workDuration = "";

        if (checkInTime && checkOutTime) {
          var diffMs = checkOutTime - checkInTime;
          var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          var diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          workDuration = diffHours + "h " + diffMinutes + "m";
        }

        history.push({
          date: data[i][0],
          empId: data[i][1],
          name: data[i][2],
          role: data[i][3],
          office: data[i][4],
          checkInTime: data[i][5],
          checkInShift: data[i][6],
          checkOutTime: data[i][7],
          checkOutShift: data[i][8],
          checkInLatitude: data[i][9],
          checkInLongitude: data[i][10],
          checkOutLatitude: data[i][11],
          checkOutLongitude: data[i][12],
          workDuration: workDuration
        });
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, history: history })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Get history failed: " + err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
