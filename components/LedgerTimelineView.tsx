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

  const renderTransactionNarrative = (entry: LedgerEntry) => {
    const isIncome = entry.type === 'credit';
    const amount = formatIndianCurrency(entry.amount);
    const party = isIncome ? entry.partyName : entry.supplier;
    const note = entry.note ? `(${entry.note})` : '';
    const isInvestment = entry.id === 'investment-capital';
    
    if (isInvestment) {
      return (
        <span className="text-sm text-gray-700">
          <span className="font-bold text-amber-600">Investment Capital</span> added
          <span className="font-bold text-green-700 ml-1">{amount}</span>
          {note && <span className="text-gray-500 text-xs ml-1">{note}</span>}
        </span>
      );
    }
    
    if (isIncome) {
      return (
        <span className="text-sm text-gray-700">
          Received <span className="font-bold text-green-700">{amount}</span>
          {party && <span> from <span className="font-medium">{party}</span></span>}
          {note && <span className="text-gray-500 text-xs ml-1">{note}</span>}
        </span>
      );
    } else {
      return (
        <span className="text-sm text-gray-700">
          Spent <span className="font-bold text-red-700">{amount}</span>
          {party && <span> for <span className="font-medium">{party}</span></span>}
          {note && <span className="text-gray-500 text-xs ml-1">{note}</span>}
        </span>
      );
    }
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
    <div className="space-y-6 p-3 pb-24">
      {dailyGroups.map((group) => (
        <div key={group.date} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Daily Header */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-gray-900">
                {format(new Date(group.date), 'dd MMM yyyy')}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Opening: {formatIndianCurrency(group.openingBalance)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-0.5">Closing Balance</div>
              <span className={`font-bold ${group.closingBalance >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
                {formatIndianCurrency(group.closingBalance)}
              </span>
            </div>
          </div>

          {/* Transactions List */}
          <div className="divide-y divide-gray-100">
            {group.entries.map((entry) => (
              <div key={entry.id} className="p-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                <div className={`p-1.5 rounded-full mt-0.5 flex-shrink-0 ${
                  entry.type === 'credit' 
                    ? 'bg-green-100 text-green-600' 
                    : 'bg-red-100 text-red-600'
                }`}>
                  {entry.type === 'credit' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  {renderTransactionNarrative(entry)}
                </div>
              </div>
            ))}
          </div>

          {/* Daily Summary Footer */}
          <div className="bg-gray-50/50 px-4 py-2 border-t border-gray-100 flex gap-4 text-xs">
            {group.totalIncome > 0 && (
              <div className="flex items-center gap-1 text-green-700 font-medium">
                <ArrowDownRight size={12} />
                +{formatIndianCurrency(group.totalIncome)}
              </div>
            )}
            {group.totalExpense > 0 && (
              <div className="flex items-center gap-1 text-red-700 font-medium">
                <ArrowUpRight size={12} />
                -{formatIndianCurrency(group.totalExpense)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

