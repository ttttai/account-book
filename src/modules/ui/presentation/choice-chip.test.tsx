import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChoiceChip, ChoiceChipList } from "./choice-chip";

afterEach(() => cleanup());

describe("ChoiceChip", () => {
  it("radioのsemanticsを維持し、名称だけをアクセシブル名にする (AC-GRP-001-6)", () => {
    render(
      <ChoiceChipList>
        <ChoiceChip defaultChecked name="weekStartsOn" type="radio" value="0">
          日曜日
        </ChoiceChip>
        <ChoiceChip name="weekStartsOn" type="radio" value="1">
          月曜日
        </ChoiceChip>
      </ChoiceChipList>,
    );

    const sunday = screen.getByRole<HTMLInputElement>("radio", {
      name: "日曜日",
    });
    const monday = screen.getByRole<HTMLInputElement>("radio", {
      name: "月曜日",
    });
    expect(sunday.checked).toBe(true);
    expect(monday.checked).toBe(false);
    expect(sunday.name).toBe("weekStartsOn");
    expect(sunday.value).toBe("0");
    // 選択記号はaria-hiddenで名称の一部にしない
    const mark = sunday.closest("label")?.querySelector(".choice-chip-mark");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("radio", { name: /✓/ })).toBeNull();

    fireEvent.click(monday);
    expect(monday.checked).toBe(true);
    expect(sunday.checked).toBe(false);
  });

  it("checkboxでは複数選択でき、controlledのcheckedとonChangeをそのままinputへ渡す (AC-TXN-001-11)", () => {
    const onChange = vi.fn();
    render(
      <ChoiceChipList>
        <ChoiceChip
          checked
          name="selectedMemberIds"
          onChange={onChange}
          type="checkbox"
          value="m1"
        >
          山田（自分）
        </ChoiceChip>
        <ChoiceChip
          checked={false}
          name="selectedMemberIds"
          onChange={onChange}
          type="checkbox"
          value="m2"
        >
          佐藤
        </ChoiceChip>
      </ChoiceChipList>,
    );

    const self = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "山田（自分）",
    });
    const other = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "佐藤",
    });
    expect(self.checked).toBe(true);
    expect(other.checked).toBe(false);
    expect(self.type).toBe("checkbox");

    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledTimes(1);
    // controlledなので親が状態を更新するまで表示は変わらない
    expect(other.checked).toBe(false);
  });

  it("label全体をchipにし、inputをhidden属性で隠さない", () => {
    render(
      <ChoiceChip name="x" type="radio" value="a">
        A
      </ChoiceChip>,
    );
    const input = screen.getByRole("radio", { name: "A" });
    const label = input.closest("label");
    expect(label?.classList.contains("choice-chip")).toBe(true);
    expect(input.classList.contains("choice-chip-input")).toBe(true);
    expect(label?.querySelector(".choice-chip-content")).not.toBeNull();
    expect(input.hidden).toBe(false);
  });
});
