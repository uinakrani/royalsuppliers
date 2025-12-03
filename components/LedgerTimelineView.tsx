import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { LedgerEntry } from '@/lib/ledgerService';
import { formatIndianCurrency } from '@/lib/currencyUtils';
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';
import { InvestmentRecord, InvestmentActivity } from '@/lib/investmentService';

import { Invoice } from '@/types/invoice';
import { Order } from '@/types/order';

const ensureDate = (value?: string): Date | null => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00.000Z`;
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const getTimelineTime = (entry: LedgerEntry): number => {
  const dateObj = ensureDate(entry.createdAt || entry.date);
  return dateObj ? dateObj.getTime() : 0;
};

const getTimelineDateKey = (entry: LedgerEntry): string => {
  const dateObj = ensureDate(entry.createdAt || entry.date) || new Date();
  return format(dateObj, 'yyyy-MM-dd');
};

interface LedgerTimelineViewProps {
  entries: LedgerEntry[];
  investment: InvestmentRecord | null;
  investmentHistory?: InvestmentActivity[];
  invoices?: Invoice[];
  orders?: Order[];
}

interface DailyGroup {
  date: string;
  entries: LedgerEntry[];
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
}

export default function LedgerTimelineView({ entries, investment, investmentHistory = [], invoices = [], orders = [] }: LedgerTimelineViewProps) {
  // Group entries by date and calculate daily stats
  const dailyGroups = useMemo(() => {
    // Create a copy of entries to sort
    const sortedEntries: LedgerEntry[] = [...entries];
    
    // 1. Process Investment History
    if (investmentHistory && investmentHistory.length > 0) {
      const activities = [...investmentHistory].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      activities.forEach(activity => {
        let amount = 0;
        let note = activity.note || '';
        
        if (activity.activityType === 'created') {
          amount = activity.amount;
          note = note || 'Initial Capital Investment';
        } else if (activity.activityType === 'updated') {
          const prev = activity.previousAmount || 0;
          amount = activity.amount - prev;
          
          if (amount > 0) {
             note = note || 'Capital Added';
          } else if (amount < 0) {
             note = note || 'Capital Reduced';
          } else {
             return;
          }
        } else {
          return;
        }

        if (amount === 0) return;

        let activityDate = activity.date;
        if (!activityDate.includes('T')) {
          activityDate = activityDate + 'T00:00:00.000Z';
        }

        sortedEntries.push({
          id: `inv-act-${activity.id || Math.random()}`,
          type: amount >= 0 ? 'credit' : 'debit',
          amount: Math.abs(amount),
          date: activityDate,
          createdAt: activity.timestamp || activityDate,
          note: note,
          source: 'manual',
          partyName: 'Investment Capital'
        });
      });
    } else if (investment) {
      let investmentDate = investment.date;
      if (!investmentDate.includes('T')) {
        investmentDate = investmentDate + 'T00:00:00.000Z';
      }
      
      sortedEntries.push({
        id: 'investment-capital',
        type: 'credit',
        amount: investment.amount,
        date: investmentDate,
        createdAt: investment.updatedAt || investmentDate,
        note: investment.note || 'Initial Capital Investment',
        source: 'manual',
        partyName: 'Investment Capital'
      });
    }

    // 2. Process Invoice Payments (Income)
    invoices.forEach(invoice => {
      if (invoice.partialPayments) {
        invoice.partialPayments.forEach(payment => {
          const recordedAt = payment.createdAt || payment.date
          sortedEntries.push({
            id: `inv-pay-${payment.id}`,
            type: 'credit',
            amount: payment.amount,
            date: payment.date,
            createdAt: recordedAt,
            note: `Invoice: ${invoice.invoiceNumber}${payment.note ? ` - ${payment.note}` : ''}`,
            source: 'manual',
            partyName: invoice.partyName || 'Unknown Party'
          });
        });
      }
    });

    // 3. Process Direct Order Payments (Income & Expense)
    orders.forEach(order => {
      if (order.customerPayments) {
        order.customerPayments.forEach(payment => {
          if (!payment.ledgerEntryId) {
            const recordedAt = payment.createdAt || payment.date
            sortedEntries.push({
              id: `ord-cust-pay-${payment.id}`,
              type: 'credit',
              amount: payment.amount,
              date: payment.date,
              createdAt: recordedAt,
              note: `Order Payment${payment.note ? ` - ${payment.note}` : ''}`,
              source: 'manual',
              partyName: order.partyName || 'Unknown Party'
            });
          }
        });
      }

      if (order.partialPayments) {
        order.partialPayments.forEach(payment => {
          if (!payment.ledgerEntryId) {
            const recordedAt = payment.createdAt || payment.date
            sortedEntries.push({
              id: `ord-part-pay-${payment.id}`,
              type: 'debit',
              amount: payment.amount,
              date: payment.date,
              createdAt: recordedAt,
              note: `Order Expense${payment.note ? ` - ${payment.note}` : ''}`,
              source: 'manual',
              supplier: order.supplier || 'Unknown Supplier'
            });
          }
        });
      }
    });

    // Sort entries by date ascending first to calculate running balance correctly
    sortedEntries.sort((a, b) => {
      const aTime = getTimelineTime(a);
      const bTime = getTimelineTime(b);
      return aTime - bTime;
    });

    const groups: Record<string, LedgerEntry[]> = {};
    let runningBalance = 0;
    
    // First pass: calculate running balances and group
    const entriesWithBalance = sortedEntries.map(entry => {
      const amount = entry.type === 'credit' ? entry.amount : -entry.amount;
      runningBalance += amount;
      
      const dateKey = getTimelineDateKey(entry);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(entry);
      
      return { ...entry, balanceAfter: runningBalance };
    });

    // Create array of daily groups sorted descending (newest date first)
    const dates = Object.keys(groups).sort().reverse();
    
    // Calculate opening/closing for each day
    let currentBalance = runningBalance;
    
    return dates.map(date => {
      const dayEntries = groups[date];
      
      // Sort within day DESCENDING (Newest -> Oldest) as requested
      dayEntries.sort((a, b) => {
        // Investment Capital is conceptually the "start" (oldest), so it goes to the bottom
        if (a.partyName === 'Investment Capital') return 1; 
        if (b.partyName === 'Investment Capital') return -1;
        
        const aTime = getTimelineTime(a);
        const bTime = getTimelineTime(b);
        return bTime - aTime; // DESCENDING
      });

      const dayIncome = dayEntries
        .filter(e => e.type === 'credit')
        .reduce((sum, e) => sum + e.amount, 0);
        
      const dayExpense = dayEntries
        .filter(e => e.type === 'debit')
        .reduce((sum, e) => sum + e.amount, 0);
      
      const netChange = dayIncome - dayExpense;
      const closingBalance = currentBalance;
      const openingBalance = currentBalance - netChange;
      
      // Update current balance for next iteration (previous day)
      currentBalance = openingBalance;

      return {
        date,
        entries: dayEntries,
        openingBalance,
        closingBalance,
        totalIncome: dayIncome,
        totalExpense: dayExpense
      } as DailyGroup;
    });
  }, [entries, investment, investmentHistory, invoices, orders]);

  const renderTransactionRow = (entry: LedgerEntry) => {
    const isIncome = entry.type === 'credit';
    const amount = formatIndianCurrency(entry.amount);
    const party = isIncome ? entry.partyName : entry.supplier;
    const note = entry.note;
    const isInvestment = entry.partyName === 'Investment Capital';
    
    let title = '';
    let subTitle = note || '';
    let iconColor = '';
    let amountColor = '';
    let icon = null;

    if (isInvestment) {
      title = 'Investment Capital';
      subTitle = note || (isIncome ? 'Capital Added' : 'Capital Reduced');
      iconColor = 'bg-amber-100 text-amber-600';
      amountColor = isIncome ? 'text-green-700' : 'text-red-700';
      icon = <Wallet size={18} />;
    } else if (isIncome) {
      title = party || 'Income';
      iconColor = 'bg-green-100 text-green-600';
      amountColor = 'text-green-700';
      icon = <ArrowDownRight size={18} />;
    } else {
      title = party || 'Expense';
      iconColor = 'bg-red-100 text-red-600';
      amountColor = 'text-red-700';
      icon = <ArrowUpRight size={18} />;
    }

    return (
      <div key={entry.id} className="px-3 py-2 flex items-center gap-2 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconColor} bg-opacity-20`}>
          {React.cloneElement(icon as any, { size: 14 })}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
             <div className="text-xs font-bold text-gray-900 truncate">{title}</div>
             <div className={`text-xs font-bold whitespace-nowrap ${amountColor}`}>
                {isIncome ? '+' : '-'}{amount}
             </div>
          </div>
          {subTitle && (
            <div className="text-[10px] text-gray-500 truncate leading-tight">{subTitle}</div>
          )}
        </div>
      </div>
    );
  };

  if (dailyGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Wallet size={48} className="mb-3 opacity-20" />
        <p>No transactions found</p>
      </div>
    );
  }

  return (
    <div className="pb-24 bg-gray-50 min-h-full">
      {dailyGroups.map((group) => (
        <div key={group.date} className="mb-4">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 py-1.5 flex justify-between items-baseline border-b border-gray-100/50 shadow-sm">
            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              {format(new Date(group.date), 'EEE, dd MMM')}
            </h3>
            <span className={`text-xs font-bold ${group.closingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
               {formatIndianCurrency(group.closingBalance)}
            </span>
          </div>

          {/* Card Content */}
          <div className="mx-3 mt-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Closing Balance Row */}
            <div className="px-3 py-1.5 bg-gray-50/50 border-b border-gray-100 flex justify-between items-center">
               <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Closing</span>
               <span className={`text-xs font-bold font-mono ${group.closingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                 {formatIndianCurrency(group.closingBalance)}
               </span>
            </div>

            {/* Transactions List */}
            <div className="divide-y divide-gray-50">
              {group.entries.map(renderTransactionRow)}
            </div>
            
            {/* Opening Balance Row */}
            <div className="px-3 py-1.5 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Opening</span>
              <span className="text-xs text-gray-600 font-semibold font-mono">
                {formatIndianCurrency(group.openingBalance)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
