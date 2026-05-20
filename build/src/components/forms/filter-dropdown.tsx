import { SelectDropdown } from "./select-dropdown";

export function FilterDropdown() {
  return (
    <SelectDropdown className="max-w-40">
      <option>All</option>
      <option>Active</option>
      <option>Pending</option>
    </SelectDropdown>
  );
}


