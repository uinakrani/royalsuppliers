$content = Get-Content "app/ledger/page.tsx" -Raw
$content = $content -replace '(?ms)// Handle party name changes for income entries.*?(?=// Handle supplier changes)', '// No automatic distribution for income entries'
$content | Set-Content "app/ledger/page.tsx"



