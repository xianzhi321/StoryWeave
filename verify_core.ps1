param(
    [switch] $RealIndexedDb,
    [switch] $Format
)

$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
$previousMode = $env:STORYWEAVE_STORAGE_TEST
try {
    foreach ($file in (Get-ChildItem -LiteralPath web -Filter '*.js' -File)) {
        node --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($file.Name)" }
    }
    foreach ($test in @('test_v06.cjs', 'test_v08_core.cjs', 'test_narrative_core.cjs',
            'test_archive_core.cjs', 'test_atlas_core.cjs', 'test_generator_core.cjs', 'test_writing_sense.cjs', 'test_offline_assets.cjs')) {
        node $test
        if ($LASTEXITCODE -ne 0) { throw "Test failed: $test" }
    }
    $modes = @('', 'read-failure', 'corrupt-fallback')
    if ($RealIndexedDb) { $modes += 'indexeddb' }
    foreach ($mode in $modes) {
        $env:STORYWEAVE_STORAGE_TEST = $mode
        node test_v11_browser.cjs
        if ($LASTEXITCODE -ne 0) { throw "Browser test failed: $mode" }
    }
    if ($Format) {
        npx --yes prettier@3.9.10 --check --single-quote --trailing-comma none web/workspace-store.js web/epub-archive.js
        if ($LASTEXITCODE -ne 0) { throw 'Core formatting check failed' }
    }
} finally {
    $env:STORYWEAVE_STORAGE_TEST = $previousMode
    Pop-Location
}
