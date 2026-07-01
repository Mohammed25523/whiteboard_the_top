To enable PDF import offline, place the following files in this folder:

- pdf.min.js
- pdf.worker.min.js

You can download them from a machine with internet access:

https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js

Alternative sources:

https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.min.js
https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js

If you open the app via file:// and the browser blocks external scripts, run a local HTTP server and reopen the app at http://localhost:8000/index.html instead.

Alternatively, run the script download-pdfjs.ps1 from the project root if your machine has internet access:

    .\download-pdfjs.ps1
