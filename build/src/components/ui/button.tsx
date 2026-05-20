import { cva } from "class-variance-authority";
import { cn } from "@/utils/cn";

const styles = cva("inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition", {
  variants: {
    variant: {
      primary: "bg-[var(--primary)] text-white hover:opacity-90",
      ghost: "hover:bg-[var(--border)]/40",
      outline: "border border-[var(--border)]"
    }
  },
  defaultVariants: {
    variant: "primary"
  }
});

export function Button({ className, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  return <button className={cn(styles({ variant }), className)} {...props} />;
}


