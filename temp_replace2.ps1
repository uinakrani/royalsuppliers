$content = Get-Content "app/ledger/page.tsx" -Raw
$content = $content -replace '(?ms)// Handle supplier changes for expense entries.*?(?=\s+} else \{)', ''
$content | Set-Content "app/ledger/page.tsx"




