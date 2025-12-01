import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { LedgerEntry } from '@/lib/ledgerService';
import { formatIndianCurrency } from '@/lib/currencyUtils';
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';
import { InvestmentRecord } from '@/lib/investmentService';

interface LedgerTimelineViewProps {
  entries: LedgerEntry[];
  investment: InvestmentRecord | null;
}

interface DailyGroup {
  date: string;
  entries: LedgerEntry[];
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
}

export default function LedgerTimelineView({ entries, investment }: LedgerTimelineViewProps) {
  // Group entries by date and calculate daily stats
  const dailyGroups = useMemo(() => {
    // Create a copy of entries to sort
    const sortedEntries: LedgerEntry[] = [...entries];
    
    // If investment exists, add it as a synthetic entry
    if (investment) {
      // Ensure investment date is properly formatted
      let investmentDate = investment.date;
      if (!investmentDate.includes('T')) {
        investmentDate = investmentDate + 'T00:00:00.000Z';
      }
      
      // Only add if it doesn't duplicate an existing entry (basic check)
      // Though investment is usually separate from ledger entries
      sortedEntries.push({
        id: 'investment-capital',
        type: 'credit',
        amount: investment.amount,
        date: investmentDate,
        note: investment.note || 'Initial Capital Investment',
        source: 'manual',
        // Use a special marker or party name to identify it
        partyName: 'Investment Capital'
      });
    }

    // Sort entries by date ascending first to calculate running balance correctly
    sortedEntries.sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return aTime - bTime;
    });

    const groups: Record<string, LedgerEntry[]> = {};
    let runningBalance = 0;
    
    // First pass: calculate running balances and group
    const entriesWithBalance = sortedEntries.map(entry => {
      const amount = entry.type === 'credit' ? entry.amount : -entry.amount;
      runningBalance += amount;
      
      const dateKey = format(new Date(entry.date), 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(entry);
      
      return { ...entry, balanceAfter: runningBalance };
    });

    // Create array of daily groups sorted descending (newest date first)
    const dates = Object.keys(groups).sort().reverse();
    
    // Calculate opening/closing for each day
    let currentBalance = runningBalance; // Start with final balance
    
    return dates.map(date => {
      const dayEntries = groups[date];
      // Sort entries within day by creation time descending (newest first)
      // For investment, treat it as oldest in the day if multiple entries exist
      dayEntries.sort((a, b) => {
        if (a.id === 'investment-capital') return 1; // Move to bottom (oldest)
        if (b.id === 'investment-capital') return -1;
        
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
        return bTime - aTime;
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
  }, [entries, investment]);

  const renderTransactionRow = (entry: LedgerEntry) => {
    const isIncome = entry.type === 'credit';
    const amount = formatIndianCurrency(entry.amount);
    const party = isIncome ? entry.partyName : entry.supplier;
    const note = entry.note;
    const isInvestment = entry.id === 'investment-capital';
    
    let title = '';
    let subTitle = note || '';
    let iconColor = '';
    let amountColor = '';
    let icon = null;

    if (isInvestment) {
      title = 'Investment Capital';
      subTitle = note || 'Initial Capital';
      iconColor = 'bg-amber-100 text-amber-600';
      amountColor = 'text-green-700';
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
      <div key={entry.id} className="px-4 py-3 flex items-center gap-3 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
          {subTitle && (
            <div className="text-xs text-gray-500 truncate">{subTitle}</div>
          )}
        </div>
        <div className={`text-sm font-bold whitespace-nowrap ${amountColor}`}>
          {isIncome || isInvestment ? '+' : '-'}{amount}
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
        <div key={group.date} className="mb-6">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 py-2 flex justify-between items-baseline border-b border-gray-100/50">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {format(new Date(group.date), 'dd MMM yyyy')}
            </h3>
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-medium text-gray-400">End Balance</span>
              <span className={`text-sm font-bold ${group.closingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatIndianCurrency(group.closingBalance)}
              </span>
            </div>
          </div>

          {/* Card Content */}
          <div className="mx-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Opening Balance Row */}
            <div className="px-4 py-2 bg-gray-50/30 border-b border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400 font-medium">Opening Balance</span>
              <span className="text-xs text-gray-500 font-semibold">
                {formatIndianCurrency(group.openingBalance)}
              </span>
            </div>

            {/* Transactions List */}
            <div className="divide-y divide-gray-50">
              {group.entries.map(renderTransactionRow)}
            </div>
            
            {/* Closing Balance Row (Visual cue for end of day) */}
            <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
               <span className="text-xs text-gray-500 font-medium">End of Day</span>
               <span className={`text-xs font-bold ${group.closingBalance >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                 {formatIndianCurrency(group.closingBalance)}
               </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

