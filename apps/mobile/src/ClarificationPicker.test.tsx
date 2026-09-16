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

  it("shows a confirm checklist for a multi-item put-away", () => {
    const onConfirmBatch = vi.fn();
    render(
      <ClarificationPicker
        clarification={{
          type: "confirm_batch",
          locationPath: ["basement", "shelves"],
          pathLabel: "Basement → Shelves",
          items: [
            { itemText: "dishwasher detergent", quantity: 1 },
            { itemText: "dawn", quantity: 2 },
          ],
        }}
        onChooseLocation={vi.fn()}
        onChooseItem={vi.fn()}
        onConfirmBatch={onConfirmBatch}
      />,
    );
    expect(screen.getByText("Basement → Shelves")).toBeTruthy();
    expect(screen.getByDisplayValue("dishwasher detergent")).toBeTruthy();
    expect(screen.getByDisplayValue("dawn")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Confirm list"));
    expect(onConfirmBatch).toHaveBeenCalledWith([
      { itemText: "dishwasher detergent", quantity: 1 },
      { itemText: "dawn", quantity: 2 },
    ]);
  });

  it("lets the user edit batch names and quantities before confirm", () => {
    const onConfirmBatch = vi.fn();
    render(
      <ClarificationPicker
        clarification={{
          type: "confirm_batch",
          locationPath: ["garage"],
          pathLabel: "Garage",
          items: [
            { itemText: "laundry detergent", quantity: 1 },
            { itemText: "cat food", quantity: 3 },
          ],
        }}
        onChooseLocation={vi.fn()}
        onChooseItem={vi.fn()}
        onConfirmBatch={onConfirmBatch}
      />,
    );
    fireEvent.changeText(screen.getByLabelText("item name 1"), "laundry detergent");
    fireEvent.changeText(screen.getByLabelText("item name 1"), "pandry detergent");
    fireEvent.changeText(screen.getByLabelText("quantity 2"), "2");
    fireEvent.press(screen.getByLabelText("Confirm list"));
    expect(onConfirmBatch).toHaveBeenCalledWith([
      { itemText: "pandry detergent", quantity: 1 },
      { itemText: "cat food", quantity: 2 },
    ]);
  });
});
