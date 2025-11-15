import jsPDF from 'jspdf'
import { Order } from '@/types/order'
import { format } from 'date-fns'

export const generateInvoicePDF = (order: Order): void => {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  
  // Set default font settings for better rendering
  doc.setFont('helvetica', 'normal')
  
  // Margins
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  const contentX = margin
  
  let yPos = margin + 20
  
  // Logo/Brand name
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(14, 184, 166) // Teal green
  doc.text('ROYAL SUPPLIERS', contentX, yPos, { charSpace: 0 })
  yPos += 8
  
  // Greeting
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.text(`Hi ${order.partyName}, Thank you for choosing our services. Here are your order details.`, contentX, yPos, { maxWidth: contentWidth, charSpace: 0 })
  yPos += 15
  
  // Order Information Section
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  
  const infoLeft = contentX
  const infoRight = contentX + contentWidth
  
  // Order No
  doc.text('Order No:', infoLeft, yPos, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(`#${order.id?.substring(0, 8) || 'N/A'}`, infoRight, yPos, { align: 'right', charSpace: 0 })
  yPos += 7
  
  // Order time
  doc.setFont('helvetica', 'bold')
  doc.text('Order time:', infoLeft, yPos, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(format(new Date(order.date), 'dd MMM yyyy, hh:mm a'), infoRight, yPos, { align: 'right', charSpace: 0 })
  yPos += 7
  
  // Party Name
  doc.setFont('helvetica', 'bold')
  doc.text('Party Name:', infoLeft, yPos, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(order.partyName, infoRight, yPos, { align: 'right', charSpace: 0 })
  yPos += 7
  
  // Site Name
  doc.setFont('helvetica', 'bold')
  doc.text('Site Name:', infoLeft, yPos, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(order.siteName, infoRight, yPos, { align: 'right', charSpace: 0 })
  yPos += 12
  
  // Itemized List Section
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Items:', infoLeft, yPos, { charSpace: 0 })
  yPos += 8
  
  // Table header - calculate column positions to fit within page width
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  
  // Calculate column positions based on available width
  const tableStartX = infoLeft
  const tableEndX = infoRight
  const tableWidth = tableEndX - tableStartX
  
  // Column widths (proportional)
  const itemNameWidth = tableWidth * 0.45  // 45% for item name
  const qtyWidth = tableWidth * 0.20        // 20% for quantity
  const unitPriceWidth = tableWidth * 0.17  // 17% for unit price
  const priceWidth = tableWidth * 0.18     // 18% for price
  
  const itemNameX = tableStartX
  const qtyX = itemNameX + itemNameWidth
  const unitPriceX = qtyX + qtyWidth
  const priceX = unitPriceX + unitPriceWidth
  
  doc.text('Item Name', itemNameX, yPos, { charSpace: 0 })
  doc.text('Quantity', qtyX, yPos, { charSpace: 0 })
  doc.text('Unit Price', unitPriceX, yPos, { charSpace: 0 })
  doc.text('Price', priceX, yPos, { charSpace: 0 })
  
  // Draw line under header
  yPos += 3
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.5)
  doc.line(tableStartX, yPos, tableEndX, yPos)
  yPos += 5
  
  // Table content
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(50, 50, 50)
  
  // Handle materials - combine all materials into one item
  const materials = Array.isArray(order.material) ? order.material : [order.material]
  const materialDisplay = materials.join(', ')
  
  // Single row with all materials - wrap long material names if needed
  const materialLines = doc.splitTextToSize(materialDisplay, itemNameWidth - 5)
  doc.text(materialLines, itemNameX, yPos, { charSpace: 0 })
  doc.text(order.weight.toFixed(2), qtyX, yPos, { charSpace: 0 })
  doc.text(`₹${order.rate.toFixed(2)}`, unitPriceX, yPos, { charSpace: 0 })
  doc.text(`₹${order.total.toFixed(2)}`, priceX, yPos, { charSpace: 0 })
  
  // Adjust yPos if material name wrapped to multiple lines
  yPos += Math.max(6, materialLines.length * 6)
  
  yPos += 5
  
  // Summary Section
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  
  const summaryX = infoRight
  const summaryStartY = yPos
  
  // Subtotal
  doc.text('Subtotal:', summaryX - 60, yPos, { charSpace: 0 })
  doc.setFont('helvetica', 'normal')
  doc.text(`₹${order.total.toFixed(2)}`, summaryX, yPos, { align: 'right', charSpace: 0 })
  yPos += 7
  
  // Additional Cost (if any)
  if (order.additionalCost > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Additional Charges:', summaryX - 60, yPos, { charSpace: 0 })
    doc.setFont('helvetica', 'normal')
    doc.text(`₹${order.additionalCost.toFixed(2)}`, summaryX, yPos, { align: 'right', charSpace: 0 })
    yPos += 7
  }
  
  // Discount (if profit is negative, show as discount)
  if (order.profit < 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Discount Applied:', summaryX - 60, yPos, { charSpace: 0 })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(220, 38, 38) // Red for discount
    doc.text(`- ₹${Math.abs(order.profit).toFixed(2)}`, summaryX, yPos, { align: 'right', charSpace: 0 })
    doc.setTextColor(50, 50, 50)
    yPos += 7
  }
  
  // Grand Total
  yPos += 3
  doc.setDrawColor(200, 200, 200)
  doc.line(summaryX - 60, yPos, summaryX, yPos)
  yPos += 7
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(14, 184, 166) // Teal green
  doc.text('Grand Total:', summaryX - 60, yPos, { charSpace: 0 })
  const grandTotal = order.total + (order.additionalCost || 0) + (order.profit < 0 ? order.profit : 0)
  doc.text(`₹${grandTotal.toFixed(2)}`, summaryX, yPos, { align: 'right', charSpace: 0 })
  
  // Payment Status
  yPos += 10
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  if (order.paid) {
    doc.setTextColor(34, 197, 94) // Green
    doc.text('Payment Status: Paid', infoLeft, yPos, { charSpace: 0 })
  } else if (order.paidAmount && order.paidAmount > 0) {
    doc.setTextColor(234, 179, 8) // Yellow
    doc.text(`Payment Status: Partial (₹${order.paidAmount.toFixed(2)} paid)`, infoLeft, yPos, { charSpace: 0 })
  } else {
    doc.setTextColor(239, 68, 68) // Red
    doc.text('Payment Status: Pending', infoLeft, yPos, { charSpace: 0 })
  }
  
  // Save PDF
  doc.save(`Invoice_${order.partyName}_${format(new Date(order.date), 'ddMMyyyy')}.pdf`)
}

export const generateMultipleInvoicesPDF = (orders: Order[]): void => {
  // Generate individual invoices for each order
  orders.forEach((order) => {
    generateInvoicePDF(order)
  })
}

