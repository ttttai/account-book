import { dayOfWeek, daysInMonth, formatDate } from "./calendar-date";

// 祝日を判定する年の範囲。春分・秋分の計算式が有効な範囲に合わせる (AC-CAL-018-1)
const FIRST_SUPPORTED_YEAR = 2000;
const LAST_SUPPORTED_YEAR = 2099;

type MonthDay = readonly [month: number, day: number];

// 指定月の第n月曜日の日を返す（ハッピーマンデー）
function nthMonday(year: number, month: number, nth: number): number {
  const firstMonday = ((8 - dayOfWeek(year, month, 1)) % 7) + 1;
  return firstMonday + (nth - 1) * 7;
}

// 春分・秋分の近似式 floor(base + 0.242194 × (年 − 1980)) − floor((年 − 1980) / 4) を、
// 係数を10^6倍した整数演算で求める（浮動小数点を使わない）
function equinoxDay(year: number, baseMicro: number): number {
  const elapsed = year - 1980;
  return (
    Math.floor((baseMicro + 242194 * elapsed) / 1_000_000) -
    Math.floor(elapsed / 4)
  );
}

// 法改正と特例を反映し、その年の「国民の祝日」（振替休日・国民の休日を除く）を列挙する
function listNationalHolidays(year: number): ReadonlyArray<[MonthDay, string]> {
  const holidays: Array<[MonthDay, string]> = [
    [[1, 1], "元日"],
    [[1, nthMonday(year, 1, 2)], "成人の日"],
    [[2, 11], "建国記念の日"],
    [[3, equinoxDay(year, 20_843_100)], "春分の日"],
    [[4, 29], year >= 2007 ? "昭和の日" : "みどりの日"],
    [[5, 3], "憲法記念日"],
    [[5, 5], "こどもの日"],
    [[9, equinoxDay(year, 23_248_800)], "秋分の日"],
    [[11, 3], "文化の日"],
    [[11, 23], "勤労感謝の日"],
  ];

  if (year >= 2020) holidays.push([[2, 23], "天皇誕生日"]);
  else if (year <= 2018) holidays.push([[12, 23], "天皇誕生日"]);
  if (year >= 2007) holidays.push([[5, 4], "みどりの日"]);

  // 2020年・2021年は東京オリンピック・パラリンピックに合わせた特例で移動した
  if (year === 2020) {
    holidays.push(
      [[7, 23], "海の日"],
      [[7, 24], "スポーツの日"],
      [[8, 10], "山の日"],
    );
  } else if (year === 2021) {
    holidays.push(
      [[7, 22], "海の日"],
      [[7, 23], "スポーツの日"],
      [[8, 8], "山の日"],
    );
  } else {
    holidays.push([[7, year >= 2003 ? nthMonday(year, 7, 3) : 20], "海の日"]);
    if (year >= 2016) holidays.push([[8, 11], "山の日"]);
    holidays.push([
      [10, nthMonday(year, 10, 2)],
      year >= 2020 ? "スポーツの日" : "体育の日",
    ]);
  }
  holidays.push([[9, year >= 2003 ? nthMonday(year, 9, 3) : 15], "敬老の日"]);

  if (year === 2019) {
    holidays.push(
      [[5, 1], "天皇の即位の日"],
      [[10, 22], "即位礼正殿の儀の行われる日"],
    );
  }
  return holidays;
}

// 年内の日付を1月1日からの通し番号へ変換する
function dayOfYear(year: number, month: number, day: number): number {
  let total = day;
  for (let current = 1; current < month; current += 1) {
    total += daysInMonth(year, current);
  }
  return total;
}

// 通し番号から月日を求める
function monthDayOf(year: number, ordinal: number): MonthDay {
  let remaining = ordinal;
  let month = 1;
  while (remaining > daysInMonth(year, month)) {
    remaining -= daysInMonth(year, month);
    month += 1;
  }
  return [month, remaining];
}

// 指定年の祝日・振替休日・国民の休日をYYYY-MM-DDから名称へのmapで返す。対象外の年は空 (CAL-018)
export function getJapaneseHolidays(year: number): ReadonlyMap<string, string> {
  if (year < FIRST_SUPPORTED_YEAR || year > LAST_SUPPORTED_YEAR) {
    return new Map();
  }

  const daysInYear = dayOfYear(year, 12, 31);
  const names = new Map<number, string>();
  for (const [[month, day], name] of listNationalHolidays(year)) {
    names.set(dayOfYear(year, month, day), name);
  }
  const isSunday = (ordinal: number) => {
    const [month, day] = monthDayOf(year, ordinal);
    return dayOfWeek(year, month, day) === 0;
  };

  // 振替休日: 日曜の祝日の後の最も近い祝日でない日。2006年以前は翌日（月曜）だけ
  const substitutes: number[] = [];
  for (const ordinal of names.keys()) {
    if (!isSunday(ordinal)) continue;
    let candidate = ordinal + 1;
    if (year >= 2007) {
      while (names.has(candidate)) candidate += 1;
    }
    if (!names.has(candidate) && candidate <= daysInYear) {
      substitutes.push(candidate);
    }
  }
  for (const ordinal of substitutes) names.set(ordinal, "振替休日");

  // 国民の休日: 前日と翌日がともに国民の祝日である、日曜以外の祝日でない日
  const nationalHolidays = new Set(
    listNationalHolidays(year).map(([[month, day]]) =>
      dayOfYear(year, month, day),
    ),
  );
  for (let ordinal = 2; ordinal < daysInYear; ordinal += 1) {
    if (
      !names.has(ordinal) &&
      !isSunday(ordinal) &&
      nationalHolidays.has(ordinal - 1) &&
      nationalHolidays.has(ordinal + 1)
    ) {
      names.set(ordinal, "国民の休日");
    }
  }

  return new Map(
    [...names.entries()]
      .sort(([left], [right]) => left - right)
      .map(([ordinal, name]) => {
        const [month, day] = monthDayOf(year, ordinal);
        return [formatDate(year, month, day), name] as const;
      }),
  );
}
