param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [string]$CheckoutDir = (Join-Path $PWD "StoryWeave")
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $ArchivePath)) { throw "Source ZIP does not exist: $ArchivePath" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Install Git for Windows first." }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Install Python 3 first." }
if (-not (Test-Path $CheckoutDir)) {
    git clone https://github.com/xianzhi321/StoryWeave.git $CheckoutDir
    if ($LASTEXITCODE -ne 0) { throw "Git clone failed." }
}
$tool = Join-Path $CheckoutDir "scripts/import_source_archive.py"
if (-not (Test-Path $tool)) { throw "Import helper is missing. Check the cloned repository." }
python $tool $ArchivePath --repo $CheckoutDir
if ($LASTEXITCODE -ne 0) { throw "Archive verification failed; no commit made." }
Write-Host "Target repository: https://github.com/xianzhi321/StoryWeave" -ForegroundColor Yellow
Write-Host "WARNING: This is a PUBLIC repository. Review credentials and third-party rights."
$answer = Read-Host "Enter PUBLISH to import the ZIP and push the complete source to main"
if ($answer -cne "PUBLISH") { Write-Host "Cancelled. No upload performed."; exit 0 }
python $tool $ArchivePath --repo $CheckoutDir --publish
if ($LASTEXITCODE -ne 0) { throw "Upload failed. Check GitHub authentication and Git status." }
Write-Host "Push finished. Verify the GitHub tree and run Android tests before installing any APK."
