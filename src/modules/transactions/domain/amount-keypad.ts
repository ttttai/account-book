/** 画面内テンキーが持つ数字キー。数字に加えて00を備える (TXN-014) */
export const AMOUNT_KEYPAD_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "00",
  "0",
] as const;

export type AmountKeypadKey = (typeof AMOUNT_KEYPAD_KEYS)[number];

/** 電卓の演算子キー。上から÷、×、−、+の順に並べる (TXN-017) */
export const AMOUNT_OPERATORS = ["÷", "×", "−", "+"] as const;

export type AmountOperator = (typeof AMOUNT_OPERATORS)[number];

/** 式を「左辺 演算子 右辺」へ分解した結果。演算子は1つまでとする (AC-TXN-017-1) */
export type AmountExpression = Readonly<{
  left: string;
  operator: AmountOperator | null;
  right: string;
}>;

/** 式の計算結果。計算できない理由は画面表示の文言へ対応づける (AC-TXN-017-4) */
export type AmountEvaluation =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; reason: AmountEvaluationFailure }>;

export type AmountEvaluationFailure =
  "negative" | "divide-by-zero" | "overflow";

// tsconfigのtargetがES2020未満のためBigIntリテラルは使わず、関数呼び出しで定数を作る
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

// 物理キーボードから入る記号を画面の演算子へ寄せる (AC-TXN-017-1)
const OPERATOR_ALIASES: Readonly<Record<string, AmountOperator>> = {
  "+": "+",
  "-": "−",
  "−": "−",
  "*": "×",
  "×": "×",
  "/": "÷",
  "÷": "÷",
};

function isOperator(value: string): value is AmountOperator {
  return (AMOUNT_OPERATORS as readonly string[]).includes(value);
}

// 1つの数値へ1桁追加する。先頭0と安全な整数を超える桁は追加しない (AC-TXN-014-4)
function appendDigitToOperand(current: string, digit: string): string {
  if (current === "" && /^0+$/.test(digit)) return current;
  const next = `${current}${digit}`;
  if (!/^\d+$/.test(next)) return current;
  return Number.isSafeInteger(Number(next)) ? next : current;
}

// 式文字列を左辺・演算子・右辺へ分解する。演算子が無ければ全体を左辺とする
export function parseAmountExpression(current: string): AmountExpression {
  const index = [...current].findIndex(isOperator);
  if (index < 0) return { left: current, operator: null, right: "" };
  const characters = [...current];
  return {
    left: characters.slice(0, index).join(""),
    operator: characters[index] as AmountOperator,
    right: characters.slice(index + 1).join(""),
  };
}

// テンキーで1桁追加した結果を返す。式なら右辺へ追加し、先頭0と上限の規則を右辺にも適用する (AC-TXN-014-4, AC-REC-005-1, AC-TXN-017-5)
export function appendAmountDigit(current: string, digit: string): string {
  const { left, operator, right } = parseAmountExpression(current);
  if (!operator) return appendDigitToOperand(left, digit);
  return `${left}${operator}${appendDigitToOperand(right, digit)}`;
}

// テンキーの1文字削除。末尾の数字または演算子を1文字だけ取り消す
export function removeLastAmountDigit(current: string): string {
  return current.slice(0, -1);
}

// 式を整数のJPYとして計算する。浮動小数点を使わず、÷の端数は四捨五入する (AC-TXN-017-3, AC-TXN-017-4)
export function evaluateAmountExpression(current: string): AmountEvaluation {
  const { left, operator, right } = parseAmountExpression(current);
  if (!/^\d*$/.test(left) || !/^\d*$/.test(right)) {
    return { ok: true, value: "" };
  }
  if (!operator || right === "") return { ok: true, value: left };

  const a = BigInt(left);
  const b = BigInt(right);
  let result: bigint;
  switch (operator) {
    case "+":
      result = a + b;
      break;
    case "−":
      result = a - b;
      break;
    case "×":
      result = a * b;
      break;
    case "÷": {
      // 右辺には0を単独で入力できないため通常は到達しないが、外部入力に備えて拒否する
      if (b === ZERO) return { ok: false, reason: "divide-by-zero" };
      // 余りの2倍が除数以上なら切り上げる（正の整数の四捨五入）
      result = a / b + ((a % b) * TWO >= b ? ONE : ZERO);
      break;
    }
  }
  if (result < ZERO) return { ok: false, reason: "negative" };
  if (result > MAX_SAFE_AMOUNT) return { ok: false, reason: "overflow" };
  // 0円は空欄と同じ扱いにし、先頭0の規則と揃える
  return { ok: true, value: result === ZERO ? "" : result.toString() };
}

// 演算子キーを押した結果を返す。空欄では無視し、右辺が空なら演算子を置き換え、右辺があれば計算して左辺にする (AC-TXN-017-1)
export function appendAmountOperator(
  current: string,
  next: AmountOperator,
): string {
  const { left, operator, right } = parseAmountExpression(current);
  if (left === "") return current;
  if (!operator || right === "") return `${left}${next}`;
  const evaluation = evaluateAmountExpression(current);
  if (!evaluation.ok) return current;
  return evaluation.value === "" ? "" : `${evaluation.value}${next}`;
}

// =キー。計算できる式は結果だけの表示へ戻し、計算できない式は変えない (AC-TXN-017-2, AC-TXN-017-4)
export function completeAmountExpression(current: string): string {
  const evaluation = evaluateAmountExpression(current);
  return evaluation.ok ? evaluation.value : current;
}

// 数字列を3桁区切りにする。locale実装に依存しない決定的な整形で、server renderとhydrationで同じ文字列になる
function groupDigits(operand: string): string {
  return operand.replace(/\B(?=(\d{3})+$)/g, ",");
}

/** 金額欄の表示用に式の左辺・右辺をそれぞれ3桁区切りにする。式の状態と送信値は区切りなしのまま保つ (AC-TXN-014-10) */
export function formatAmountExpression(current: string): string {
  const { left, operator, right } = parseAmountExpression(current);
  if (!operator) return groupDigits(left);
  return `${groupDigits(left)}${operator}${groupDigits(right)}`;
}

/** 桁区切り表示の`,`だけを除き、金額欄の状態へ戻す。電卓を持たない固定費・予算の金額欄が物理キーボードの入力を受けるときに使い、演算子の正規化は行わない (AC-REC-005-5, AC-BUD-010-5) */
export function stripAmountGrouping(raw: string): string {
  return raw.replace(/,/g, "");
}

// 物理キーボードや貼り付けで入った文字列を、テンキーと同じ規則で1文字ずつ適用して式へ正規化する。
// 桁区切り表示の`,`は数字でも演算子でもないため捨てられる (AC-TXN-017-1, AC-TXN-014-2, AC-TXN-014-10)
export function normalizeAmountInput(raw: string): string {
  let result = "";
  for (const character of raw) {
    if (/^\d$/.test(character)) {
      result = appendAmountDigit(result, character);
      continue;
    }
    const operator = OPERATOR_ALIASES[character];
    if (operator) result = appendAmountOperator(result, operator);
  }
  return result;
}
