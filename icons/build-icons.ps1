Add-Type -AssemblyName System.Drawing

foreach ($size in @(192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.ScaleTransform($size / 512, $size / 512)

  $background = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $background.AddArc(0, 0, 216, 216, 180, 90)
  $background.AddArc(296, 0, 216, 216, 270, 90)
  $background.AddArc(296, 296, 216, 216, 0, 90)
  $background.AddArc(0, 296, 216, 216, 90, 90)
  $background.CloseFigure()
  $backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f7f5ef'))
  $graphics.FillPath($backgroundBrush, $background)

  $bookPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#28312e'), 24)
  $bookPen.StartCap = $bookPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $bookPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $left = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $left.AddBezier(256, 177, 216, 151, 168, 143, 112, 159)
  $left.AddLine(112, 159, 112, 349)
  $left.AddBezier(112, 349, 168, 333, 216, 341, 256, 367)
  $right = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $right.AddBezier(256, 177, 296, 151, 344, 143, 400, 159)
  $right.AddLine(400, 159, 400, 349)
  $right.AddBezier(400, 349, 344, 333, 296, 341, 256, 367)
  $graphics.DrawPath($bookPen, $left)
  $graphics.DrawPath($bookPen, $right)

  $foldPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#ad7845'), 14)
  $foldPen.StartCap = $foldPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($foldPen, 256, 180, 256, 361)

  $bitmap.Save((Join-Path $PSScriptRoot "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $foldPen.Dispose()
  $right.Dispose()
  $left.Dispose()
  $bookPen.Dispose()
  $backgroundBrush.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
