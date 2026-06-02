import { useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Folder,
  Leaf,
  LogOut,
  Map,
  MapPin,
  Shield,
  Upload,
  User,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "@contexts/AuthContext";
import { Role } from "@constants/roles";

interface PrivateSidebarProps {
  onNavigate: (page: string) => void;
  currentPage: string;
}

const NAV_ITEMS = [
  { id: "collections", label: "Colecciones", icon: Folder },
  { id: "occurrences", label: "Ocurrencias", icon: MapPin },
  { id: "taxon", label: "Taxon", icon: Leaf },
  { id: "map", label: "Mapa", icon: Map },
];

const SUPERUSER_ITEMS = [
  { id: "uploads", label: "Cargas", icon: Upload },
];

const BG = "#751a1d";
const BG_HOVER = "#8c2023";
const BG_ACTIVE = "#5a1416";
const TEXT_MUTED = "rgba(255,255,255,0.65)";

export function PrivateSidebar({ onNavigate, currentPage }: PrivateSidebarProps) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isSuperuser = user?.role === Role.Admin;
  const isAdmin = user?.role === Role.InstitutionAdmin || user?.role === Role.Admin;
  const items = [
    ...NAV_ITEMS,
    ...(isSuperuser ? SUPERUSER_ITEMS : []),
    ...(isAdmin ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
  ];

  const handleProfileNavigate = () => onNavigate("profile");
  const handleLogout = () => { logout(); onNavigate("home"); };

  // Text fade: when collapsing, hide fast (no delay); when expanding, appear after width opens
  const labelStyle: React.CSSProperties = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : undefined,
    transform: collapsed ? "translateX(-6px)" : "translateX(0)",
    transition: collapsed
      ? "opacity 150ms ease, transform 150ms ease, width 300ms ease"
      : "opacity 200ms ease 180ms, transform 200ms ease 180ms",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    flexShrink: 0,
  };

  return (
    <aside
      className="relative flex flex-col shrink-0 transition-[width] duration-300 ease-in-out"
      style={{ width: collapsed ? "64px" : "220px", background: BG }}
    >
      {/* Toggle arrow — rotates smoothly */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md border border-gray-200 hover:bg-gray-100 transition-colors"
        style={{ top: "34px", right: "-12px", transform: "translateY(-50%)" }}
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
      >
        <ChevronLeft
          className="h-3.5 w-3.5 text-gray-600"
          style={{
            transition: "transform 300ms ease",
            transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 shrink-0" style={{ height: "68px" }}>
        <Leaf className="h-7 w-7 shrink-0 text-white" />
        <span
          className="text-base font-semibold text-white leading-tight"
          style={labelStyle}
        >
          Herbario Digital
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 shrink-0" style={{ height: "1px", background: "rgba(255,255,255,0.2)" }} />

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 py-3 flex-1 min-h-0 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id || currentPage.startsWith(item.id + "-");

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                background: active ? BG_ACTIVE : "transparent",
                transition: "background 150ms ease",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: collapsed ? 0 : "0.75rem",
                paddingLeft: collapsed ? 0 : "0.75rem",
                paddingRight: collapsed ? 0 : "0.75rem",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = BG_HOVER;
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.background = active ? BG_ACTIVE : "transparent";
              }}
              className="flex items-center w-full rounded-lg py-3 text-sm font-medium text-white"
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span style={labelStyle}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 shrink-0" style={{ height: "1px", background: "rgba(255,255,255,0.2)" }} />

      {/* Footer */}
      <div className="px-3 py-3 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center w-full rounded-lg py-2 transition-colors"
              style={{
                gap: collapsed ? 0 : "0.75rem",
                paddingLeft: collapsed ? 0 : "0.75rem",
                paddingRight: collapsed ? 0 : "0.75rem",
                justifyContent: collapsed ? "center" : "flex-start",
                transition: "gap 300ms ease, padding 300ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = BG_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{ background: BG_ACTIVE, color: "white" }}
                >
                  {user?.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div
                className="flex flex-col overflow-hidden text-left"
                style={labelStyle}
              >
                <span className="text-sm font-medium text-white truncate">{user?.username}</span>
                <span className="text-xs truncate" style={{ color: TEXT_MUTED }}>{user?.email}</span>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" align="start" className="w-52 mb-1">
            <DropdownMenuItem onClick={handleProfileNavigate} className="gap-3 cursor-pointer">
              <User className="h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="gap-3 cursor-pointer text-red-600 focus:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
