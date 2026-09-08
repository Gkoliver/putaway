// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MergeForm } from "./merge-form";

describe("MergeForm", () => {
  it("shows preview then confirms", async () => {
    const preview = vi.fn().mockResolvedValue({
      ok: true,
      lots: [{ itemName: "Tape", sourceQty: 1, targetQty: 2, mergedQty: 3 }],
    });
    const apply = vi.fn().mockResolvedValue({ ok: true });
    render(
      <MergeForm
        householdId="h1"
        locations={[
          { id: "s", pathLabel: "Downstairs" },
          { id: "t", pathLabel: "Basement" },
        ]}
        previewMerge={preview}
        applyMerge={apply}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Source"), "s");
    await userEvent.selectOptions(screen.getByLabelText("Target"), "t");
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/Tape/)).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    expect(apply).toHaveBeenCalledWith({
      householdId: "h1",
      sourceLocationId: "s",
      targetLocationId: "t",
    });
  });
});
