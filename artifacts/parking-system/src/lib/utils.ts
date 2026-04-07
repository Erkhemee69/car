import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ЭНЭ МӨРИЙГ НЭМЭЭРЭЙ:
export const API_URL = "https://car-89l8.onrender.com/api";