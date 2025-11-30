import jsPDF from 'jspdf'
import { Order } from '@/types/order'
import { format } from 'date-fns'

// Generate order number: ROYAL + short timestamp
const generateOrderNumber = (order: Order): string => {
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date(order.date)
  const timestamp = format(orderDate, 'yyMMddHHmm') // YYMMDDHHMM format
  return `ROYAL${timestamp}`
}

// Format number in Indian currency format (lakhs/crores)
const formatIndianCurrency = (amount: number): string => {
  // Round to nearest whole number
  const roundedAmount = Math.round(amount)
  
  // Convert to string (no decimals needed after rounding)
  const integerPart = roundedAmount.toString()
  
  // Format integer part with Indian numbering system
  // First 3 digits from right, then groups of 2
  if (integerPart.length <= 3) {
    return integerPart
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
  return formatted.reverse().join(',')
}

// Helper function to load an image
const loadImage = async (imagePath: string): Promise<{ dataUrl: string; img: HTMLImageElement } | null> => {
  try {
    const response = await fetch(`${imagePath}?t=${Date.now()}`, {
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      return null
    }
    
    const blob = await response.blob()
    
    // Convert blob to data URL
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolveReader, rejectReader) => {
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolveReader(reader.result)
        } else {
          rejectReader(new Error('Failed to convert blob to data URL'))
        }
      }
      reader.onerror = rejectReader
      reader.readAsDataURL(blob)
    })
    
    // Create image element to get dimensions
    const img = new Image()
    await new Promise<void>((resolveImg, rejectImg) => {
      img.onload = () => {
        if (img.width === 0 || img.height === 0) {
          rejectImg(new Error('Invalid image dimensions'))
          return
        }
        resolveImg()
      }
      img.onerror = rejectImg
      img.src = dataUrl
    })
    
    return { dataUrl, img }
  } catch (error) {
    console.warn(`Failed to load image from ${imagePath}:`, error)
    return null
  }
}

// Helper function to add logo to PDF
const addLogoToPDF = async (doc: jsPDF, pageWidth: number, pageHeight: number): Promise<void> => {
  // Load top logo (top-logo.jpg)
  const topLogoPaths = ['/top-logo.jpg']
  let topLogoLoaded = false
  
  for (const logoPath of topLogoPaths) {
    const result = await loadImage(logoPath)
    if (result) {
      const { dataUrl, img } = result
      console.log(`Top logo loaded successfully: ${img.width}x${img.height} from ${logoPath}`)
      
      // Calculate logo dimensions (max width 80mm, maintain aspect ratio)
      const maxWidth = 80
      const aspectRatio = img.height / img.width
      const logoWidth = maxWidth
      const logoHeight = maxWidth * aspectRatio
      
      // Add logo at top left
      const logoX = 20
      const logoY = 15
      
      // Add logo to PDF
      doc.addImage(dataUrl, 'PNG', logoX, logoY, logoWidth, logoHeight)
      console.log('Top logo added to PDF')
      topLogoLoaded = true
      break
    }
  }
  
  if (!topLogoLoaded) {
    console.warn('Top logo (top-logo.jpg) not found.')
  }
  
  // Load watermark logo (old logo files)
  const watermarkLogoPaths = ['/logo.png', '/logo.jpg', '/logo.jpeg']
  let watermarkLoaded = false
  
  for (const logoPath of watermarkLogoPaths) {
    const result = await loadImage(logoPath)
    if (result) {
      const { dataUrl, img } = result
      console.log(`Watermark logo loaded successfully: ${img.width}x${img.height} from ${logoPath}`)
      
      // Create watermark with opacity using canvas
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        // Draw original image to canvas
        ctx.drawImage(img, 0, 0)
        
        // Get image data and apply opacity
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        
        // Apply 0.1 opacity by reducing alpha channel
        for (let i = 3; i < data.length; i += 4) {
          data[i] = Math.round(data[i] * 0.1) // Alpha channel
        }
        
        ctx.putImageData(imageData, 0, 0)
        const watermarkDataUrl = canvas.toDataURL('image/png')
        
        // Add watermark in center
        const aspectRatio = img.height / img.width
        const watermarkSize = 60
        const watermarkX = (pageWidth - watermarkSize) / 2
        const watermarkY = (pageHeight - watermarkSize) / 2
        const watermarkWidth = watermarkSize
        const watermarkHeight = watermarkSize * aspectRatio
        
        doc.addImage(watermarkDataUrl, 'PNG', watermarkX, watermarkY, watermarkWidth, watermarkHeight)
        console.log('Watermark added to PDF')
        watermarkLoaded = true
        break
      }
    }
  }
  
  if (!watermarkLoaded) {
    console.warn('Watermark logo (logo.png, logo.jpg, or logo.jpeg) not found.')
  }
}

