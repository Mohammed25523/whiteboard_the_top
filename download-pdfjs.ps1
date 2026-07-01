$dest = Join-Path $PSScriptRoot 'assets\pdfjs'
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }
$files = @(
    @{ urls = @('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js', 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.min.js'); name = 'pdf.min.js' },
    @{ urls = @('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js', 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js'); name = 'pdf.worker.min.js' }
)
foreach ($file in $files) {
    $target = Join-Path $dest $file.name
    $downloaded = $false
    foreach ($url in $file.urls) {
        try {
            Write-Host "Downloading $url to $target..."
            Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing
            Write-Host "Saved $target"
            $downloaded = $true
            break
        } catch {
            Write-Warning "Failed to download $url: $_"
        }
    }
    if (-not $downloaded) {
        Write-Error "Failed to download $($file.name) from all known sources."
    }
}
