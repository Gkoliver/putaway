export function parseLocationPath(label: string): string[] {
  return label
    .split(/\s*→\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function validateEditForm(input: {
  name: string;
  quantityText: string;
  locationLabel: string;
}): string | null {
  if (!input.name.trim()) return "Type an item name.";
  if (input.quantityText.trim() === "") return "Quantity must be zero or more.";
  const quantity = Number(input.quantityText);
  if (!Number.isInteger(quantity) || quantity < 0) return "Quantity must be zero or more.";
  if (parseLocationPath(input.locationLabel).length === 0) return "Type a location.";
  return null;
}

export function validateAddForm(input: {
  name: string;
  quantityText: string;
  locationId: string | null;
}): string | null {
  if (!input.name.trim()) return "Type an item name.";
  if (input.quantityText.trim() === "") return "Quantity must be at least 1.";
  const quantity = Number(input.quantityText);
  if (!Number.isInteger(quantity) || quantity < 1) return "Quantity must be at least 1.";
  if (!input.locationId) return "Pick a place.";
  return null;
}