export const generateInvoicePDF = async (order: Order): Promise<void> => {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  
  // Set default font settings for better rendering
  doc.setFont('helvetica', 'normal')
  // Ensure no character spacing
  doc.setProperties({
    title: 'Invoice',
    subject: 'Order Invoice',
    author: 'Royal Suppliers',
    creator: 'Royal Suppliers'
  })
  
  // Add logo and watermark
  await addLogoToPDF(doc, pageWidth, pageHeight)
  
  // Margins
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  const contentX = margin
  
  // Start after logo - use smaller estimate to reduce space
  const logoY = 15
  const logoHeight = 30 // Reduced estimate for logo height (actual will vary by aspect ratio)
  let yPos = logoY + logoHeight // Start immediately after logo with no extra spacing
  
  // ROYAL and timestamp above date
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date(order.date)
  const timestamp = format(orderDate, 'yyMMddHHmm') // YYMMDDHHMM format
  const royalTimestamp = `ROYAL${timestamp}`
  
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(royalTimestamp, pageWidth - margin, yPos, { align: 'right', charSpace: 0 })
  yPos += 12

  // Billed to and From sections side by side
  const leftColX = contentX
  const rightColX = contentX + (contentWidth / 2) + 20
  const colWidth = (contentWidth / 2) - 20

  // Billed to (left column)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Billed to:', leftColX, yPos, { charSpace: 0 })
  yPos += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(50, 50, 50)
  doc.text(order.partyName, leftColX, yPos, { charSpace: 0 })
  yPos += 6
  doc.text(order.siteName, leftColX, yPos, { charSpace: 0 })

  // From (right column)
  const fromY = yPos - 13
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(30, 30, 30)
  doc.text('From:', rightColX, fromY, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.text('Royal Suppliers', rightColX, fromY + 7, { charSpace: 0 })

  yPos += 18

  // Table header - calculate column positions to fit within page width
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  
  // Calculate column positions based on available width
  const infoLeft = contentX
  const infoRight = contentX + contentWidth
  const tableStartX = infoLeft
  const tableEndX = infoRight
  const tableWidth = tableEndX - tableStartX
  
  // Column widths (proportional) - adjusted to include date
  const dateWidth = tableWidth * 0.15      // 15% for date
  const materialWidth = tableWidth * 0.30  // 30% for material
  const weightWidth = tableWidth * 0.18    // 18% for weight
  const rateWidth = tableWidth * 0.18      // 18% for rate
  const totalWidth = tableWidth * 0.19     // 19% for total

  const dateX = tableStartX
  const materialX = dateX + dateWidth
  const weightX = materialX + materialWidth
  const rateX = weightX + weightWidth
  const totalX = rateX + rateWidth
  
  // Draw top border for table header
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  const headerTopY = yPos - 4
  doc.line(tableStartX, headerTopY, tableStartX + tableWidth, headerTopY)
  
  // Draw bottom border for table header
  const headerBottomY = yPos + 4
  doc.line(tableStartX, headerBottomY, tableStartX + tableWidth, headerBottomY)
  
  // Calculate center Y position between borders for vertical centering
  // Account for text baseline - font size 9 has approximately 3.2mm height
  // Border height is 8mm (from -4 to +4), so center is at yPos
  // Text baseline should be slightly below center to account for text metrics
  const headerCenterY = (headerTopY + headerBottomY) / 2 + 1.5
  
  doc.text('Date', dateX, headerCenterY, { charSpace: 0 })
  doc.text('Material', materialX, headerCenterY, { charSpace: 0 })
  doc.text('Weight', weightX + weightWidth, headerCenterY, { charSpace: 0, align: 'right' })
  doc.text('Rate', rateX + rateWidth, headerCenterY, { charSpace: 0, align: 'right' })
  doc.text('Total', totalX + totalWidth, headerCenterY, { charSpace: 0, align: 'right' })
  
  yPos = headerBottomY + 6

  // Table content
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(50, 50, 50)
  
  // Handle materials - combine all materials into one item
  const materials = Array.isArray(order.material) ? order.material : [order.material]
  const materialDisplay = materials.join(', ')
  
    // Single row with all materials - wrap long material names if needed
    const materialLines = doc.splitTextToSize(materialDisplay, materialWidth - 5)
    
    // Render text with explicit options to prevent letter spacing
    const textOptions = { charSpace: 0 }
    const rowStartY = yPos
    
    // Add order date
    const orderDateObj = new Date(order.date)
    const formattedDate = format(orderDateObj, 'dd MMM yyyy')
    doc.text(formattedDate, dateX, yPos, textOptions)
    
    if (Array.isArray(materialLines)) {
      materialLines.forEach((line: string, index: number) => {
        doc.text(line, materialX, yPos + (index * 7), textOptions)
      })
    } else {
      doc.text(materialLines, materialX, yPos, textOptions)
    }
    doc.text(order.weight.toFixed(2), weightX + weightWidth, yPos, { charSpace: 0, align: 'right' })
    doc.text(`Rs.${formatIndianCurrency(order.rate)}`, rateX + rateWidth, yPos, { charSpace: 0, align: 'right' })
    doc.text(`Rs.${formatIndianCurrency(order.total)}`, totalX + totalWidth, yPos, { charSpace: 0, align: 'right' })
    
    // Adjust yPos if material name wrapped to multiple lines
    const rowHeight = Math.max(7, materialLines.length * 7)
    yPos += rowHeight
  
  yPos += 5
  
  // Calculate where to place totals at bottom of page
  const bottomMargin = 50
  const totalsY = pageHeight - bottomMargin
  
  // Summary Section - moved to bottom right
  const summaryX = infoRight
  let summaryY = totalsY
  
  // Subtotal
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Subtotal:', summaryX - 60, summaryY, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs.${formatIndianCurrency(order.total)}`, summaryX, summaryY, { align: 'right', charSpace: 0 })
  summaryY += 8

  // Discount (if profit is negative, show as discount)
  if (order.profit < 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Discount Applied:', summaryX - 60, summaryY, { charSpace: 0 })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(220, 38, 38) // Red for discount
    doc.text(`- Rs.${formatIndianCurrency(Math.abs(order.profit))}`, summaryX, summaryY, { align: 'right', charSpace: 0 })
    doc.setTextColor(50, 50, 50)
    summaryY += 8
  }

  // Grand Total
  summaryY += 4
  doc.setDrawColor(200, 200, 200)
  doc.line(summaryX - 60, summaryY, summaryX, summaryY)
  summaryY += 8

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Total:', summaryX - 60, summaryY, { charSpace: 0 })
  const grandTotal = order.total + (order.profit < 0 ? order.profit : 0)
  doc.text(`Rs.${formatIndianCurrency(grandTotal)}`, summaryX, summaryY, { align: 'right', charSpace: 0 })
  
  // Save PDF
  doc.save(`Invoice_${order.partyName}_${format(new Date(order.date), 'ddMMyyyy')}.pdf`)
}

export const generateMultipleInvoicesPDF = async (orders: Order[]): Promise<void> => {
  if (orders.length === 0) return
  
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  
  // Set default font settings
  doc.setFont('helvetica', 'normal')
  // Ensure no character spacing
  doc.setProperties({
    title: 'Invoice',
    subject: 'Order Invoice',
    author: 'Royal Suppliers',
    creator: 'Royal Suppliers'
  })
  
  // Add logo and watermark to first page
  await addLogoToPDF(doc, pageWidth, pageHeight)
  
  // Margins
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  const contentX = margin
  
  // Start after logo - use smaller estimate to reduce space
  const logoY = 15
  const logoHeight = 30 // Reduced estimate for logo height (actual will vary by aspect ratio)
  let yPos = logoY + logoHeight // Start immediately after logo with no extra spacing
  
  // ROYAL and timestamp above date
  const firstOrderDate = orders[0].createdAt ? new Date(orders[0].createdAt) : new Date(orders[0].date)
  const timestamp = format(firstOrderDate, 'yyMMddHHmm') // YYMMDDHHMM format
  const royalTimestamp = `ROYAL${timestamp}`
  
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(royalTimestamp, pageWidth - margin, yPos, { align: 'right', charSpace: 0 })
  yPos += 12

  // Billed to and From sections side by side
  const leftColX = contentX
  const rightColX = contentX + (contentWidth / 2) + 20
  const partyName = orders[0].partyName

  // Billed to (left column)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Billed to:', leftColX, yPos, { charSpace: 0 })
  yPos += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(50, 50, 50)
  doc.text(partyName, leftColX, yPos, { charSpace: 0 })
  yPos += 6
  const addresses = Array.from(
    new Set(
      orders
        .map(o => (o.siteName || '').trim())
        .filter(addr => addr && addr.length > 0)
    )
  )
  if (addresses.length === 0) {
    // No address found in orders, keep existing behavior using first order site if available
    if (orders[0].siteName) {
      doc.text((orders[0].siteName || '').trim(), leftColX, yPos, { charSpace: 0 })
    }
  } else if (addresses.length === 1) {
    doc.text(addresses[0], leftColX, yPos, { charSpace: 0 })
  } else {
    // If multiple different addresses found, include up to two distinct addresses
    doc.text(addresses[0], leftColX, yPos, { charSpace: 0 })
    yPos += 6
    doc.text(addresses[1], leftColX, yPos, { charSpace: 0 })
  }

  // From (right column)
  const fromY = yPos - 13
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(30, 30, 30)
  doc.text('From:', rightColX, fromY, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.text('Royal Suppliers', rightColX, fromY + 7, { charSpace: 0 })

  yPos += 18

  // Table header
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  
  const infoLeft = contentX
  const infoRight = contentX + contentWidth
  const tableStartX = infoLeft
  const tableEndX = infoRight
  const tableWidth = tableEndX - tableStartX
  
  // Column widths (proportional) - adjusted to include date
  const dateWidth = tableWidth * 0.15      // 15% for date
  const materialWidth = tableWidth * 0.30  // 30% for material
  const weightWidth = tableWidth * 0.18    // 18% for weight
  const rateWidth = tableWidth * 0.18      // 18% for rate
  const totalWidth = tableWidth * 0.19     // 19% for total

  const dateX = tableStartX
  const materialX = dateX + dateWidth
  const weightX = materialX + materialWidth
  const rateX = weightX + weightWidth
  const totalX = rateX + rateWidth
  
  // Draw top border for table header
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  const headerTopY = yPos - 4
  doc.line(tableStartX, headerTopY, tableStartX + tableWidth, headerTopY)
  
  // Draw bottom border for table header
  const headerBottomY = yPos + 4
  doc.line(tableStartX, headerBottomY, tableStartX + tableWidth, headerBottomY)
  
  // Calculate center Y position between borders for vertical centering
  // Account for text baseline - font size 9 has approximately 3.2mm height
  // Border height is 8mm (from -4 to +4), so center is at yPos
  // Text baseline should be slightly below center to account for text metrics
  const headerCenterY = (headerTopY + headerBottomY) / 2 + 1.5
  
  doc.text('Date', dateX, headerCenterY, { charSpace: 0 })
  doc.text('Material', materialX, headerCenterY, { charSpace: 0 })
  doc.text('Weight', weightX + weightWidth, headerCenterY, { charSpace: 0, align: 'right' })
  doc.text('Rate', rateX + rateWidth, headerCenterY, { charSpace: 0, align: 'right' })
  doc.text('Total', totalX + totalWidth, headerCenterY, { charSpace: 0, align: 'right' })
  
  yPos = headerBottomY + 6

  // Table content - iterate through all orders
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(50, 50, 50)
  
  let totalAmount = 0
  
  for (const order of orders) {
    // Check if we need a new page
    if (yPos > pageHeight - 100) {
      doc.addPage()
      // Add watermark to new page
      await addLogoToPDF(doc, pageWidth, pageHeight)
      yPos = margin + 25
    }
    
    // Handle materials - combine all materials into one item
    const materials = Array.isArray(order.material) ? order.material : [order.material]
    const materialDisplay = materials.join(', ')
    
    // Single row with all materials - wrap long material names if needed
    const materialLines = doc.splitTextToSize(materialDisplay, materialWidth - 5)
    
    // Render text with explicit options to prevent letter spacing
    const textOptions = { charSpace: 0 }
    const rowStartY = yPos
    
    // Add order date
    const orderDateObj = new Date(order.date)
    const formattedDate = format(orderDateObj, 'dd MMM yyyy')
    doc.text(formattedDate, dateX, yPos, textOptions)
    
    if (Array.isArray(materialLines)) {
      materialLines.forEach((line: string, index: number) => {
        doc.text(line, materialX, yPos + (index * 7), textOptions)
      })
    } else {
      doc.text(materialLines, materialX, yPos, textOptions)
    }
    doc.text(order.weight.toFixed(2), weightX + weightWidth, yPos, { charSpace: 0, align: 'right' })
    doc.text(`Rs.${formatIndianCurrency(order.rate)}`, rateX + rateWidth, yPos, { charSpace: 0, align: 'right' })
    doc.text(`Rs.${formatIndianCurrency(order.total)}`, totalX + totalWidth, yPos, { charSpace: 0, align: 'right' })
    
    // Adjust yPos if material name wrapped to multiple lines
    const rowHeight = Math.max(7, materialLines.length * 7)
    yPos += rowHeight
    yPos += 4
    
    totalAmount += order.total
  }
  
  yPos += 5
  
  // Calculate where to place totals at bottom of page
  const bottomMargin = 50
  const totalsY = pageHeight - bottomMargin
  
  // Summary Section - moved to bottom right
  const summaryX = infoRight
  let summaryY = totalsY
  
  // Subtotal
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Subtotal:', summaryX - 60, summaryY, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(`Rs.${formatIndianCurrency(totalAmount)}`, summaryX, summaryY, { align: 'right', charSpace: 0 })
  summaryY += 8

  // Grand Total
  summaryY += 4
  doc.setDrawColor(200, 200, 200)
  doc.line(summaryX - 60, summaryY, summaryX, summaryY)
  summaryY += 8

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Total:', summaryX - 60, summaryY, { charSpace: 0 })
  doc.text(`Rs.${formatIndianCurrency(totalAmount)}`, summaryX, summaryY, { align: 'right', charSpace: 0 })
  
  // Save PDF
  const fileName = `Invoice_${partyName}_${format(new Date(), 'ddMMyyyy')}.pdf`
  doc.save(fileName)
}

