import {
  Briefcase, Laptop, Wrench, ShoppingBag, TrendingUp, PlusCircle, Utensils, Home, Car, HeartPulse, Dumbbell,
  PartyPopper, Repeat, GraduationCap, ShoppingCart, Cpu, CreditCard, Circle, Gift, PiggyBank, Plane, Smartphone,
  Shirt, Baby, Dog, Fuel, Bus, Wifi, Zap, Droplets, Tv, Music, Gamepad2, Coffee, Pill, BookOpen, Target, Landmark,
  Wallet, Banknote, Building2, Receipt, Scissors, Sparkles, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, laptop: Laptop, wrench: Wrench, "shopping-bag": ShoppingBag, "trending-up": TrendingUp,
  "plus-circle": PlusCircle, utensils: Utensils, home: Home, car: Car, "heart-pulse": HeartPulse, dumbbell: Dumbbell,
  "party-popper": PartyPopper, repeat: Repeat, "graduation-cap": GraduationCap, "shopping-cart": ShoppingCart,
  cpu: Cpu, "credit-card": CreditCard, circle: Circle, gift: Gift, "piggy-bank": PiggyBank, plane: Plane,
  smartphone: Smartphone, shirt: Shirt, baby: Baby, dog: Dog, fuel: Fuel, bus: Bus, wifi: Wifi, zap: Zap,
  droplets: Droplets, tv: Tv, music: Music, gamepad: Gamepad2, coffee: Coffee, pill: Pill, book: BookOpen,
  target: Target, landmark: Landmark, wallet: Wallet, banknote: Banknote, building: Building2, receipt: Receipt,
  scissors: Scissors, sparkles: Sparkles,
};

export const ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ icon, color, size = "md", className }: { icon: string; color: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = ICONS[icon] ?? Circle;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-11 rounded-xl [&_svg]:size-5",
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon />
    </span>
  );
}
