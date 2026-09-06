export type MonthlyTransactionCategory = Readonly<{
  id: string;
  name: string;
  color: string;
  icon: string;
}>;

export type MonthlyAllocation = Readonly<{
  memberId: string;
  amountMinor: number;
}>;

/** 月次の表示・集計へ渡す支出。固定費の展開結果は`isRecurring`で識別する (REC-005、REC-009) */
export type MonthlyExpense = Readonly<{
  /** 展開結果は実在する取引と混同しないよう合成IDを持つ */
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  amountMinor: number;
  memo?: string | null;
  payerMemberId: string;
  /** 展開結果は登録日時を持たないため、単発取引より後ろへ並ぶ固定値を持つ */
  createdAt: string;
  category: MonthlyTransactionCategory;
  allocations: readonly MonthlyAllocation[];
  isRecurring: boolean;
  recurringName?: string;
}>;

export type MonthlyIncome = Readonly<{
  id: string;
  date: string;
  amountMinor: number;
  memo?: string | null;
  recipientMemberId: string;
  createdAt: string;
  category: MonthlyTransactionCategory;
  isRecurring: boolean;
  recurringName?: string;
}>;

export type MonthlyTransactions = Readonly<{
  expenses: readonly MonthlyExpense[];
  incomes: readonly MonthlyIncome[];
}>;
