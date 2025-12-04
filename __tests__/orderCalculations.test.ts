import { getAdjustedProfit, hasProfitAdjustments } from '@/lib/orderCalculations';
import { Order } from '@/types/order';

describe('Order Calculations', () => {
  it('correctly calculates adjusted profit with expense adjustment', () => {
    const order: Order = {
      id: '1',
      date: '2023-01-01',
      partyName: 'Test Customer',
      siteName: 'Site A',
      material: 'Material A',
      weight: 10,
      rate: 50,
      total: 500,
      truckOwner: 'Truck Owner X',
      truckNo: 'ABC-123',
      supplier: 'Supplier X',
      originalWeight: 10,
      originalRate: 40,
      originalTotal: 400,
      additionalCost: 0,
      profit: 100, // Initial profit (500 - 400 - 0)
      partialPayments: [],
      customerPayments: [],
      expenseAdjustment: -20, // expenseAdjustment is a deduction from profit
      revenueAdjustment: 0,
      adjustmentAmount: 0,
    };
    expect(getAdjustedProfit(order)).toBe(80); // 100 - 20
  });

  it('correctly calculates adjusted profit with revenue adjustment', () => {
    const order: Order = {
      id: '2',
      date: '2023-01-02',
      partyName: 'Test Customer 2',
      siteName: 'Site B',
      material: 'Material B',
      weight: 5,
      rate: 120,
      total: 600,
      truckOwner: 'Truck Owner Y',
      truckNo: 'DEF-456',
      supplier: 'Supplier Y',
      originalWeight: 5,
      originalRate: 100,
      originalTotal: 500,
      additionalCost: 0,
      profit: 100, // Initial profit (600 - 500 - 0)
      partialPayments: [],
      customerPayments: [],
      expenseAdjustment: 0,
      revenueAdjustment: 30, // revenueAdjustment is an addition to profit
      adjustmentAmount: 0,
    };
    expect(getAdjustedProfit(order)).toBe(130); // 100 + 30
  });

  it('correctly calculates adjusted profit with manual adjustment', () => {
    const order: Order = {
      id: '3',
      date: '2023-01-03',
      partyName: 'Test Customer 3',
      siteName: 'Site C',
      material: 'Material C',
      weight: 10,
      rate: 70,
      total: 700,
      truckOwner: 'Truck Owner A',
      truckNo: 'GHI-789',
      supplier: 'Supplier A',
      originalWeight: 10,
      originalRate: 50,
      originalTotal: 500,
      additionalCost: 0,
      profit: 200, // Initial profit (700 - 500 - 0)
      partialPayments: [],
      customerPayments: [],
      expenseAdjustment: 0,
      revenueAdjustment: 0,
      adjustmentAmount: 50, // adjustmentAmount is an addition to profit
    };
    expect(getAdjustedProfit(order)).toBe(250); // 200 + 50
  });

  it('returns original profit if no adjustments', () => {
    const order: Order = {
      id: '4',
      date: '2023-01-04',
      partyName: 'Test Customer 4',
      siteName: 'Site D',
      material: 'Material D',
      weight: 10,
      rate: 70,
      total: 700,
      truckOwner: 'Truck Owner B',
      truckNo: 'JKL-012',
      supplier: 'Supplier B',
      originalWeight: 10,
      originalRate: 50,
      originalTotal: 500,
      additionalCost: 0,
      profit: 200,
      partialPayments: [],
      customerPayments: [],
      expenseAdjustment: 0,
      revenueAdjustment: 0,
      adjustmentAmount: 0,
    };
    expect(getAdjustedProfit(order)).toBe(200);
  });

  it('correctly identifies hasProfitAdjustments', () => {
    const orderWithAdjustment: Order = {
      id: '5',
      date: '2023-01-05',
      partyName: 'Test Customer 5',
      siteName: 'Site E',
      material: 'Material E',
      weight: 10,
      rate: 70,
      total: 700,
      truckOwner: 'Truck Owner C',
      truckNo: 'MNO-345',
      supplier: 'Supplier C',
      originalWeight: 10,
      originalRate: 50,
      originalTotal: 500,
      additionalCost: 0,
      profit: 200,
      partialPayments: [],
      customerPayments: [],
      expenseAdjustment: 10,
      revenueAdjustment: 0,
      adjustmentAmount: 0,
    };
    expect(hasProfitAdjustments(orderWithAdjustment)).toBe(true);

    const orderWithoutAdjustment: Order = {
      id: '6',
      date: '2023-01-06',
      partyName: 'Test Customer 6',
      siteName: 'Site F',
      material: 'Material F',
      weight: 10,
      rate: 70,
      total: 700,
      truckOwner: 'Truck Owner D',
      truckNo: 'PQR-678',
      supplier: 'Supplier D',
      originalWeight: 10,
      originalRate: 50,
      originalTotal: 500,
      additionalCost: 0,
      profit: 200,
      partialPayments: [],
      customerPayments: [],
      expenseAdjustment: 0,
      revenueAdjustment: 0,
      adjustmentAmount: 0,
    };
    expect(hasProfitAdjustments(orderWithoutAdjustment)).toBe(false);
  });
});
