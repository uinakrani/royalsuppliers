import { orderService } from './orderService'
import { Order } from '@/types/order'

// Generate random date within a specific month
const getDateInMonth = (year: number, month: number, day?: number): string => {
  const date = new Date(year, month - 1, day || Math.floor(Math.random() * 28) + 1)
  return date.toISOString().split('T')[0]
}

// Generate dummy orders
export const generateDummyOrders = async (): Promise<void> => {
  const partyNames = ['ABC Construction', 'XYZ Builders', 'Premier Developers']
  const sites = {
    'ABC Construction': ['Site A - Downtown', 'Site B - Industrial Area', 'Site C - Residential'],
    'XYZ Builders': ['Main Project Site', 'Extension Site', 'Renovation Site'],
    'Premier Developers': ['Tower A', 'Tower B', 'Commercial Complex']
  }
  const materials = ['Bodeli', 'Panetha', 'Nareshware', 'Kali', 'Chikhli Kapchi VSI', 'Chikhli Kapchi', 'Areth']
  const truckOwners = ['Rajesh Transport', 'Sharma Logistics', 'Patel Trucks', 'Singh Haulage', 'Kumar Freight']
  const truckNumbers = ['GJ-01-AB-1234', 'GJ-02-CD-5678', 'GJ-03-EF-9012', 'GJ-04-GH-3456', 'GJ-05-IJ-7890']

  const orders: Omit<Order, 'id'>[] = []
  const currentYear = new Date().getFullYear()
  
  // Generate orders for the last 6 months
  for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
    const currentDate = new Date()
    currentDate.setMonth(currentDate.getMonth() - monthOffset)
    const year = currentDate.getFullYear()
    const actualMonth = currentDate.getMonth() + 1 // getMonth() returns 0-11, we need 1-12

    // Generate 3-5 orders per month
    const ordersPerMonth = Math.floor(Math.random() * 3) + 3
    
    for (let i = 0; i < ordersPerMonth; i++) {
      const partyName = partyNames[Math.floor(Math.random() * partyNames.length)]
      const partySites = sites[partyName as keyof typeof sites]
      const siteName = partySites[Math.floor(Math.random() * partySites.length)]
      
      // Select 1-3 materials randomly
      const numMaterials = Math.floor(Math.random() * 3) + 1
      const selectedMaterials: string[] = []
      const availableMaterials = [...materials]
      for (let j = 0; j < numMaterials; j++) {
        const randomIndex = Math.floor(Math.random() * availableMaterials.length)
        selectedMaterials.push(availableMaterials[randomIndex])
        availableMaterials.splice(randomIndex, 1)
      }
      
      const weight = Math.floor(Math.random() * 50) + 10 // 10-60 tons
      const rate = Math.floor(Math.random() * 500) + 500 // 500-1000 per ton
      const total = weight * rate
      
      const originalWeight = weight + Math.floor(Math.random() * 5) - 2 // Slight variation
      const originalRate = rate - Math.floor(Math.random() * 100) // Lower original rate
      const originalTotal = originalWeight * originalRate
      
      const additionalCost = Math.floor(Math.random() * 5000) + 1000 // 1000-6000
      const profit = total - (originalTotal + additionalCost)
      
      const order: Omit<Order, 'id'> = {
        date: getDateInMonth(year, actualMonth),
        partyName,
        siteName,
        material: selectedMaterials,
        weight,
        rate,
        total,
        truckOwner: truckOwners[Math.floor(Math.random() * truckOwners.length)],
        truckNo: truckNumbers[Math.floor(Math.random() * truckNumbers.length)],
        originalWeight,
        originalRate,
        originalTotal,
        additionalCost,
        profit,
        paymentDue: Math.random() > 0.3, // 70% have payment due
        paid: Math.random() > 0.7, // 30% are fully paid
        paidAmount: Math.random() > 0.7 ? total : (Math.random() > 0.5 ? total * 0.5 : 0),
        partialPayments: [],
        invoiced: false,
        archived: false,
      }
      
      orders.push(order)
    }
  }

  console.log(`Generating ${orders.length} dummy orders...`)
  
  // Create orders one by one with delay to avoid overwhelming Firestore
  for (let i = 0; i < orders.length; i++) {
    try {
      await orderService.createOrder(orders[i])
      console.log(`✅ Created order ${i + 1}/${orders.length}: ${orders[i].partyName} - ${orders[i].siteName}`)
      // Small delay between orders
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (error: any) {
      console.error(`❌ Failed to create order ${i + 1}:`, error.message)
    }
  }
  
  console.log(`✅ Finished generating ${orders.length} dummy orders!`)
}

