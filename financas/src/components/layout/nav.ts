import {
  ArrowLeftRight, BarChart3, CalendarDays, CreditCard, Landmark, LayoutDashboard, PieChart, Repeat, Settings, Target,
  TrendingDown, TrendingUp, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Principal",
    items: [
      { href: "/", label: "Visão geral", icon: LayoutDashboard },
      { href: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
      { href: "/receitas", label: "Receitas", icon: TrendingUp },
      { href: "/despesas", label: "Despesas", icon: TrendingDown },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
      { href: "/contas", label: "Contas", icon: Landmark },
    ],
  },
  {
    label: "Planejamento",
    items: [
      { href: "/orcamento", label: "Orçamento", icon: PieChart },
      { href: "/recorrentes", label: "Contas fixas", icon: Repeat },
      { href: "/metas", label: "Metas", icon: Target },
      { href: "/calendario", label: "Calendário", icon: CalendarDays },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
