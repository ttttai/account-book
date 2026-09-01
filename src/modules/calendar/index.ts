export type { CalendarScope, CalendarSelection } from "./domain/calendar-input";
// 月間集計の定義を他機能（分析・レポート）が同じ規則で検証できるよう公開する (AC-ANA-002-1)
export {
  calculateCalendarIncomeSummary,
  calculateCalendarSummary,
  type CalendarExpense,
  type CalendarIncome,
} from "./domain/calendar-summary";
