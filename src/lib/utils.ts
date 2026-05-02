import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Ito yung helper function para sa pag-combine ng Tailwind class names nang walang conflict.
// Ang clsx ay para sa conditional classes, ang twMerge naman ay para i-resolve ang conflicts
// (halimbawa: "p-2 p-4" magiging "p-4" na lang).
// Ginagamit ito sa buong app: cn("base-class", isActive && "active-class")
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
