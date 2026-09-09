# Generates public/icons/icon-{16,32,48,128}.png (Windows only; uses System.Drawing).
param(
    [string]$OutDir = "public/icons"
)

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
    param([double]$X, [double]$Y, [double]$W, [double]$H, [double]$Radius)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $Radius * 2
    $p.AddArc($X, $Y, $d, $d, 180, 90)
    $p.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $p.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $p.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-Icon {
    param([int]$Size, [string]$FilePath)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Violet -> blue diagonal gradient, slightly rounded square background.
    $bg = New-RoundedRectPath 0 0 $Size $Size ($Size * 0.22)
    $violet = [System.Drawing.Color]::FromArgb(255, 124, 58, 237)
    $blue = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)), $violet, $blue, 45)
    $g.FillPath($gradient, $bg)

    # Diagonal white ruler band (rotated -45deg) clipped to the tile.
    $g.SetClip($bg)
    $half = $Size / 2.0
    $g.TranslateTransform($half, $half)
    $g.RotateTransform(-45)

    $bandHalf = $Size * 0.15
    $bandLength = $Size * 1.5
    $bandRadius = [Math]::Min($bandHalf, $Size * 0.05)
    $band = New-RoundedRectPath (-$bandLength / 2) (-$bandHalf) $bandLength ($bandHalf * 2) $bandRadius
    $g.FillPath([System.Drawing.Brushes]::White, $band)

    # Ink tick marks across the band.
    $ink = [System.Drawing.Pen]::new(
        [System.Drawing.Color]::FromArgb(255, 49, 46, 129),
        [Math]::Max(1.0, $Size * 0.025))
    $ink.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
    $ink.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat
    $tickCount = 9
    $spacing = $bandLength / ($tickCount + 1)
    for ($i = 1; $i -le $tickCount; $i++) {
        $x = -$bandLength / 2 + $i * $spacing
        $g.DrawLine($ink, $x, -$bandHalf, $x, $bandHalf)
    }
    $g.ResetTransform()

    $bmp.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $ink.Dispose(); $gradient.Dispose(); $g.Dispose(); $bmp.Dispose()
    Write-Host "wrote $FilePath"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
foreach ($size in 16, 32, 48, 128) {
    New-Icon -Size $size -FilePath (Join-Path $OutDir "icon-$size.png")
}
