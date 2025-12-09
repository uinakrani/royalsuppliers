$content = Get-Content "app/ledger/page.tsx" -Raw
$content = $content -replace '(?ms)// Delete linked party payment if it.s an income entry.*?// Revert expense distribution', '// No automatic party payment management'
$content | Set-Content "app/ledger/page.tsx"




