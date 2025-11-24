'use client'

import OrderFormWizard from '@/components/OrderFormWizard'
import { Order } from '@/types/order'

interface OrderFormProps {
  order?: Order | null
  onClose: () => void
  onSave: (order: Omit<Order, 'id'>) => Promise<void>
}

export default function OrderForm({ order, onClose, onSave }: OrderFormProps) {
  // Use the wizard-based form
  return <OrderFormWizard order={order} onClose={onClose} onSave={onSave} />
}
