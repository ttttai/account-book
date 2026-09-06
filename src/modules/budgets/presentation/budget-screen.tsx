import type { BudgetViewReady } from "../application/budget-types";
import { BudgetEditor } from "./budget-editor";
import { BudgetOverview } from "./budget-overview";

import styles from "./budgets.module.css";

// 予算画面の組み立て。閲覧部分はServer Component、フォームだけをClient Componentへ限定する
export function BudgetScreen({ view }: Readonly<{ view: BudgetViewReady }>) {
  return (
    <div className={styles["budget-layout"]}>
      <BudgetOverview view={view} />
      <BudgetEditor view={view} />
    </div>
  );
}
