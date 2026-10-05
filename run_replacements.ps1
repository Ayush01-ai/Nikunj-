$modifiedCount = 0
$errors = @()
Get-ChildItem -Recurse "C:\Nikunj\src" -Include "*.ts","*.tsx" | ForEach-Object {
  $path = $_.FullName
  try {
    $original = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $updated = $original
    $updated = $updated -replace "@/components/Providers",   "@/frontend/providers/Providers"
    $updated = $updated -replace "@/components/",            "@/frontend/components/"
    $updated = $updated -replace "@/lib/mongodb",            "@/backend/lib/mongodb"
    $updated = $updated -replace "@/lib/auth",               "@/backend/lib/auth"
    $updated = $updated -replace "@/lib/razorpay",           "@/backend/lib/razorpay"
    $updated = $updated -replace "@/lib/",                   "@/backend/lib/"
    $updated = $updated -replace "@/models/Order",           "@/backend/models/Order"
    $updated = $updated -replace "@/models/Otp",             "@/backend/models/Otp"
    $updated = $updated -replace "@/models/User",            "@/backend/models/User"
    $updated = $updated -replace "@/models/",                "@/backend/models/"
    $updated = $updated -replace "@/store/cartStore",        "@/frontend/store/cartStore"
    $updated = $updated -replace "@/store/authStore",        "@/frontend/store/authStore"
    $updated = $updated -replace "@/store/wishlistStore",    "@/frontend/store/wishlistStore"
    $updated = $updated -replace "@/store/",                 "@/frontend/store/"
    $updated = $updated -replace "@/sanity/lib/client",      "@/cms/lib/client"
    $updated = $updated -replace "@/sanity/lib/image",       "@/cms/lib/image"
    $updated = $updated -replace "@/sanity/lib/queries",     "@/cms/lib/queries"
    $updated = $updated -replace "@/sanity/lib/",            "@/cms/lib/"
    $updated = $updated -replace "@/sanity/schemas",         "@/cms/schemas"
    $updated = $updated -replace "@/sanity/",                "@/cms/"
    if ($updated -ne $original) {
      Set-Content -LiteralPath $path -Value $updated -Encoding UTF8 -NoNewline
      Write-Output "Updated: $path"
      $modifiedCount++
    }
  } catch { $errors += "ERROR on ${path}: $_"; Write-Output "ERROR on ${path}: $_" }
}
Write-Output "Done."
Write-Output "Files modified: $modifiedCount"
if ($errors.Count -gt 0) { Write-Output "Errors: $($errors.Count)" } else { Write-Output "No errors encountered." }
