import { Search } from "lucide-react";
import { FormInput } from "./form-input";

export function SearchBar() {
  return (
    <div className="relative max-w-sm">
      <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" />
      <FormInput placeholder="Search..." className="pl-9" />
    </div>
  );
}


