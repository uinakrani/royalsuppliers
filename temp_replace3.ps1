$content = Get-Content "app/ledger/page.tsx" -Raw
$content = $content -replace '(?ms)// If this is an expense entry with a supplier, distribute it to orders.*?(?=\s+}\s+// Drawer will close)', ''
$content | Set-Content "app/ledger/page.tsx"



