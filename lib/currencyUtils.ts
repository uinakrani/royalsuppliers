// Format number in Indian currency format (lakhs/crores)
export const formatIndianCurrency = (amount: number): string => {
  // Convert to string with 2 decimal places
  const parts = amount.toFixed(2).split('.')
  const integerPart = parts[0]
  const decimalPart = parts[1]
  
  // Format integer part with Indian numbering system
  // First 3 digits from right, then groups of 2
  if (integerPart.length <= 3) {
    return `Rs.${integerPart}.${decimalPart}`
  }
  
  // Reverse the string to work from right to left
  const reversed = integerPart.split('').reverse()
  let formatted = []
  
  // Take first 3 digits (from right)
  formatted.push(reversed.slice(0, 3).reverse().join(''))
  
  // Then take groups of 2
  for (let i = 3; i < reversed.length; i += 2) {
    const group = reversed.slice(i, i + 2).reverse().join('')
    if (group) {
      formatted.push(group)
    }
  }
  
  // Reverse back and join with commas
  return `Rs.${formatted.reverse().join(',')}.${decimalPart}`
}

