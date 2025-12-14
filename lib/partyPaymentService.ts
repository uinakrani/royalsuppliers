
import { LedgerEntry } from './ledgerService';

export interface PartyPayment {
  id?: string
  partyName: string
  amount: number
  date: string
  ledgerEntryId?: string
  note?: string | null
  createdAt?: string
  updatedAt?: string
  source?: string
}

export const partyPaymentService = {
  async getAllPayments(options?: { onRemoteUpdate?: (payments: PartyPayment[]) => void, preferRemote?: boolean }): Promise<PartyPayment[]> {
    // Get ledger entries and filter for credit entries with party names
    const { ledgerService } = await import('./ledgerService')
    const ledgerEntries = await ledgerService.list({
      preferRemote: options?.preferRemote,
      onRemoteUpdate: (entries) => {
        if (options?.onRemoteUpdate) {
          options.onRemoteUpdate(this.mapLedgerCreditsToPayments(entries))
        }
      }
    })
    const partyPayments = this.mapLedgerCreditsToPayments(ledgerEntries)

    options?.onRemoteUpdate?.(partyPayments)
    return this.sortPayments(partyPayments)
  },

  // Sort payments by date descending
  sortPayments(payments: PartyPayment[]): PartyPayment[] {
    return payments.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  },

  // Deduplicate payments that point to the same ledger entry (or same id)
  dedupePayments(payments: PartyPayment[]): PartyPayment[] {
    const seenLedgerIds = new Set<string>()
    const seenIds = new Set<string>()
    const result: PartyPayment[] = []

    for (const payment of payments) {
      const ledgerId = payment.ledgerEntryId
      const id = payment.id

      // Only dedupe if we have a ledgerId; otherwise fall back to id
      if (ledgerId) {
        if (seenLedgerIds.has(ledgerId)) continue
        seenLedgerIds.add(ledgerId)
      } else if (id) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
      } else {
        // If neither exists, keep it but don't block future entries
      }

      result.push(payment)
    }

    return result
  },


  // Convert credit ledger entries with partyName into party payment-like records
  mapLedgerCreditsToPayments(entries: LedgerEntry[]): PartyPayment[] {
    return entries
      .filter((e) => e.type === 'credit' && e.partyName && !e.voided)
      .map((e) => ({
        id: e.id,
        partyName: e.partyName!,
        amount: e.amount,
        date: e.date,
        ledgerEntryId: e.id,
        note: e.note,
        createdAt: e.createdAt ?? e.date,
        updatedAt: e.createdAt ?? e.date,
        source: 'ledgerCredit',
      }))
  },

  // Best-effort shim to keep backward compatibility with ledgerService.
  // Party payments are derived directly from ledger credits, so we don't need
  // to persist anything here—just validate input and return to avoid runtime errors.
  async upsertPaymentFromLedgerCredit(payment: {
    id?: string
    partyName: string
    amount: number
    date: string
    note?: string | null
    createdAt?: string
  }): Promise<void> {
    if (!payment?.partyName?.trim()) {
      return
    }
    // No-op: ledger credits already represent party payments in list()
  },


  async addPayment(partyName: string, amount: number, note?: string): Promise<void> {
    if (!partyName?.trim()) {
      throw new Error('Party name is required')
    }
    if (!amount || amount <= 0) {
      throw new Error('Payment amount must be greater than zero')
    }

    const normalizedParty = partyName.trim()
    const paymentDate = new Date().toISOString()
    const preparedNote = note?.trim()

    const { ledgerService } = await import('./ledgerService')
    await ledgerService.addEntry(
      'credit',
      amount,
      preparedNote,
      'partyPayment',
      paymentDate,
      undefined,
      normalizedParty
    )

    // The ledger service will automatically update the local cache and trigger UI updates
  },

  async updatePayment(paymentId: string, updates: { amount?: number; note?: string | null; date?: string }): Promise<void> {
    const { ledgerService } = await import('./ledgerService')

    // paymentId is the ledger entry ID since we're using ledger entries as the source of truth
    await ledgerService.update(paymentId, {
      amount: updates.amount,
      note: updates.note ?? undefined,
      date: updates.date,
    })
  },

  async removePayment(paymentId: string): Promise<void> {
    if (!paymentId) {
      throw new Error('Payment ID is required')
    }

    const { ledgerService } = await import('./ledgerService')

    // paymentId is the ledger entry ID since we're using ledger entries as the source of truth
    await ledgerService.remove(paymentId)
  },





};

