# TRACE-X offline 3D upgrade installer for Windows PowerShell 5.1+
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$needle = @'
data:v7DataPage}[state.route];$('app').innerHTML=r();save();}
'@
$replacement = @'
data:v7DataPage,graph3d:window.traceX3DPage}[state.route];$('app').innerHTML=r();save();if(state.route==='graph3d')window.traceX3DMount?.();else window.traceX3DStop?.();}
'@
foreach ($folder in @('dashboard\console', 'netlify-demo')) {
    $target = Join-Path $root $folder
    $js = Join-Path $target 'app.js'
    $html = Join-Path $target 'index.html'
    if (-not (Test-Path $js) -or -not (Test-Path $html)) { Write-Host "Skipping $folder (not found)"; continue }
    $code = [System.IO.File]::ReadAllText($js)
    if (-not $code.Contains('graph3d:window.traceX3DPage')) {
        if (-not $code.Contains($needle)) { throw "Could not locate TRACE-X route mapping in $js. File unchanged." }
        $code = $code.Replace($needle, $replacement)
        [System.IO.File]::WriteAllText($js, $code, [System.Text.UTF8Encoding]::new($false))
    }
    $page = [System.IO.File]::ReadAllText($html)
    if (-not $page.Contains('<script src="v8.js" defer></script>')) { throw "v8.js loader not found in $html. File unchanged." }
    if (-not $page.Contains('<script src="graph3d.js" defer></script>')) {
        $page = $page.Replace('<script src="v8.js" defer></script>', '<script src="v8.js" defer></script><script src="graph3d.js" defer></script>')
    }
    if (-not $page.Contains('<link rel="stylesheet" href="graph3d.css">')) {
        $page = $page.Replace('<link rel="stylesheet" href="styles.css">','<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="graph3d.css">')
    }
    [System.IO.File]::WriteAllText($html, $page, [System.Text.UTF8Encoding]::new($false))
    $v6file = Join-Path $target 'v6.js'
    if (Test-Path $v6file) {
        $v6 = [System.IO.File]::ReadAllText($v6file)
        $v6 = $v6.Replace("if(state.route==='provenance')render();","if(state.route==='provenance'||state.route==='graph3d')render();")
        [System.IO.File]::WriteAllText($v6file, $v6, [System.Text.UTF8Encoding]::new($false))
    }
    foreach ($name in @('graph3d.js','graph3d.css')) {
        Copy-Item -LiteralPath (Join-Path (Join-Path $root 'addons') $name) -Destination (Join-Path $target $name) -Force
    }
    Write-Host "Installed 3D graph in $folder"
}
Write-Host 'DONE. Git commit + push to deploy.'
