// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationTree } from "./location-tree";

describe("LocationTree", () => {
  it("nests children under their parent instead of a flat list", () => {
    render(
      <LocationTree
        nodes={[
          { id: "b", parentId: null, name: "Basement", pathLabel: "Basement" },
          { id: "s", parentId: "b", name: "Shelf A", pathLabel: "Basement → Shelf A" },
          { id: "g", parentId: null, name: "Garage", pathLabel: "Garage" },
        ]}
        renderNode={(node) => <span>{node.pathLabel}</span>}
      />,
    );

    const basementItem = screen.getByText("Basement").closest("li");
    const garageItem = screen.getByText("Garage").closest("li");
    const shelf = screen.getByText("Basement → Shelf A");

    expect(basementItem).toBeTruthy();
    expect(garageItem).toBeTruthy();
    expect(basementItem?.contains(shelf)).toBe(true);
    expect(garageItem?.contains(shelf)).toBe(false);
    expect(basementItem?.querySelector("ul")).toBeTruthy();
  });
});
