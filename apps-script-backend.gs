/*
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code into Code.gs.
 * 4. Click Deploy > New Deployment > Type: Web App.
 * 5. Configuration:
 *    - Description: "MST Backend"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (Required for simple fetch from PWA without complex OAuth flow)
 * 6. Copy the URL and paste it into the App Settings.
 */

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const compressedData = postData.data; // Expecting LZ-string compressed data
    
    // In a real scenario, you might decompress here if you want to store readable data in Sheets immediately.
    // However, Apps Script libraries for LZ-string are rare. 
    // Usually, we store the raw blob or use a lighter compression if server-side processing is needed.
    // For this prototype, we will just log that we received it and "mock" saving to a sheet named "RawData".
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("RawData");
    if (!sheet) {
      sheet = ss.insertSheet("RawData");
      sheet.appendRow(["Timestamp", "DataLength", "RawContent"]);
    }
    
    sheet.appendRow([new Date(), compressedData.length, compressedData]);
    
    // To be truly useful, you would pass the JSON uncompressed from the client 
    // OR include LZString.js in this Apps Script project to decompress and distribute to specific sheets (Team, Projects, etc.)
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data saved successfully to Sheet'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    message: 'MST Backend is running'
  })).setMimeType(ContentService.MimeType.JSON);
}