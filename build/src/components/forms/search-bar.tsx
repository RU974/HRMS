import { Search } from "lucide-react";
import type { FormEvent } from "react";
import { cn } from "@/utils/cn";
import { FormInput } from "./form-input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, onSubmit, placeholder = "Search...", className }: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className={cn("relative max-w-sm", className)}>
      <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" />
      <FormInput
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
    </form>
  );
}


