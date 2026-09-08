import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, vi } from "vitest";
import { ClarificationPicker } from "./ClarificationPicker";

describe("ClarificationPicker", () => {
  it("lets the user pick a location candidate", () => {
    const onChooseLocation = vi.fn();
    render(
      <ClarificationPicker
        clarification={{
          type: "which_location",
          candidates: [
            { locationId: "k", pathLabel: "Kitchen", quantity: 4 },
            { locationId: "b", pathLabel: "Basement", quantity: 8 },
          ],
        }}
        onChooseLocation={onChooseLocation}
        onChooseItem={vi.fn()}
      />,
    );
    expect(screen.getByText("Kitchen (4)")).toBeTruthy();
    expect(screen.getByText("Basement (8)")).toBeTruthy();
    fireEvent.press(screen.getByText("Kitchen (4)"));
    expect(onChooseLocation).toHaveBeenCalledWith("k");
  });

  it("does not fire callbacks while disabled", () => {
    const onChooseLocation = vi.fn();
    render(
      <ClarificationPicker
        clarification={{
          type: "which_location",
          candidates: [{ locationId: "k", pathLabel: "Kitchen", quantity: 4 }],
        }}
        disabled
        onChooseLocation={onChooseLocation}
        onChooseItem={vi.fn()}
      />,
    );
    fireEvent.press(screen.getByText("Kitchen (4)"));
    expect(onChooseLocation).not.toHaveBeenCalled();
  });
});
