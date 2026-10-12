# canvas_icl_bulk_download
Vibe coded with Claude, this is is a chrome extension that adds a 'bulk download' button to canvas module page so that you can bulk-download all the attached files on the page. 
The files are downloaded as a .zip while files are organized by folders named with the session names on the module page. 

## Install
1. Download from git and unzip this folder.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `canvas-module-downloader` folder.
   (Updating from an earlier version: replace the folder, then click the reload arrow on the extension's card.)

## Use
1. Turn on the extension. 
2. Open the module page of the module/course that you are looking at on Canvas. If you have opened if before the extension is turned on, refresh the page. 
3. A 'Download all files' button will appear on the top right corner.
4. Wait for a few moments for all files to be fetched and packed as.
5. The file explorer will pop up and choose the local directories where you want to save the .zip file.
